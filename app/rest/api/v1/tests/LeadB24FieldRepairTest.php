<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// Offline regression suite: real repair service, injected CRM reads and memory storage.
// No Bitrix bootstrap, credentials, HTTP calls or persistent writes are needed.
define('SUPERWINDOW_B24_ENABLED', true);
define('SUPERWINDOW_B24_IMPORT_CATEGORY_ID', 75);
define('SUPERWINDOW_LEADS_DEFAULT_TTL_SECONDS', 604800);
define('B24_LEAD_ENTITY_TYPE_ID', 1058);

$repairUnexpectedTransportCalls = 0;
function bitrix24UpdateLead($id, array $fields)
{
    ++$GLOBALS['repairUnexpectedTransportCalls'];
    throw new RuntimeException('remote_mutation_forbidden');
}
function bitrix24GetLead($id)
{
    ++$GLOBALS['repairUnexpectedTransportCalls'];
    throw new RuntimeException('uninjected_transport_forbidden');
}

require_once dirname(__DIR__) . '/services/LeadApiSupport.php';
require_once dirname(__DIR__) . '/services/LeadRepository.php';
require_once dirname(__DIR__) . '/services/LeadEvents.php';
require_once dirname(__DIR__) . '/services/LeadB24FieldRepairService.php';

class SwLeadFieldRepairMemoryRepository extends SwLeadRepository
{
    public $rows = array('leads' => array(), 'work_orders' => array(), 'audit' => array(), 'outbox' => array(), 'notifications' => array());
    public $writes = array();
    public $reads = array();
    public $locks = array();
    public $onImportLock = null;

    public function get($blockKey, $id)
    {
        $this->reads[] = array('get', $blockKey, (int)$id);
        return isset($this->rows[$blockKey][$id]) ? $this->rows[$blockKey][$id] : null;
    }

    public function getForUpdate($blockKey, $id)
    {
        $this->reads[] = array('locked', $blockKey, (int)$id);
        return $this->get($blockKey, $id);
    }

    public function findOne($blockKey, array $filter, array $order = array())
    {
        $rows = $this->find($blockKey, $filter, $order, 1);
        return $rows ? $rows[0] : null;
    }

    public function find($blockKey, array $filter = array(), array $order = array(), $limit = 0, $offset = 0)
    {
        $this->reads[] = array('find', $blockKey, $filter);
        $rows = array();
        foreach ($this->rows[$blockKey] as $row) {
            foreach ($filter as $field => $value) {
                $key = ltrim($field, '=');
                if ($key === 'ID') { $key = 'id'; }
                if (!array_key_exists($key, $row) || (string)$row[$key] !== (string)$value) {
                    continue 2;
                }
            }
            $rows[] = $row;
        }
        if ($order) {
            usort($rows, function ($a, $b) use ($order) {
                foreach ($order as $field => $direction) {
                    $field = $field === 'ID' ? 'id' : $field;
                    $comparison = ($a[$field] ?? null) <=> ($b[$field] ?? null);
                    if ($comparison) { return strtoupper($direction) === 'DESC' ? -$comparison : $comparison; }
                }
                return 0;
            });
        }
        return array_slice($rows, (int)$offset, (int)$limit > 0 ? (int)$limit : null);
    }

    public function add($blockKey, array $values)
    {
        if ($blockKey !== 'audit') { throw new RuntimeException('unexpected_repair_insert'); }
        $id = $this->rows[$blockKey] ? max(array_keys($this->rows[$blockKey])) + 1 : 1;
        $this->writes[] = array('add', $blockKey, $id, $values);
        $this->rows[$blockKey][$id] = array_merge($this->storedValues($values), array('id' => $id));
        return $id;
    }

    public function update($blockKey, $id, array $values)
    {
        if (!in_array($blockKey, array('leads', 'work_orders'), true)) { throw new RuntimeException('unexpected_repair_update'); }
        $this->writes[] = array('update', $blockKey, (int)$id, $values);
        $this->rows[$blockKey][$id] = array_merge($this->rows[$blockKey][$id], $this->storedValues($values));
        return true;
    }

