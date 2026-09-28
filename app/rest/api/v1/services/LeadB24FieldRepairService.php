<?php

/** Explicit, bounded repair of missing source fields; never a workflow import. */
class SwLeadB24FieldRepairService
{
    private $repository;
    private $audit;
    private $itemReader;
    private $normalizer;

    public function __construct(SwLeadRepository $repository, SwLeadAuditService $audit, $itemReader = null, $normalizer = null)
    {
        $this->repository = $repository;
        $this->audit = $audit;
        $this->itemReader = $itemReader;
        $this->normalizer = $normalizer;
    }

    public function run(array $crmIds, $apply = false)
    {
        $ids = $this->validateIds($crmIds);
        $report = array('success' => true, 'apply' => (bool)$apply, 'requested' => count($ids), 'repaired' => 0, 'wouldRepair' => 0, 'unchanged' => 0, 'errors' => array(), 'results' => array());
        foreach ($ids as $id) {
            try {
                $result = $this->repairOne($id, (bool)$apply);
                $report['results'][] = $result;
                ++$report[$result['status'] === 'repaired' ? 'repaired' : ($result['status'] === 'would_repair' ? 'wouldRepair' : 'unchanged')];
            } catch (Throwable $error) {
                // Never expose remote responses, addresses, tokens or traces.
                $code = $error instanceof SwLeadApiException ? $error->getErrorCode() : 'repair_failed';
                if (!is_string($code) || !preg_match('/^[a-z0-9_]{1,80}$/D', $code)) { $code = 'repair_failed'; }
                $report['errors'][] = array('b24Id' => $id, 'code' => $code);
                $report['success'] = false;
            }
        }
        return $report;
    }

    private function validateIds(array $ids)
    {
        if (!$ids || count($ids) > 20) { $this->fail('validation_error', 422); }
        $validated = array();
        foreach ($ids as $id) {
            if (!is_scalar($id) || !preg_match('/^[1-9][0-9]*$/D', (string)$id) || (string)(int)$id !== (string)$id) { $this->fail('validation_error', 422); }
            $id = (int)$id;
            if (isset($validated[$id])) { $this->fail('validation_error', 422); }
            $validated[$id] = $id;
        }
        return array_values($validated);
    }

    private function repairOne($externalId, $apply)
    {
        $snapshot = $this->repository->findOne('leads', array('=b24_id' => (string)$externalId));
        if (!$snapshot) { $this->fail('repair_lead_not_found', 404); }
        $workSnapshot = $this->linkedWork($snapshot);
        $response = $this->readItem($externalId);
        if (!is_array($response) || empty($response['success']) || !isset($response['data']['item']) || !is_array($response['data']['item'])) { $this->fail('repair_remote_read_failed', 502); }
        $item = $response['data']['item'];
        if (!isset($item['id']) || !is_scalar($item['id']) || (string)$item['id'] !== (string)$externalId) { $this->fail('repair_remote_id_mismatch', 502); }
        if (!isset($item['categoryId']) || !is_scalar($item['categoryId']) || (string)$item['categoryId'] !== (string)(int)swLeadConfig('b24.import.category_id', 75)) { $this->fail('repair_remote_category_mismatch', 422); }
        if (isset($item['entityTypeId']) && (!is_scalar($item['entityTypeId']) || (string)$item['entityTypeId'] !== '1058')) { $this->fail('repair_remote_entity_mismatch', 422); }
        $normalized = $this->normalize($item, $externalId);
        $rawAddressValue = SwLeadExistingB24Adapter::readSourceField($item, 'address', $addressFound);
        $rawAddress = $addressFound && is_scalar($rawAddressValue) ? (string)$rawAddressValue : null;
        $service = $this;
        return $this->repository->withImportLock((string)$externalId, function () use ($snapshot, $workSnapshot, $normalized, $rawAddress, $externalId, $apply, $service) {
            return $service->repository->transaction(function () use ($snapshot, $workSnapshot, $normalized, $rawAddress, $externalId, $apply, $service) {
                $lead = $service->repository->getForUpdate('leads', (int)$snapshot['id']);
                if (!$lead || $service->fingerprint($lead) !== $service->fingerprint($snapshot)) { $service->fail('repair_snapshot_changed', 409); }
                $currentLinked = $service->linkedWork($lead);
                if (($currentLinked === null) !== ($workSnapshot === null) || ($currentLinked && (int)$currentLinked['id'] !== (int)$workSnapshot['id'])) { $service->fail('repair_snapshot_changed', 409); }
                $work = $currentLinked ? $service->repository->getForUpdate('work_orders', (int)$currentLinked['id']) : null;
                if ($workSnapshot && (!$work || $service->fingerprint($work) !== $service->fingerprint($workSnapshot))) { $service->fail('repair_snapshot_changed', 409); }
                if ($work) { $service->guardWork($lead, $work); }

                $skipped = array();
                $leadPatch = $service->fieldPatch($lead, $normalized, $rawAddress, true, $skipped);
                $workPatch = array();
                if ($work) {
                    if (in_array(isset($work['status']) ? $work['status'] : '', array('assigned', 'in_work'), true)) {
                        $workPatch = $service->fieldPatch($work, $normalized, $rawAddress, false, $skipped);
                    } else {
                        // Never retroactively change execution/financial data.
                        $skipped[] = 'work:terminal_or_inactive';
                    }
                }
                $result = array('b24Id' => $externalId, 'leadId' => (int)$lead['id'], 'changedLeadFields' => array_keys($leadPatch), 'changedWorkFields' => array_keys($workPatch), 'skippedFields' => $skipped, 'status' => $leadPatch || $workPatch ? ($apply ? 'repaired' : 'would_repair') : 'unchanged');
                if ($work) { $result['workId'] = (int)$work['id']; }
                if ($apply) {
                    $service->persist('leads', 'lead', $lead, $leadPatch, $externalId);
                    if ($work) { $service->persist('work_orders', 'work_order', $work, $workPatch, $externalId); }
                }
                return $result;
            });
        });
    }

