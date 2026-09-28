<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
if (in_array('--help', $argv, true)) {
    fwrite(STDOUT, "Usage: php server_smoke.php [--transactional]\nDefault: read-only API/storage checks. Optional synthetic workflows always roll back. Their tiny PNG files are deleted by CFile::Delete before rollback; no B24 requests are sent.\n");
    exit(0);
}

foreach (array('NO_KEEP_STATISTIC', 'NOT_CHECK_PERMISSIONS', 'NO_AGENT_CHECK', 'NO_AGENT_STATISTIC', 'BX_CRONTAB') as $flag) {
    if (!defined($flag)) {
        define($flag, true);
    }
}
$candidates = array_filter(array(getenv('SUPERWINDOW_DOCUMENT_ROOT'), dirname(__DIR__, 5), dirname(__DIR__, 4)));
foreach ($candidates as $candidate) {
    $prolog = rtrim($candidate, '/\\') . '/bitrix/modules/main/include/prolog_before.php';
    if (is_file($prolog)) {
        $_SERVER['DOCUMENT_ROOT'] = rtrim($candidate, '/\\');
        require $prolog;
        break;
    }
}
if (!defined('B_PROLOG_INCLUDED')) {
    fwrite(STDERR, "Set SUPERWINDOW_DOCUMENT_ROOT to the Bitrix web root.\n");
    exit(2);
}
require_once dirname(__DIR__) . '/controllers/LeadController.php';

class SwLeadSmokeAssertion extends RuntimeException
{
    public $diagnostic;

    public function __construct($code, array $diagnostic = array())
    {
        parent::__construct($code);
        $this->diagnostic = $diagnostic;
    }
}

function swSmokeAssert($condition, $code, array $diagnostic = array())
{
    if (!$condition) {
        throw new SwLeadSmokeAssertion($code, $diagnostic);
    }
}

function swSmokeExpectError($callback, $status, $code = null)
{
    try {
        call_user_func($callback);
    } catch (SwLeadApiException $error) {
        swSmokeAssert($error->getHttpStatus() === $status, 'unexpected_http_status');
        swSmokeAssert($code === null || $error->getErrorCode() === $code, 'unexpected_error_code');
        return;
    }
    throw new RuntimeException('expected_error_not_raised');
}

function swSmokeRun(&$report, $name, $callback)
{
    try {
        $details = call_user_func($callback);
        $report['checks'][$name] = array_merge(array('success' => true), is_array($details) ? $details : array());
    } catch (Throwable $error) {
        // Never print raw ORM/DB errors, contact data, payloads or tokens.
        $code = $error instanceof SwLeadApiException ? $error->getErrorCode() : get_class($error);
        if ($error instanceof RuntimeException && preg_match('/^[a-z_]{1,80}$/', $error->getMessage())) {
            $code = $error->getMessage();
        }
        $report['checks'][$name] = array('success' => false, 'code' => $code, 'source' => basename($error->getFile()), 'line' => $error->getLine());
        if ($error instanceof Error) {
            $report['checks'][$name]['trace'] = array_map(function ($frame) {
                return array(
                    'source' => isset($frame['file']) ? basename($frame['file']) : null,
                    'line' => isset($frame['line']) ? $frame['line'] : null,
                    'function' => (isset($frame['class']) ? $frame['class'] . '::' : '') . (isset($frame['function']) ? $frame['function'] : ''),
                );
            }, array_slice($error->getTrace(), 0, 5));
        }
        if ($error instanceof SwLeadSmokeAssertion && $error->diagnostic) {
            $report['checks'][$name]['diagnostic'] = $error->diagnostic;
        }
        $report['success'] = false;
    }
}

function swSmokeActor($dealerId)
{
    return array('user_id' => (int)$dealerId, 'dealer_id' => (int)$dealerId, 'is_admin' => false);
}

/**
 * Production service methods nest repository transactions. A smoke outer
 * transaction must never be committed by an inner Bitrix transaction, whose
 * nesting behavior differs across versions. Use SQL savepoints only for the
 * test repository; the one outer Bitrix transaction is always rolled back.
 */
