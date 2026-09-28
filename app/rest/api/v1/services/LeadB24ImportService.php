<?php

/** Read published CRM items, creating only external IDs absent from the portal. */
class SwLeadB24ImportService
{
    private $repository;
    private $leads;
    private $listReader;
    private $itemReader;
    private $stateReader;
    private $stateWriter;
    private $transportLoaded = false;

    public function __construct(SwLeadRepository $repository, SwLeadService $leads, $listReader = null, $itemReader = null, $stateReader = null, $stateWriter = null)
    {
        $this->repository = $repository;
        $this->leads = $leads;
        $this->listReader = $listReader;
        $this->itemReader = $itemReader;
        $this->stateReader = $stateReader;
        $this->stateWriter = $stateWriter;
    }

    public function getStatus()
    {
        return array_merge($this->readState(), array('enabled' => (bool)swLeadConfig('b24.import.enabled', false)));
    }

    public function run($dryRun = false)
    {
        $service = $this;
        return $this->repository->withNamedLock('b24_import_poll', 'main', function () use ($service, $dryRun) {
            return $service->poll((bool)$dryRun);
        }, 'b24_import_busy');
    }

    private function poll($dryRun)
    {
        $state = $this->readState();
        $enabled = (bool)swLeadConfig('b24.import.enabled', false);
        $stats = array(
            'success' => true, 'enabled' => $enabled, 'dryRun' => $dryRun, 'skipped' => false,
            'pages' => 0, 'listed' => 0, 'checked' => 0, 'created' => 0,
            'wouldCreate' => 0, 'existing' => 0, 'ineligible' => 0,
            'skipReasons' => array(), 'errors' => array(), 'limited' => false,
            'cursor' => $state['cursor'], 'nextAttemptAt' => $state['nextAttemptAt'],
        );
        if (!$dryRun && !$enabled) {
            $stats['skipped'] = true;
            $stats['reason'] = 'disabled';
            return $stats;
        }
        if (!$dryRun && $state['nextAttemptAt'] !== null && strtotime($state['nextAttemptAt']) > time()) {
            $stats['skipped'] = true;
            $stats['reason'] = 'backoff';
            return $stats;
        }

        $category = (int)swLeadConfig('b24.import.category_id', 75);
        $published = trim((string)swLeadConfig('b24.stages.available', 'DT1058_75:PREPARATION'));
        $maxPages = max(1, min(20, (int)swLeadConfig('b24.import.max_pages', 2)));
        $maxItems = max(1, min(100, (int)swLeadConfig('b24.import.max_items', 20)));
        $deadline = microtime(true) + max(1, min(120, (int)swLeadConfig('b24.import.time_budget_seconds', 20)));
        $cursor = $state['cursor'];
        $failedCursor = null;
        $finished = false;

        // A saved cursor resumes a bounded descending sweep. At the end it resets
        // to zero, so older CRM items newly moved to Published are found as well.
        while ($stats['pages'] < $maxPages && !$finished) {
            if (microtime(true) >= $deadline || $stats['checked'] >= $maxItems) {
                $stats['limited'] = true;
                break;
            }
            $pageCursor = $cursor;
            $filter = array('=categoryId' => $category, '=stageId' => $published);
            if ($cursor > 0) {
                $filter['<id'] = $cursor;
            }
            try {
                $response = $this->listItems(array('filter' => $filter, 'start' => -1));
                if (!is_array($response) || empty($response['success']) || !isset($response['data']['items']) || !is_array($response['data']['items'])) {
                    throw new RuntimeException('b24_list_failed');
                }
                $items = array_values($response['data']['items']);
                $this->validatePage($items, $pageCursor);
            } catch (Throwable $error) {
                $stats['errors'][] = array('code' => $this->safeCode($error, 'b24_list_failed'));
                if ($failedCursor === null) { $failedCursor = $pageCursor; }
                break;
            }
            ++$stats['pages'];
            $stats['listed'] += count($items);
            if (!$items) {
                $cursor = 0;
                $finished = true;
                break;
            }
            $pageComplete = true;
            foreach ($items as $item) {
                if (microtime(true) >= $deadline) {
                    $stats['limited'] = true;
                    $pageComplete = false;
                    break;
                }
                $id = (int)$item['id'];
                try {
                    // No network detail request and no version/audit churn for
                    // existing IDs, including assigned and terminal records.
                    if ($this->repository->findOne('leads', array('=b24_id' => (string)$id))) {
                        ++$stats['existing'];
                        $cursor = $id;
                        continue;
                    }
                    if ($stats['checked'] >= $maxItems) {
                        $stats['limited'] = true;
                        $pageComplete = false;
                        break;
                    }
                    ++$stats['checked'];
                    $fresh = $this->getItem($id);
                    if (!is_array($fresh) || empty($fresh['success']) || !isset($fresh['data']['item']) || !is_array($fresh['data']['item'])) {
                        throw new RuntimeException('b24_get_failed');
                    }
                    $remote = $fresh['data']['item'];
                    $reason = $this->eligibilityReason($remote, $id, $category, $published);
                    if ($reason !== '') {
                        ++$stats['ineligible'];
                        $stats['skipReasons'][$reason] = isset($stats['skipReasons'][$reason]) ? $stats['skipReasons'][$reason] + 1 : 1;
                        $cursor = $id;
                        continue;
                    }
                    try {
                        $normalized = $this->normalizeItem($remote, $id);
                        $this->leads->validateDiscoveredLead($normalized);
                    } catch (SwLeadApiException $error) {
                        if ($error->getHttpStatus() !== 422) { throw $error; }
                        ++$stats['ineligible'];
                        $reason = 'invalid_source_value';
                        $stats['skipReasons'][$reason] = isset($stats['skipReasons'][$reason]) ? $stats['skipReasons'][$reason] + 1 : 1;
                        $cursor = $id;
                        continue;
                    }
                    if ($dryRun) {
                        ++$stats['wouldCreate'];
                    } else {
                        $key = 'b24_discovery:' . $id . ':' . hash('sha256', swLeadJsonEncode($normalized));
                        // The second existence check is inside the shared import
                        // lock/transaction; another process may have won the race.
                        $result = $this->leads->importDiscoveredLead($normalized, $key);
                        if (!empty($result['created'])) {
                            ++$stats['created'];
                        } else {
                            ++$stats['existing'];
                        }
                    }
                    $cursor = $id;
                } catch (Throwable $error) {
                    $stats['errors'][] = array('id' => $id, 'code' => $this->safeCode($error, 'b24_item_failed'));
                    if ($failedCursor === null) { $failedCursor = $pageCursor; }
                    // Retry this page later, while giving its remaining items a
                    // chance now. Only safe numeric IDs/error codes are retained.
                    $cursor = $id;
                }
            }
            if (!$pageComplete) {
                break;
            }
            if (count($items) < 50) {
                $cursor = 0;
                $finished = true;
            }
        }
        if (!$finished && $stats['pages'] >= $maxPages) {
            $stats['limited'] = true;
        }
        $stats['cursor'] = $failedCursor !== null ? $failedCursor : $cursor;
        $stats['success'] = empty($stats['errors']);
        $failures = $stats['errors'] ? $state['failures'] + 1 : 0;
        $stats['nextAttemptAt'] = $failures > 0 ? gmdate('c', time() + min(3600, 60 * (int)pow(2, min($failures, 6)))) : null;
        if (!$dryRun) {
            $state = array(
                'cursor' => $stats['cursor'], 'failures' => $failures,
                'lastRunAt' => gmdate('c'), 'nextAttemptAt' => $stats['nextAttemptAt'],
                'lastSummary' => $this->safeSummary($stats),
            );
            $this->writeState($state);
        }
        return $stats;
    }