    private function linkedWork(array $lead)
    {
        $rows = $this->repository->find('work_orders', array('=lead_id' => (int)$lead['id']), array('ID' => 'ASC'), 2);
        if (count($rows) > 1) { $this->fail('repair_work_ambiguous', 409); }
        $work = $rows ? reset($rows) : null;
        if (!empty($lead['work_order_id'])) {
            if (!$work || (int)$lead['work_order_id'] !== (int)$work['id']) { $this->fail('repair_work_relation_conflict', 409); }
        }
        if ($work) { $this->guardWork($lead, $work); }
        return $work;
    }

    private function guardWork(array $lead, array $work)
    {
        if ((int)$work['lead_id'] !== (int)$lead['id'] || (!empty($work['b24_id']) && (string)$work['b24_id'] !== (string)$lead['b24_id'])) { $this->fail('repair_work_relation_conflict', 409); }
        if (in_array(isset($work['status']) ? $work['status'] : '', array('assigned', 'in_work'), true) && (int)(isset($work['dealer_id']) ? $work['dealer_id'] : 0) !== (int)(isset($lead['dealer_id']) ? $lead['dealer_id'] : 0)) { $this->fail('repair_work_owner_conflict', 409); }
    }

    private function fieldPatch(array $row, array $source, $rawAddress, $isLead, array &$skipped)
    {
        $patch = array();
        $prefix = $isLead ? 'lead.' : 'work.';
        $map = $isLead ? array('product_type' => 'productType', 'budget' => 'budget', 'reward' => 'reward') : array('product_type' => 'productType', 'reward' => 'reward');
        foreach ($map as $field => $sourceField) {
            if (!array_key_exists($sourceField, $source) || $this->isEmpty($source[$sourceField])) { continue; }
            if (!$this->isEmpty(isset($row[$field]) ? $row[$field] : null)) { $skipped[] = $prefix . $field . ':not_empty'; continue; }
            $value = $source[$sourceField];
            if ($field === 'product_type') {
                if (!is_scalar($value) || strlen((string)$value) > 255) { $this->fail('repair_source_invalid', 422); }
                $value = trim((string)$value);
            } else {
                if (!is_numeric($value) || !is_finite((float)$value) || (float)$value < 0) { $this->fail('repair_source_invalid', 422); }
                $value = (float)$value;
            }
            $patch[$field] = $value;
        }
        if ($isLead && isset($source['expiresAt']) && !$this->isEmpty($source['expiresAt'])) {
            $newExpiry = $this->sourceDate($source['expiresAt']);
            $current = $this->optionalDate(isset($row['expire_at']) ? $row['expire_at'] : null);
            if (!$current || $newExpiry->getTimestamp() !== $current->getTimestamp()) {
                $storedSourceData = isset($row['source_data']) ? $row['source_data'] : null;
                $sourceData = is_array($storedSourceData) ? $storedSourceData : array();
                $oldExpiryAbsent = is_array($storedSourceData) || $this->isEmpty($storedSourceData);
                foreach (array('expiresAt', 'expireAt', 'dateExpire', 'UF_DATE_EXPIRE', 'expire_at', 'ufCrm31_1787895372840', 'ufCrm31_1787832673') as $key) {
                    if (array_key_exists($key, $sourceData) && !$this->isEmpty($sourceData[$key])) { $oldExpiryAbsent = false; }
                }
                $created = $this->optionalDate(isset($row['created_at']) ? $row['created_at'] : null);
                $expected = $created ? $created->getTimestamp() + (int)swLeadConfig('lead.default_ttl_seconds', 604800) : null;
                if ($oldExpiryAbsent && $current && $expected !== null && $current->getTimestamp() === $expected) {
                    $patch['expire_at'] = $newExpiry;
                } else { $skipped[] = $prefix . 'expire_at:default_not_confirmed'; }
            }
        }
        $clean = isset($source['address']) && is_scalar($source['address']) ? (string)$source['address'] : null;
        $existing = isset($row['address']) ? (string)$row['address'] : '';
        if ($rawAddress !== null && $clean !== null && $clean !== '' && ($existing === $rawAddress || $existing === $clean)) {
            if ($existing !== $clean) { $patch['address'] = $clean; }
            $coordinates = isset($source['coordinates']) ? $this->coordinates($source['coordinates']) : null;
            $storedCoordinates = isset($row['coordinates']) ? $row['coordinates'] : null;
            if ($coordinates !== null && ($this->isEmpty($storedCoordinates) || $storedCoordinates === array())) { $patch['coordinates'] = $coordinates; }
            if ($isLead && isset($source['sourceAddress']) && is_array($source['sourceAddress']) && isset($source['sourceAddress']['format']) && $source['sourceAddress']['format'] === 'bitrix_address') {
                $storedSource = isset($row['source_data']) ? $row['source_data'] : null;
                // Preserve every existing metadata value, including explicit
                // null/empty values, and never replace an unrecognized payload.
                if (is_array($storedSource) || $this->isEmpty($storedSource)) {
                    $storedSource = is_array($storedSource) ? $storedSource : array();
                    if (!array_key_exists('sourceAddress', $storedSource)) {
                        $addressMeta = array('format' => 'bitrix_address');
                        $locationId = isset($source['sourceAddress']['locationId']) ? $source['sourceAddress']['locationId'] : null;
                        if ((is_int($locationId) || is_string($locationId)) && ctype_digit((string)$locationId) && (int)$locationId > 0 && (string)(int)$locationId === (string)$locationId) {
                            $addressMeta['locationId'] = (int)$locationId;
                        }
                        $storedSource['sourceAddress'] = $addressMeta;
                        $patch['source_data'] = $storedSource;
                    }
                }
            }
        } elseif ($clean !== null && $clean !== '') { $skipped[] = $prefix . 'address:local_value_differs'; }
        return $patch;
    }