class SwLeadSmokeRepository extends SwLeadRepository
{
    private $savepointSequence = 0;
    public $leadScope = null;

    public function find($blockKey, array $filter = array(), array $order = array(), $limit = 0, $offset = 0)
    {
        if ($blockKey === 'leads' && is_array($this->leadScope)) {
            $filter['@ID'] = $this->leadScope;
        }
        return parent::find($blockKey, $filter, $order, $limit, $offset);
    }

    public function transaction($callback)
    {
        $connection = \Bitrix\Main\Application::getConnection();
        $savepoint = 'sw_smoke_' . (++$this->savepointSequence);
        $connection->queryExecute('SAVEPOINT ' . $savepoint);
        try {
            $result = call_user_func($callback);
            $connection->queryExecute('RELEASE SAVEPOINT ' . $savepoint);
            return $result;
        } catch (Throwable $error) {
            $connection->queryExecute('ROLLBACK TO SAVEPOINT ' . $savepoint);
            $connection->queryExecute('RELEASE SAVEPOINT ' . $savepoint);
            throw $error;
        }
    }

    public function locked($blockKey, $id, $callback)
    {
        return $this->transaction(function () use ($blockKey, $id, $callback) {
            return call_user_func($callback, $this->getForUpdate($blockKey, $id));
        });
    }
}

class SwLeadSmokeOutbox extends SwLeadB24Outbox
{
    public function flush()
    {
        throw new RuntimeException('network_transport_disabled_in_smoke');
    }
}

class SwLeadSmokeImportNotifications extends SwLeadNotificationService
{
    public $broadcasts = 0;

    public function broadcastNewLead(array $lead)
    {
        // A synthetic import must not resolve or notify real eligible dealers.
        ++$this->broadcasts;
        return 0;
    }
}

$report = array('success' => true, 'mode' => in_array('--transactional', $argv, true) ? 'transactional' : 'read-only', 'checks' => array());
$repository = new SwLeadRepository();
$service = new SwLeadService($repository, new SwLeadAuditService($repository), new SwLeadNotificationService($repository), new SwLeadSmokeOutbox($repository));
$blocks = array_keys((array)swLeadConfig('hlblocks'));
$now = swLeadUtcNow();

foreach ($blocks as $block) {
    swSmokeRun($report, 'storage_' . $block, function () use ($repository, $block) {
        $meta = $repository->metadata($block);
        $rows = $repository->find($block, array(), array('ID' => 'ASC'), 5);
        return array('count' => $repository->count($block), 'ids' => array_column($rows, 'id'), 'fieldCount' => count($meta['available']));
    });
}

swSmokeRun($report, 'lead_legacy_filters', function () use ($repository, $now) {
    $counts = array();
    foreach (array('measurement', 'installation', 'delivery') as $type) {
        $filter = array('=type' => $type);
        $counts[$type] = $repository->count('leads', $filter);
        $rows = $repository->find('leads', $filter, array('expire_at' => 'ASC', 'budget' => 'DESC'), 5);
        foreach ($rows as $row) {
            swSmokeAssert($row['type'] === $type, 'legacy_type_not_normalized');
        }
    }
    foreach (array('expired' => array('<=expire_at' => $now), 'budget' => array('>=budget' => 0, '<=budget' => 1000000000), 'deadline' => array('<=schedule_deadline' => $now)) as $name => $filter) {
        $counts[$name] = $repository->count('leads', $filter);
        $repository->find('leads', $filter, array('ID' => 'ASC'), 5);
    }
    return array('counts' => $counts);
});