    private function validatePage(array $items, $cursor)
    {
        if (count($items) > 50) {
            throw new RuntimeException('b24_page_invalid');
        }
        $previous = $cursor > 0 ? $cursor : PHP_INT_MAX;
        foreach ($items as $item) {
            if (!is_array($item) || !isset($item['id']) || !is_scalar($item['id']) || !ctype_digit((string)$item['id']) || (int)$item['id'] <= 0 || (int)$item['id'] >= $previous) {
                throw new RuntimeException('b24_page_invalid');
            }
            $previous = (int)$item['id'];
        }
    }

    private function eligibilityReason(array $item, $id, $category, $published)
    {
        if (!isset($item['id']) || !is_scalar($item['id']) || !ctype_digit((string)$item['id']) || (int)$item['id'] !== $id) { return 'id_mismatch'; }
        if (!isset($item['categoryId']) || !is_scalar($item['categoryId']) || !ctype_digit((string)$item['categoryId']) || (int)$item['categoryId'] !== $category) { return 'category_mismatch'; }
        if (!isset($item['stageId']) || !is_string($item['stageId']) || $item['stageId'] !== $published) { return 'not_published'; }
        if (isset($item['entityTypeId']) && (!is_scalar($item['entityTypeId']) || !ctype_digit((string)$item['entityTypeId']) || (int)$item['entityTypeId'] !== 1058)) { return 'entity_type_mismatch'; }
        $dealerFound = false;
        $dealer = SwLeadExistingB24Adapter::readSourceField($item, 'dealer_id', $dealerFound);
        if (!$dealerFound) { return 'dealer_field_missing'; }
        if (!in_array($dealer, array(null, false, '', 0, '0', array()), true)) { return 'remote_dealer_assigned'; }
        $type = SwLeadExistingB24Adapter::readSourceField($item, 'type');
        if (!is_scalar($type) || !in_array(SwLeadExistingB24Adapter::normalizeType($type), array('measure', 'install', 'delivery'), true)) { return 'invalid_type'; }
        foreach (array('title', 'customer_name', 'phone', 'address', 'product_type', 'budget', 'reward', 'comment', 'measure_date', 'install_date', 'delivery_date') as $field) {
            $value = SwLeadExistingB24Adapter::readSourceField($item, $field);
            if ($value !== null && !is_scalar($value)) { return 'invalid_source_shape'; }
        }
        $expires = SwLeadExistingB24Adapter::readSourceField($item, 'expire_at');
        if ($expires !== null && $expires !== '' && $expires !== false) {
            if (!is_scalar($expires)) { return 'invalid_expiry'; }
            try {
                $date = new DateTimeImmutable((string)$expires);
                $errors = DateTimeImmutable::getLastErrors();
                if ($errors && ($errors['warning_count'] || $errors['error_count'])) { return 'invalid_expiry'; }
                if ($date->getTimestamp() <= time()) { return 'expired'; }
            } catch (Exception $error) { return 'invalid_expiry'; }
        }
        return '';
    }