    private function persist($block, $entity, array $row, array $patch, $externalId)
    {
        if (!$patch) { return; }
        $fields = array_keys($patch);
        $version = max(1, (int)(isset($row['version']) ? $row['version'] : 1));
        $patch['version'] = $version + 1;
        $patch['updated_at'] = swLeadUtcNow();
        $this->repository->update($block, (int)$row['id'], $patch);
        $this->audit->record($entity, (int)$row['id'], 'source_fields_repaired', array('user_id' => 0, 'dealer_id' => 0, 'is_admin' => true), array('version' => $version), array('version' => $version + 1), array('source' => 'b24_field_repair', 'b24Id' => $externalId, 'fields' => $fields));
    }

    private function coordinates($value)
    {
        if (!is_array($value) || !isset($value['latitude'], $value['longitude']) || !is_numeric($value['latitude']) || !is_numeric($value['longitude'])) { return null; }
        $lat = (float)$value['latitude']; $lon = (float)$value['longitude'];
        if (!is_finite($lat) || !is_finite($lon) || abs($lat) > 90 || abs($lon) > 180) { return null; }
        return array('latitude' => $lat, 'longitude' => $lon);
    }

    private function sourceDate($value)
    {
        if (!is_scalar($value)) { $this->fail('repair_source_invalid', 422); }
        try {
            $date = new DateTimeImmutable((string)$value);
            $errors = DateTimeImmutable::getLastErrors();
            if ($errors && ($errors['warning_count'] || $errors['error_count'])) { $this->fail('repair_source_invalid', 422); }
            return $date;
        } catch (Exception $error) { $this->fail('repair_source_invalid', 422); }
    }

    private function optionalDate($value)
    {
        if ($this->isEmpty($value)) { return null; }
        try { return swLeadParseDateTime($value, 'date', true); } catch (Throwable $error) { return null; }
    }

    private function isEmpty($value)
    {
        return $value === null || (is_string($value) && trim($value) === '');
    }

    private function fingerprint(array $row)
    {
        return hash('sha256', swLeadJsonEncode($row));
    }

    private function normalize(array $item, $id)
    {
        if ($this->normalizer !== null) { return call_user_func($this->normalizer, $item, $id); }
        require_once __DIR__ . '/../controllers/B24SyncController.php';
        return swB24NormalizeImportedItem($item, $id);
    }

    private function readItem($id)
    {
        if ($this->itemReader !== null) { return call_user_func($this->itemReader, $id); }
        (new SwLeadExistingB24Adapter($this->repository))->loadTransport();
        if (!function_exists('bitrix24GetLead')) { $this->fail('repair_transport_unavailable', 503); }
        return bitrix24GetLead($id);
    }

    private function fail($code, $status)
    {
        throw new SwLeadApiException($status, $code, $code);
    }
}