    public function transaction($callback)
    {
        $before = $this->rows;
        try {
            return call_user_func($callback);
        } catch (Throwable $error) {
            $this->rows = $before;
            throw $error;
        }
    }

    public function withImportLock($externalId, $callback)
    {
        $this->locks[] = (string)$externalId;
        if ($this->onImportLock !== null) {
            $hook = $this->onImportLock;
            $this->onImportLock = null;
            call_user_func($hook, $this);
        }
        return call_user_func($callback);
    }

    private function storedValues(array $values)
    {
        foreach ($values as $key => $value) {
            if ($value instanceof DateTimeInterface) { $values[$key] = $value->format('c'); }
        }
        return $values;
    }
}

function repairAssert($condition, $label)
{
    if (!$condition) { throw new RuntimeException('FAILED: ' . $label); }
    fwrite(STDOUT, 'OK: ' . $label . "\n");
}

function repairSetEqual(array $actual, array $expected)
{
    sort($actual);
    sort($expected);
    return $actual === $expected;
}

function repairOnlyChanged(array $before, array $after, array $allowed)
{
    foreach ($allowed as $key) { unset($before[$key], $after[$key]); }
    return $before === $after;
}

function repairFixture(array $leadChanges = array(), array $workChanges = array(), array $normalizedChanges = array())
{
    $fixture = new stdClass();
    $fixture->repository = new SwLeadFieldRepairMemoryRepository();
    $rawAddress = 'Synthetic Street 7|55.75;37.61';
    $fixture->repository->rows['leads'][1] = array_merge(array(
        'id' => 1, 'b24_id' => '501', 'status' => 'converted', 'type' => 'installation',
        'dealer_id' => 19, 'version' => 7, 'title' => 'Preserve portal title',
        'customer_name' => 'Private Synthetic Client', 'customer_phone' => '+70000000000',
        'product_type' => '', 'budget' => null, 'reward' => null,
        'address' => $rawAddress, 'coordinates' => null,
        'created_at' => '2026-09-10T09:30:00+00:00', 'updated_at' => '2026-09-10T10:30:00+00:00',
        'expire_at' => '2026-09-17T09:30:00+00:00', 'source_data' => array('b24Id' => '501'),
        'taken_at' => '2026-09-10T10:30:00+00:00', 'schedule_deadline' => '2026-09-11T10:30:00+00:00',
        'scheduled_at' => '2026-09-20T10:00:00+00:00', 'measure_date' => null,
        'install_date' => '2026-09-20T10:00:00+00:00', 'delivery_date' => null,
        'required_date_filled' => true, 'converted_entity_type' => 'work_order',
        'converted_entity_id' => 10, 'work_order_id' => 10, 'order_id' => null,
        'import_key' => 'preserve-import-key', 'last_sync_at' => '2026-09-10T11:30:00+00:00',
    ), $leadChanges);
    $fixture->repository->rows['work_orders'][10] = array_merge(array(
        'id' => 10, 'b24_id' => '501', 'lead_id' => 1, 'dealer_id' => 19,
        'version' => 4, 'status' => 'in_work', 'type' => 'installation',
        'product_type' => '', 'reward' => null, 'address' => $rawAddress, 'coordinates' => null,
        'customer_name' => 'Private Synthetic Client', 'customer_phone' => '+70000000000',
        'created_at' => '2026-09-10T10:30:00+00:00', 'updated_at' => '2026-09-10T11:30:00+00:00',
        'planned_at' => '2026-09-20T10:00:00+00:00', 'fact_at' => null,
        'measure_date' => null, 'install_date' => '2026-09-20T10:00:00+00:00', 'delivery_date' => null,
        'photo_ids' => array(123), 'reminder_at' => '2026-09-19T10:00:00+00:00',
        'comment' => 'Preserve dealer note', 'cancel_reason' => null,
    ), $workChanges);
    $fixture->item = array('id' => '501', 'entityTypeId' => 1058, 'categoryId' => 75, 'ufCrm31_1787832525' => $rawAddress);
    $fixture->normalized = array_merge(array(
        'productType' => 'Synthetic windows', 'budget' => 15000.5, 'reward' => 2500,
        'expiresAt' => '2026-10-03T15:00:00+00:00',
        'address' => 'Synthetic Street 7', 'coordinates' => array('latitude' => 55.75, 'longitude' => 37.61),
        // These are deliberately hostile to workflow ownership; repair must ignore them.
        'status' => 'cancelled', 'dealerId' => 999, 'leadType' => 'delivery',
        'title' => 'Remote title must not win', 'customerName' => 'Remote customer',
        'measureDate' => '2027-01-01', 'installDate' => '2027-01-02', 'deliveryDate' => '2027-01-03',
    ), $normalizedChanges);
    $fixture->gets = array();
    $fixture->normalizations = array();
    $fixture->readError = null;
    $fixture->readResponse = null;
    $fixture->onRead = null;
    $fixture->service = new SwLeadB24FieldRepairService(
        $fixture->repository,
        new SwLeadAuditService($fixture->repository),
        function ($id) use ($fixture) {
            $fixture->gets[] = (string)$id;
            if ($fixture->onRead !== null) { call_user_func($fixture->onRead, $fixture); }
            if ($fixture->readError !== null) { throw $fixture->readError; }
            return $fixture->readResponse !== null ? $fixture->readResponse : array('success' => true, 'data' => array('item' => $fixture->item));
        },
        function ($item, $id) use ($fixture) {
            $fixture->normalizations[] = (string)$id;
            return $fixture->normalized;
        }
    );
    return $fixture;
}