    private function normalizeItem(array $item, $id)
    {
        require_once __DIR__ . '/../controllers/B24SyncController.php';
        $normalized = swB24NormalizeImportedItem($item, $id);
        $schedule = array();
        foreach (array('measureDate', 'installDate', 'deliveryDate') as $field) {
            if (array_key_exists($field, $normalized)) {
                $schedule[$field] = $normalized[$field];
                unset($normalized[$field]);
            }
        }
        // CRM suggested dates are source metadata, not fulfillment of the
        // dealer's mandatory scheduling step or the 24-hour return condition.
        $normalized['sourceSchedule'] = $schedule;
        $normalized['sourceCategoryId'] = (int)$item['categoryId'];
        $normalized['sourceStageId'] = (string)$item['stageId'];
        return $normalized;
    }

    private function listItems(array $query)
    {
        if ($this->listReader !== null) { return call_user_func($this->listReader, $query); }
        $this->loadTransport();
        return bitrix24GetLeads($query);
    }

    private function getItem($id)
    {
        if ($this->itemReader !== null) { return call_user_func($this->itemReader, $id); }
        $this->loadTransport();
        return bitrix24GetLead($id);
    }

    private function loadTransport()
    {
        if ($this->transportLoaded) { return; }
        $adapter = new SwLeadExistingB24Adapter($this->repository);
        $adapter->loadTransport();
        if (!function_exists('bitrix24GetLeads') || !function_exists('bitrix24GetLead') || !defined('B24_LEAD_ENTITY_TYPE_ID') || (int)B24_LEAD_ENTITY_TYPE_ID !== 1058) {
            throw new RuntimeException('b24_import_transport_invalid');
        }
        $this->transportLoaded = true;
    }

    private function readState()
    {
        $raw = $this->stateReader !== null ? call_user_func($this->stateReader) : COption::GetOptionString('main', 'superwindow_b24_import_cursor', '');
        if (is_string($raw)) { $raw = json_decode($raw, true); }
        if (is_numeric($raw)) { $raw = array('cursor' => (int)$raw); }
        $raw = is_array($raw) ? $raw : array();
        $state = array('cursor' => max(0, (int)(isset($raw['cursor']) ? $raw['cursor'] : 0)), 'failures' => max(0, (int)(isset($raw['failures']) ? $raw['failures'] : 0)), 'lastRunAt' => null, 'nextAttemptAt' => null, 'lastSummary' => array());
        foreach (array('lastRunAt', 'nextAttemptAt') as $field) {
            if (isset($raw[$field]) && is_string($raw[$field]) && preg_match('/^\d{4}-\d{2}-\d{2}T[0-9:+Z-]+$/D', $raw[$field]) && strtotime($raw[$field]) !== false) {
                $state[$field] = $raw[$field];
            }
        }
        if (isset($raw['lastSummary']) && is_array($raw['lastSummary'])) { $state['lastSummary'] = $this->safeSummary($raw['lastSummary']); }
        return $state;
    }

    private function writeState(array $state)
    {
        if ($this->stateWriter !== null) { call_user_func($this->stateWriter, $state); return; }
        COption::SetOptionString('main', 'superwindow_b24_import_cursor', swLeadJsonEncode($state));
    }

    private function safeSummary(array $stats)
    {
        $summary = array();
        foreach (array('pages', 'listed', 'checked', 'created', 'wouldCreate', 'existing', 'ineligible') as $key) {
            $summary[$key] = max(0, (int)(isset($stats[$key]) ? $stats[$key] : 0));
        }
        $summary['errors'] = array();
        foreach (array_slice(isset($stats['errors']) && is_array($stats['errors']) ? $stats['errors'] : array(), 0, 100) as $error) {
            $safe = array('code' => isset($error['code']) && is_string($error['code']) && preg_match('/^[a-z0-9_]{1,80}$/D', $error['code']) ? $error['code'] : 'b24_import_failed');
            if (!empty($error['id'])) { $safe['id'] = (int)$error['id']; }
            $summary['errors'][] = $safe;
        }
        return $summary;
    }

    private function safeCode(Throwable $error, $fallback)
    {
        $code = $error instanceof SwLeadApiException ? $error->getErrorCode() : $error->getMessage();
        return is_string($code) && preg_match('/^[a-z0-9_]{1,80}$/D', $code) ? $code : $fallback;
    }
}