swSmokeRun($report, 'lead_visibility', function () use ($repository, $service) {
    $available = $repository->find('leads', array('=status' => 'available'), array('ID' => 'ASC'), 20);
    foreach ($available as $row) {
        $details = $service->getLead((string)$row['id'], swSmokeActor(-1));
        swSmokeAssert(!empty($details['customer']['isMasked']), 'public_contacts_not_masked');
        swSmokeAssert(empty($details['location']['address']) && empty($details['location']['latitude']) && empty($details['attachments']) && empty($details['factoryNotes']), 'public_private_fields_visible');
    }
    $owned = $repository->find('leads', array('>dealer_id' => 0, '!status' => 'available'), array('ID' => 'ASC'), 20);
    foreach ($owned as $row) {
        $details = $service->getLead((string)$row['id'], swSmokeActor($row['dealer_id']));
        swSmokeAssert(empty($details['customer']['isMasked']), 'owner_contacts_still_masked');
        swSmokeExpectError(function () use ($service, $row) { $service->getLead((string)$row['id'], swSmokeActor(-1)); }, 403);
    }
    return array('maskedCount' => count($available), 'ownerCount' => count($owned));
});

swSmokeRun($report, 'work_legacy_filters_and_ownership', function () use ($repository, $service, $now) {
    $counts = array();
    foreach (array('installation', 'delivery') as $type) {
        $filter = array('=type' => $type);
        $counts[$type] = $repository->count('work_orders', $filter);
        $repository->find('work_orders', $filter, array('planned_at' => 'ASC'), 5);
    }
    $counts['planned'] = $repository->count('work_orders', array('<=planned_at' => $now->modify('+1 day')));
    $rows = $repository->find('work_orders', array('>dealer_id' => 0), array('ID' => 'ASC'), 20);
    foreach ($rows as $row) {
        $service->getWorkOrder((string)$row['id'], swSmokeActor($row['dealer_id']));
        swSmokeExpectError(function () use ($service, $row) { $service->getWorkOrder((string)$row['id'], swSmokeActor(-1)); }, 403);
        foreach (array('active', 'archive') as $scope) {
            $service->listWorkOrders(array('scope' => $scope, 'type' => $row['type']), swSmokeActor($row['dealer_id']));
        }
    }
    return array('counts' => $counts, 'ownerCount' => count($rows));
});