function repairAssertError($fixture, $result, $code, $label)
{
    repairAssert(!$result['success'] && count($result['errors']) === 1 && $result['errors'][0]['code'] === $code, $label);
    repairAssert(!$fixture->repository->writes, $label . ' has no writes');
}

$f = repairFixture();
$before = $f->repository->rows;
$result = $f->service->run(array('501'));
repairAssert($result['success'] && !$result['apply'] && $result['requested'] === 1 && $result['wouldRepair'] === 1 && $result['repaired'] === 0, 'default mode previews one repair');
repairAssert($f->repository->rows === $before && !$f->repository->writes, 'dry-run leaves leads, jobs, audit and queues byte-for-byte unchanged');
repairAssert($result['results'][0]['status'] === 'would_repair', 'dry-run reports preview status');
repairAssert(repairSetEqual($result['results'][0]['changedLeadFields'], array('product_type', 'budget', 'reward', 'expire_at', 'address', 'coordinates')), 'lead preview contains only approved source fields');
repairAssert(repairSetEqual($result['results'][0]['changedWorkFields'], array('product_type', 'reward', 'address', 'coordinates')), 'work preview contains only approved source fields');
repairAssert($f->gets === array('501') && $f->normalizations === array('501'), 'repair uses one injected fresh read and normalization');
repairAssert(strpos(json_encode($result), 'Private Synthetic Client') === false && strpos(json_encode($result), 'Synthetic Street') === false, 'preview output has no customer or address values');

$f = repairFixture();
$before = $f->repository->rows;
$result = $f->service->run(array('501'), true);
$lead = $f->repository->rows['leads'][1];
$work = $f->repository->rows['work_orders'][10];
repairAssert($result['success'] && $result['apply'] && $result['repaired'] === 1 && $result['wouldRepair'] === 0 && $result['results'][0]['status'] === 'repaired', 'apply repairs the requested CRM ID');
repairAssert($lead['product_type'] === 'Synthetic windows' && (float)$lead['budget'] === 15000.5 && (float)$lead['reward'] === 2500.0, 'apply fills missing lead product and money');
repairAssert($work['product_type'] === 'Synthetic windows' && (float)$work['reward'] === 2500.0, 'apply fills missing linked-work product and reward');
repairAssert(strtotime($lead['expire_at']) === strtotime($f->normalized['expiresAt']), 'confirmed synthetic default expiry is replaced from CRM');
repairAssert($lead['address'] === 'Synthetic Street 7' && $work['address'] === 'Synthetic Street 7' && $lead['coordinates'] === $f->normalized['coordinates'] && $work['coordinates'] === $f->normalized['coordinates'], 'unchanged raw CRM address is cleaned and coordinates filled');
repairAssert(repairOnlyChanged($before['leads'][1], $lead, array('product_type', 'budget', 'reward', 'expire_at', 'address', 'coordinates', 'version', 'updated_at')), 'lead ownership, workflow, dates, linkage, contacts and source data are preserved');
repairAssert(repairOnlyChanged($before['work_orders'][10], $work, array('product_type', 'reward', 'address', 'coordinates', 'version', 'updated_at')), 'work ownership, status, planned/fact dates, photos and notes are preserved');
repairAssert($lead['version'] === 8 && $work['version'] === 5, 'only patched rows receive one optimistic version increment');
repairAssert(count($f->repository->rows['audit']) > 0 && count(array_filter($f->repository->rows['audit'], function ($row) { return $row['event'] !== 'source_fields_repaired'; })) === 0, 'repair records its dedicated audit event');
repairAssert(!$f->repository->rows['outbox'] && !$f->repository->rows['notifications'], 'repair never queues CRM updates or dealer notifications');
$afterFirstRepair = $f->repository->rows;
$writeCount = count($f->repository->writes);
$result = $f->service->run(array('501'), true);
repairAssert($result['success'] && $result['unchanged'] === 1 && $result['repaired'] === 0 && $result['results'][0]['status'] === 'unchanged', 'a repeated repair is a no-op');
repairAssert($f->repository->rows === $afterFirstRepair && count($f->repository->writes) === $writeCount, 'no-op does not bump versions or append audit');

foreach (array(0, '0', 95.75) as $existingMoney) {
    $f = repairFixture(array('product_type' => 'Dealer product', 'budget' => $existingMoney, 'reward' => $existingMoney), array('product_type' => 'Work product', 'reward' => $existingMoney));
    $f->service->run(array('501'), true);
    repairAssert($f->repository->rows['leads'][1]['product_type'] === 'Dealer product' && $f->repository->rows['leads'][1]['budget'] === $existingMoney && $f->repository->rows['leads'][1]['reward'] === $existingMoney && $f->repository->rows['work_orders'][10]['product_type'] === 'Work product' && $f->repository->rows['work_orders'][10]['reward'] === $existingMoney, 'nonempty source fields, including ' . var_export($existingMoney, true) . ', are never overwritten');
}

$f = repairFixture(array('address' => 'Dealer-edited address'), array('address' => 'Separate edited work address'));
$f->service->run(array('501'), true);
repairAssert($f->repository->rows['leads'][1]['address'] === 'Dealer-edited address' && $f->repository->rows['leads'][1]['coordinates'] === null && $f->repository->rows['work_orders'][10]['address'] === 'Separate edited work address' && $f->repository->rows['work_orders'][10]['coordinates'] === null, 'dealer-edited addresses block source address and coordinate repair');

$f = repairFixture(array('address' => 'Synthetic Street 7'), array('address' => 'Synthetic Street 7'));
$f->service->run(array('501'), true);
repairAssert($f->repository->rows['leads'][1]['coordinates'] === $f->normalized['coordinates'] && $f->repository->rows['work_orders'][10]['coordinates'] === $f->normalized['coordinates'], 'already cleaned matching address permits missing coordinate fill');

foreach (array(array('latitude' => 1.25, 'longitude' => 2.5), '55.75, 37.61', array('legacy' => 'coordinates')) as $existingCoordinates) {
    $f = repairFixture(array('coordinates' => $existingCoordinates), array('coordinates' => $existingCoordinates));
    $f->service->run(array('501'), true);
    repairAssert($f->repository->rows['leads'][1]['coordinates'] === $existingCoordinates && $f->repository->rows['work_orders'][10]['coordinates'] === $existingCoordinates, 'nonempty coordinates, including legacy representations, are never overwritten');
}