if ($report['mode'] === 'transactional' && $report['success']) {
    swSmokeRun($report, 'synthetic_workflows_rolled_back', function () use ($blocks) {
        $connection = \Bitrix\Main\Application::getConnection();
        $repository = new SwLeadSmokeRepository();
        $beforeCounts = array();
        foreach ($blocks as $block) {
            $table = $repository->metadata($block)['table'];
            $engine = $connection->query("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '" . $connection->getSqlHelper()->forSql($table) . "'")->fetch();
            swSmokeAssert($engine && strtoupper((string)$engine['ENGINE']) === 'INNODB', 'transactional_storage_required');
            $beforeCounts[$block] = $repository->count($block);
        }
        $outbox = new SwLeadSmokeOutbox($repository);
        $service = new SwLeadService($repository, new SwLeadAuditService($repository), new SwLeadNotificationService($repository), $outbox);
        $actor = swSmokeActor(1900000000);
        $now = swLeadUtcNow();
        $date = (new DateTimeImmutable('today'))->format('Y-m-d');
        $seedIds = array();
        $workIds = array();
        $savedFileIds = array();
        $savedFilePaths = array();
        $scenarioCount = 0;
        $connection->startTransaction();
        try {
            foreach (array('measurement', 'installation', 'delivery') as $type) {
                do {
                    $externalId = (string)random_int(1800000000, 1899999999);
                } while ($repository->findOne('leads', array('=b24_id' => $externalId)));
                $leadId = $repository->add('leads', array(
                    'b24_id' => $externalId, 'type' => $type, 'status' => 'available',
                    'title' => 'SMOKE ROLLBACK', 'product_type' => 'SMOKE',
                    'customer_name' => 'SMOKE', 'phone' => '70000000000', 'address' => 'SMOKE',
                    'budget' => 10000, 'reward' => 1000, 'dealer_id' => null,
                    'created_at' => $now, 'updated_at' => $now, 'published_at' => $now,
                    'expire_at' => $now->modify('+2 days'), 'version' => 1,
                ));
                $seedIds[] = $leadId;
                $takingActor = $type === 'installation' ? swSmokeActor(1900000001) : $actor;
                $taken = $service->takeLead((string)$leadId, array('expectedVersion' => 1), $takingActor);
                swSmokeAssert($taken['status'] === 'assigned' && empty($taken['customer']['isMasked']), 'take_failed');
                $repeat = $service->takeLead((string)$leadId, array('expectedVersion' => 1), $takingActor);
                swSmokeAssert($repeat['version'] === $taken['version'], 'take_retry_not_idempotent');
                swSmokeExpectError(function () use ($service, $leadId) { $service->takeLead((string)$leadId, array(), swSmokeActor(-1)); }, 409);
                swSmokeExpectError(function () use ($service, $leadId, $takingActor) { $service->scheduleLead((string)$leadId, array('date' => '2000-01-01'), $takingActor); }, 422);
                $existingWorkId = null;
                if ($type === 'installation') {
                    $existingWorkId = $repository->add('work_orders', array('b24_id' => $externalId, 'lead_id' => $leadId, 'dealer_id' => $takingActor['dealer_id'], 'type' => $type, 'status' => 'assigned', 'customer_name' => 'SMOKE', 'version' => 1, 'created_at' => $now, 'updated_at' => $now));
                    $repository->update('leads', $leadId, array('taken_at' => $now->modify('-25 hours'), 'schedule_deadline' => $now->modify('-1 hour')));
                    $cron = new SwLeadCronService($repository, new SwLeadAuditService($repository), new SwLeadNotificationService($repository), $outbox, $service);
                    $cronStats = array('returnedLeads' => 0, 'errors' => array());
                    $repository->leadScope = array($leadId);
                    try {
                        // Invoke only the return phase, scoped to this synthetic ID;
                        // never run the real global deadline/outbox worker here.
                        (new ReflectionMethod($cron, 'returnUnscheduledLeads'))->invokeArgs($cron, array($now, &$cronStats));
                    } finally {
                        $repository->leadScope = null;
                    }
                    swSmokeAssert($cronStats['returnedLeads'] === 1 && !$cronStats['errors'], 'legacy_deadline_return_failed');
                    $cancelled = $repository->get('work_orders', $existingWorkId);
                    swSmokeAssert($cancelled['status'] === 'cancelled' && $cancelled['cancellation_reason'] === 'Лид возвращён: дата не назначена за 24 часа.', 'legacy_work_not_cancelled');
                    $returned = $repository->get('leads', $leadId);
                    swSmokeAssert($returned['status'] === 'available' && empty($returned['dealer_id']), 'legacy_lead_not_returned');
                    $taken = $service->takeLead((string)$leadId, array('expectedVersion' => $returned['version']), $actor);
                }
                $scheduled = $service->scheduleLead((string)$leadId, array('date' => $date, 'timeFrom' => '09:00', 'timeTo' => '12:00', 'expectedVersion' => $taken['version']), $actor);
                if ($type === 'measurement') {
                    swSmokeAssert($scheduled['status'] === 'in_work', 'measurement_schedule_failed');
                    $context = $service->getMeasurementOrderContext((string)$leadId, array(), $actor);
                    swSmokeAssert($context['leadId'] === $leadId, 'measurement_context_failed');
                    swSmokeExpectError(function () use ($service, $leadId, $actor) { $service->convertLead((string)$leadId, array('orderId' => '-1'), $actor, true); }, 422);
                } else {
                    swSmokeAssert($scheduled['status'] === 'converted' && !empty($scheduled['convertedWorkOrderId']), 'work_conversion_failed');
                    $workId = (int)$scheduled['convertedWorkOrderId'];
                    $workIds[] = $workId;
                    swSmokeAssert($existingWorkId === null || $existingWorkId === $workId, 'existing_work_not_reused');
                    $work = $service->getWorkOrder((string)$workId, $actor);
                    swSmokeAssert($work['plannedVisit']['date'] === $date, 'work_date_not_set');
                    swSmokeAssert((int)$work['dealerId'] === $actor['dealer_id'], 'legacy_work_not_reassigned');
                    $work = $service->updateWorkOrder((string)$workId, array('status' => 'in_work', 'expectedVersion' => $work['version']), $actor);
                    swSmokeAssert($work['status'] === 'in_work', 'work_start_failed');
                    swSmokeExpectError(function () use ($service, $workId, $actor) { $service->completeWorkOrder((string)$workId, array(), array(), $actor); }, 422, 'validation_error');
                    swSmokeExpectError(function () use ($service, $workId, $actor) { $service->completeWorkOrder((string)$workId, array('actualDate' => (new DateTimeImmutable('tomorrow'))->format('Y-m-d')), array(), $actor); }, 422, 'validation_error');
                    swSmokeExpectError(function () use ($service, $workId, $actor, $date) { $service->completeWorkOrder((string)$workId, array('actualDate' => $date), array(), $actor); }, 422, 'photos_required');
                    $photoIds = swLeadSaveCompletionPhotos(array('photos' => array(array(
                        'name' => 'smoke-rollback.png',
                        'dataUrl' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
                    ))));
                    $savedFileIds = array_merge($savedFileIds, $photoIds);
                    foreach ($photoIds as $photoId) {
                        $file = CFile::GetFileArray($photoId);
                        swSmokeAssert(is_array($file) && !empty($file['SRC']), 'saved_photo_metadata_missing');
                        $savedFilePaths[$photoId] = $_SERVER['DOCUMENT_ROOT'] . '/' . ltrim($file['SRC'], '/');
                        swSmokeAssert(is_file($savedFilePaths[$photoId]), 'saved_photo_file_missing');
                    }
                    $completed = $service->completeWorkOrder((string)$workId, array('actualDate' => $date, 'expectedVersion' => $work['version']), $photoIds, $actor);
                    $storedWork = $repository->get('work_orders', $workId);
                    $workMeta = $repository->metadata('work_orders');
                    $workClass = $workMeta['class'];
                    $rawWork = $workClass::getList(array('select' => array('ID', 'UF_PHOTOS', 'UF_FACT_DATE'), 'filter' => array('=ID' => $workId)))->fetch();
                    $rawPhotos = isset($rawWork['UF_PHOTOS']) ? $rawWork['UF_PHOTOS'] : null;
                    $diagnostic = array(
                        'workId' => $workId,
                        'status' => isset($completed['status']) ? $completed['status'] : null,
                        'expectedDate' => $date,
                        'actualDate' => isset($completed['actualDate']) ? $completed['actualDate'] : null,
                        'expectedPhotoIds' => $photoIds,
                        'storedPhotoIds' => isset($storedWork['photo_ids']) ? $storedWork['photo_ids'] : null,
                        'presentedPhotoIds' => isset($completed['photos']) ? array_column($completed['photos'], 'id') : null,
                        'rawPhotoType' => gettype($rawPhotos),
                        'rawPhotoArrayCount' => is_array($rawPhotos) ? count($rawPhotos) : null,
                        'rawPhotoSerialized' => is_string($rawPhotos) && preg_match('/^a:\d+:\{/', $rawPhotos) === 1,
                        'savedFilesStillExist' => array_map(function ($id) { return (bool)CFile::GetByID($id)->Fetch(); }, $photoIds),
                    );
                    swSmokeAssert($completed['status'] === 'done', 'positive_completion_status_failed', $diagnostic);
                    swSmokeAssert(isset($completed['actualDate']) && $completed['actualDate'] === $date, 'positive_completion_date_failed', $diagnostic);
                    swSmokeAssert(isset($completed['photos']) && count($completed['photos']) === count($photoIds), 'positive_completion_photos_failed', $diagnostic);
                    $completedIds = array_map('intval', array_column($completed['photos'], 'id'));
                    swSmokeAssert($completedIds === $photoIds, 'completion_photo_ids_mismatch');
                    $completedAgain = $service->completeWorkOrder((string)$workId, array('actualDate' => $date), array(), $actor);
                    swSmokeAssert($completedAgain['version'] === $completed['version'], 'completion_retry_not_idempotent');
                    list($archive) = $service->listWorkOrders(array('scope' => 'archive', 'type' => $type), $actor);
                    swSmokeAssert(in_array((string)$workId, array_column($archive, 'id'), true), 'work_archive_missing');
                }
                ++$scenarioCount;
            }
            list($leadArchive) = $service->listLeads(array('scope' => 'archive'), $actor);
            swSmokeAssert(count($leadArchive) === 2, 'lead_archive_missing');

            // Exercise the actual create-only sink on real HL storage, still
            // inside the same outer rollback. Suppress new-lead broadcasts.
            do {
                $externalId = (string)random_int(1800000000, 1899999999);
            } while ($repository->findOne('leads', array('=b24_id' => $externalId)));
            $importNotifications = new SwLeadSmokeImportNotifications($repository);
            $importService = new SwLeadService($repository, new SwLeadAuditService($repository), $importNotifications, $outbox);
            $importInput = array('b24EntityId' => $externalId, 'leadType' => 'measure', 'title' => 'SMOKE DISCOVERY', 'expiresAt' => $now->modify('+2 days')->format('c'));
            $created = $importService->importDiscoveredLead($importInput, 'smoke_discovery_' . $externalId);
            swSmokeAssert(!empty($created['created']) && !empty($created['lead']['id']), 'discovery_create_failed');
            $importedId = (int)$created['lead']['id'];
            $seedIds[] = $importedId;
            $importService->takeLead((string)$importedId, array('expectedVersion' => 1), $actor);
            $accepted = $repository->get('leads', $importedId);
            $countsBeforeRepeat = array();
            foreach ($blocks as $block) {
                $countsBeforeRepeat[$block] = $repository->count($block);
            }
            $importInput['title'] = 'SMOKE MUST NOT REPLACE';
            $importInput['leadType'] = 'delivery';
            $importInput['dealerId'] = 1900000001;
            $repeated = $importService->importDiscoveredLead($importInput, 'smoke_discovery_changed_' . $externalId);
            $preserved = $repository->get('leads', $importedId);
            swSmokeAssert(empty($repeated['created']) && !empty($repeated['skipped']), 'discovery_repeat_not_skipped');
            swSmokeAssert($preserved === $accepted && (int)$preserved['dealer_id'] === $actor['dealer_id'], 'discovery_repeat_changed_owner_or_snapshot');
            swSmokeAssert($importNotifications->broadcasts === 1, 'discovery_repeat_broadcasted');
            foreach ($blocks as $block) {
                swSmokeAssert($repository->count($block) === $countsBeforeRepeat[$block], 'discovery_repeat_created_rows');
            }
        } finally {
            try {
                // Only IDs returned by this run's uploader are deleted. Delete
                // while b_file rows still exist so Bitrix can remove physical
                // originals/thumbnails, then roll back all database mutations.
                foreach ($savedFileIds as $photoId) {
                    CFile::Delete($photoId);
                }
            } finally {
                $connection->rollbackTransaction();
            }
        }
        foreach ($seedIds as $id) {
            swSmokeAssert($repository->get('leads', $id) === null, 'lead_rollback_failed');
        }
        foreach ($workIds as $id) {
            swSmokeAssert($repository->get('work_orders', $id) === null, 'work_rollback_failed');
        }
        foreach ($savedFileIds as $photoId) {
            swSmokeAssert(!CFile::GetByID($photoId)->Fetch(), 'photo_database_rollback_failed');
            swSmokeAssert(!isset($savedFilePaths[$photoId]) || !is_file($savedFilePaths[$photoId]), 'photo_file_cleanup_failed');
        }
        foreach ($blocks as $block) {
            swSmokeAssert($repository->count($block) === $beforeCounts[$block], 'row_count_changed_after_rollback');
        }
        return array('scenarioCount' => $scenarioCount, 'discoveryCreateOnlyVerified' => true, 'leadIds' => $seedIds, 'workIds' => $workIds, 'fileIds' => $savedFileIds, 'rollbackVerified' => true, 'fileCleanupVerified' => true, 'networkCalls' => 0, 'filesCreatedAndDeleted' => count($savedFileIds));
    });
}

fwrite($report['success'] ? STDOUT : STDERR, json_encode($report, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n");
exit($report['success'] ? 0 : 1);