// Address provenance is additive lead-only metadata, not a source_data replacement.
$safeAddressMetadata = array('format' => 'bitrix_address', 'locationId' => 731);
$remoteAddressMetadata = array_merge($safeAddressMetadata, array('rawAddress' => 'Private remote address', 'unexpected' => array('must' => 'not be copied')));
$originalSourceData = array('b24Id' => '501', 'untouched' => array('text' => 'Preserve original payload', 'zero' => 0, 'null' => null), 'legacyFlag' => false);
$f = repairFixture(array('source_data' => $originalSourceData), array('source_data' => array('workHistory' => 'untouched')), array('sourceAddress' => $remoteAddressMetadata));
$before = $f->repository->rows;
$result = $f->service->run(array('501'));
repairAssert($result['success'] && in_array('source_data', $result['results'][0]['changedLeadFields'], true) && !in_array('source_data', $result['results'][0]['changedWorkFields'], true), 'address provenance preview is an approved lead-only source_data addition');
repairAssert($f->repository->rows === $before && !$f->repository->writes, 'address provenance dry-run does not write metadata');
$result = $f->service->run(array('501'), true);
$expectedSourceData = $originalSourceData;
$expectedSourceData['sourceAddress'] = $safeAddressMetadata;
repairAssert($result['success'] && $f->repository->rows['leads'][1]['source_data'] === $expectedSourceData, 'missing provenance adds only whitelisted address metadata while preserving every other source_data value');
repairAssert($f->repository->rows['work_orders'][10]['source_data'] === $before['work_orders'][10]['source_data'] && !in_array('source_data', $result['results'][0]['changedWorkFields'], true), 'linked work source_data is never patched');
$afterMetadata = $f->repository->rows;
$metadataWriteCount = count($f->repository->writes);
$result = $f->service->run(array('501'), true);
repairAssert($result['success'] && $result['unchanged'] === 1 && $f->repository->rows === $afterMetadata && count($f->repository->writes) === $metadataWriteCount, 'repeating provenance repair is a complete no-op');

foreach (array(null, '', array(), 0, false, array('format' => 'legacy', 'locationId' => 12)) as $existingMetadata) {
    $sourceData = $originalSourceData;
    $sourceData['sourceAddress'] = $existingMetadata;
    $f = repairFixture(array('source_data' => $sourceData), array(), array('sourceAddress' => $safeAddressMetadata));
    $result = $f->service->run(array('501'), true);
    repairAssert($result['success'] && $f->repository->rows['leads'][1]['source_data'] === $sourceData && !in_array('source_data', $result['results'][0]['changedLeadFields'], true), 'existing sourceAddress key is preserved exactly even when its value is empty or legacy');
}

$f = repairFixture(array('source_data' => $originalSourceData, 'address' => 'Dealer-edited address'), array(), array('sourceAddress' => $safeAddressMetadata));
$result = $f->service->run(array('501'), true);
repairAssert($result['success'] && $f->repository->rows['leads'][1]['source_data'] === $originalSourceData && !in_array('source_data', $result['results'][0]['changedLeadFields'], true), 'dealer-edited address blocks provenance metadata repair');

$f = repairFixture(array('source_data' => $originalSourceData, 'address' => 'Synthetic Street 7'), array(), array('sourceAddress' => array('format' => 'bitrix_address')));
$result = $f->service->run(array('501'), true);
repairAssert($result['success'] && $f->repository->rows['leads'][1]['source_data']['sourceAddress'] === array('format' => 'bitrix_address'), 'already cleaned matching address accepts safe provenance without an optional location ID');

$f = repairFixture(array('source_data' => 'Preserve unrecognized legacy source payload'), array(), array('sourceAddress' => $safeAddressMetadata));
$unknownSourceExpiry = $f->repository->rows['leads'][1]['expire_at'];
$result = $f->service->run(array('501'), true);
repairAssert($result['success'] && $f->repository->rows['leads'][1]['source_data'] === 'Preserve unrecognized legacy source payload', 'nonempty unrecognized source_data payload is never replaced to add provenance');
repairAssert($f->repository->rows['leads'][1]['expire_at'] === $unknownSourceExpiry, 'unrecognized legacy source data cannot confirm synthetic expiry provenance');

foreach (array(array('format' => 'unknown'), array('locationId' => 731)) as $invalidMetadata) {
    $f = repairFixture(array('source_data' => $originalSourceData), array(), array('sourceAddress' => $invalidMetadata));
    $result = $f->service->run(array('501'), true);
    repairAssert($result['success'] && $f->repository->rows['leads'][1]['source_data'] === $originalSourceData, 'unrecognized or missing address format cannot create provenance metadata');
}

foreach (array(0, -1, '0731', '731.0', (string)PHP_INT_MAX . '0', array('id' => 731), true, 731.0) as $invalidLocation) {
    $f = repairFixture(array('source_data' => $originalSourceData), array(), array('sourceAddress' => array('format' => 'bitrix_address', 'locationId' => $invalidLocation)));
    $result = $f->service->run(array('501'), true);
    repairAssert($result['success'] && $f->repository->rows['leads'][1]['source_data']['sourceAddress'] === array('format' => 'bitrix_address'), 'only a canonical positive integer location ID may be copied to provenance');
}

foreach (array(
    array('source_data' => array('expiresAt' => '2026-09-17T09:30:00+00:00')),
    array('source_data' => array('expire_at' => '2026-09-17T09:30:00+00:00')),
    array('source_data' => array('expireAt' => '2026-09-17T09:30:00+00:00')),
    array('source_data' => array('dateExpire' => '2026-09-17T09:30:00+00:00')),
    array('source_data' => array('UF_DATE_EXPIRE' => '2026-09-17T09:30:00+00:00')),
    array('source_data' => array('ufCrm31_1787832673' => '2026-09-17T09:30:00+00:00')),
    array('source_data' => array('ufCrm31_1787895372840' => '2026-09-17T09:30:00+00:00')),
    array('expire_at' => '2026-09-18T09:30:00+00:00'),
    array('created_at' => null),
) as $index => $changes) {
    $f = repairFixture($changes);
    $expiry = $f->repository->rows['leads'][1]['expire_at'];
    $f->service->run(array('501'), true);
    repairAssert($f->repository->rows['leads'][1]['expire_at'] === $expiry, 'unconfirmed or explicitly sourced expiry is preserved (case ' . $index . ')');
}
foreach (array(null, '', 'not-a-date') as $remoteExpiry) {
    $f = repairFixture(array(), array(), array('expiresAt' => $remoteExpiry));
    $expiry = $f->repository->rows['leads'][1]['expire_at'];
    $f->service->run(array('501'), true);
    repairAssert($f->repository->rows['leads'][1]['expire_at'] === $expiry, 'empty or invalid CRM expiry cannot replace a stored date');
}

$f = repairFixture(array(), array(), array('productType' => '', 'budget' => null, 'reward' => null, 'expiresAt' => null, 'address' => '', 'coordinates' => null));
$before = $f->repository->rows;
$result = $f->service->run(array('501'), true);
repairAssert($result['unchanged'] === 1 && $f->repository->rows === $before && !$f->repository->writes, 'empty CRM source values do not create artificial changes');

foreach (array('done', 'cancelled') as $terminalStatus) {
    $f = repairFixture(array(), array('status' => $terminalStatus, 'dealer_id' => 27));
    $beforeWork = $f->repository->rows['work_orders'][10];
    $result = $f->service->run(array('501'), true);
    repairAssert($result['success'] && $result['repaired'] === 1 && $result['results'][0]['changedWorkFields'] === array() && in_array('work:terminal_or_inactive', $result['results'][0]['skippedFields'], true), 'terminal ' . $terminalStatus . ' work is explicitly skipped while repairing lead source fields');
    repairAssert($f->repository->rows['work_orders'][10] === $beforeWork, 'terminal ' . $terminalStatus . ' work finances, version and history are unchanged even for a different dealer');
}

$f = repairFixture(array(), array('dealer_id' => 27));
$result = $f->service->run(array('501'), true);
repairAssertError($f, $result, 'repair_work_owner_conflict', 'linked work owned by another dealer rejects the whole repair');

$f = repairFixture(array(), array('lead_id' => 77));
$result = $f->service->run(array('501'), true);
repairAssertError($f, $result, 'repair_work_relation_conflict', 'explicit work link to a different lead rejects the whole repair');

$f = repairFixture();
$f->repository->rows['work_orders'][11] = array_merge($f->repository->rows['work_orders'][10], array('id' => 11));
$result = $f->service->run(array('501'), true);
repairAssertError($f, $result, 'repair_work_ambiguous', 'multiple candidate works reject the whole repair');

foreach (array('lead_version', 'lead_without_version', 'work_version', 'work_without_version') as $race) {
    $f = repairFixture();
    $f->onRead = function ($fixture) use ($race) {
        // Remote I/O occurs after snapshots and before the local locking transaction.
        $block = strpos($race, 'work_') === 0 ? 'work_orders' : 'leads';
        $id = $block === 'leads' ? 1 : 10;
        if (strpos($race, 'without_version') === false) {
            ++$fixture->repository->rows[$block][$id]['version'];
        } else {
            $fixture->repository->rows[$block][$id]['address'] = 'Concurrent dealer edit';
        }
    };
    $result = $f->service->run(array('501'), true);
    repairAssertError($f, $result, 'repair_snapshot_changed', 'concurrent ' . $race . ' change is detected after the CRM read');
}

$f = repairFixture();
$f->repository->onImportLock = function ($repository) { $repository->rows['leads'][1]['dealer_id'] = 999; };
$result = $f->service->run(array('501'), true);
repairAssertError($f, $result, 'repair_snapshot_changed', 'ownership changed while acquiring the import lock rejects repair');

foreach (array(array('id' => '502'), array('categoryId' => 76), array('entityTypeId' => 1059)) as $change) {
    $f = repairFixture();
    $f->item = array_merge($f->item, $change);
    $result = $f->service->run(array('501'), true);
    repairAssert(!$result['success'] && count($result['errors']) === 1 && !$f->repository->writes && !$f->normalizations, 'CRM identity/category/entity mismatch is rejected before normalization');
}
$f = repairFixture();
unset($f->item['categoryId']);
$result = $f->service->run(array('501'), true);
repairAssert(!$result['success'] && !$f->repository->writes, 'missing CRM category cannot be trusted');

$f = repairFixture();
unset($f->item['entityTypeId']);
$result = $f->service->run(array('501'));
repairAssert($result['success'] && $result['wouldRepair'] === 1, 'entityTypeId may be omitted by the scoped CRM getter');

foreach (array('exception', 'response') as $failure) {
    $f = repairFixture();
    $privateMessage = 'Private Synthetic Client +70000000000 https://crm.invalid/rest/SECRET_WEBHOOK/';
    if ($failure === 'exception') {
        $f->readError = new RuntimeException($privateMessage);
    } else {
        $f->readResponse = array('success' => false, 'error' => $privateMessage);
    }
    $result = $f->service->run(array('501'), true);
    repairAssert(!$result['success'] && count($result['errors']) === 1 && !$f->repository->writes, 'CRM ' . $failure . ' failure is safe and write-free');
    repairAssert(repairSetEqual(array_keys($result['errors'][0]), array('b24Id', 'code')) && strpos(json_encode($result), 'Private Synthetic Client') === false && strpos(json_encode($result), 'SECRET_WEBHOOK') === false, 'CRM ' . $failure . ' output exposes only safe ID and code');
}

foreach (array(array(), range(501, 521), array('501', '501'), array('0'), array('-1'), array('501x'), array('501.0'), array((string)PHP_INT_MAX . '0')) as $ids) {
    $f = repairFixture();
    $caught = null;
    try { $f->service->run($ids, true); } catch (SwLeadApiException $error) { $caught = $error; }
    repairAssert($caught !== null && $caught->getHttpStatus() === 422 && $caught->getErrorCode() === 'validation_error', 'invalid, duplicate or excessive explicit CRM ID list is rejected');
    repairAssert(!$f->gets && !$f->repository->writes, 'invalid ID list does not read CRM or write storage');
}

repairAssert($repairUnexpectedTransportCalls === 0, 'all CRM access remained injected and no remote mutation was attempted');
fwrite(STDOUT, "All offline B24 source-field repair regressions passed.\n");
