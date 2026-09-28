<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// Offline regression: no Bitrix bootstrap, database or HTTP requests.
define('SUPERWINDOW_B24_ENABLED', true);
define('SUPERWINDOW_B24_TRANSPORT', 'existing_bitrix24');
define('SUPERWINDOW_B24_STAGE_AVAILABLE', 'DT1058_75:PREPARATION');
define('SUPERWINDOW_B24_STAGE_ASSIGNED', 'DT1058_75:CLIENT');
define('SUPERWINDOW_B24_STAGE_IN_WORK', 'DT1058_75:UC_51L019');
define('SUPERWINDOW_B24_STAGE_CONVERTED', 'DT1058_75:FAIL');
define('SUPERWINDOW_B24_STAGE_DONE', 'DT1058_75:SUCCESS');
// This misleading legacy constant must never cancel an entity in Bitrix24.
define('B24_LEAD_STAGE_FAIL', 'DT1058_75:FAIL');

$b24Calls = array();
$b24Response = null;
function bitrix24UpdateLead($id, array $fields)
{
    global $b24Calls, $b24Response;
    $b24Calls[] = array('id' => $id, 'fields' => $fields);
    return $b24Response === null ? array('success' => true, 'data' => array('item' => array('id' => $id))) : $b24Response;
}

require_once dirname(__DIR__) . '/controllers/B24SyncController.php';

class SwLeadB24MemoryRepository extends SwLeadRepository
{
    public $rows = array('leads' => array(), 'work_orders' => array(), 'outbox' => array());

    public function get($blockKey, $id)
    {
        return isset($this->rows[$blockKey][$id]) ? $this->rows[$blockKey][$id] : null;
    }

    public function add($blockKey, array $values)
    {
        $id = count($this->rows[$blockKey]) + 1;
        $this->rows[$blockKey][$id] = array_merge($values, array('id' => $id));
        return $id;
    }

    public function update($blockKey, $id, array $values)
    {
        $this->rows[$blockKey][$id] = array_merge($this->rows[$blockKey][$id], $values);
        return true;
    }

    public function find($blockKey, array $filter = array(), array $order = array(), $limit = 0, $offset = 0)
    {
        return array_values(array_filter($this->rows[$blockKey], function ($row) {
            return $row['status'] === 'pending' || ($row['status'] === 'retry' && $row['next_attempt_at'] <= swLeadUtcNow());
        }));
    }

    public function withNamedLock($namespace, $key, $callback, $errorCode = 'resource_busy')
    {
        return call_user_func($callback);
    }
}

function b24Assert($condition, $label)
{
    if (!$condition) {
        throw new RuntimeException('FAILED: ' . $label);
    }
    fwrite(STDOUT, 'OK: ' . $label . "\n");
}

$repository = new SwLeadB24MemoryRepository();
$repository->rows['leads'][1] = array(
    'id' => 1,
    'b24_id' => '101',
    'status' => 'assigned',
    'dealer_id' => 19,
    'type' => 'measurement',
    'customer_name' => 'Test customer',
    'measure_date' => '24-09-2026 12:30:00',
    'install_date' => null,
    'delivery_date' => null,
);
$adapter = new SwLeadExistingB24Adapter($repository);
$event = array('aggregate_type' => 'lead', 'aggregate_id' => 1, 'event' => 'lead.returned', 'payload' => array('status' => 'available', 'dealerId' => null));
$result = $adapter->deliver($event);
$sent = end($b24Calls);
b24Assert(!empty($result['success']) && $sent['fields']['stageId'] === 'DT1058_75:CLIENT' && $sent['fields']['ufCrm31_1787832684'] === '19', 'stale retry reconciles current owner/status');
b24Assert(strpos($sent['fields']['ufCrm31_1787832632'], '2026-09-24T12:30:00') === 0, 'legacy date converted to B24 ISO date');

$repository->rows['leads'][1]['status'] = 'available';
$repository->rows['leads'][1]['dealer_id'] = null;
$repository->rows['leads'][1]['measure_date'] = null;
$adapter->deliver($event);
$sent = end($b24Calls);
b24Assert($sent['fields']['ufCrm31_1787832684'] === '' && $sent['fields']['ufCrm31_1787832632'] === '', 'return clears owner and scheduled date');

$repository->rows['leads'][1]['status'] = 'converted';
$repository->rows['leads'][1]['work_order_id'] = 3;
$repository->rows['work_orders'][3] = array('id' => 3, 'b24_id' => '101', 'lead_id' => 1, 'status' => 'done', 'dealer_id' => 19, 'type' => 'доставка', 'planned_at' => '2026-09-24T16:00:00+03:00');
$adapter->deliver($event);
$sent = end($b24Calls);
b24Assert($sent['fields']['stageId'] === 'DT1058_75:SUCCESS' && strpos($sent['fields']['ufCrm31_1787832659'], '2026-09-24T16:00:00') === 0, 'linked work completion and delivery date win over stale lead event');

$repository->rows['leads'][1]['status'] = 'cancelled';
$before = count($b24Calls);
$result = $adapter->deliver($event);
b24Assert(!empty($result['blocked']) && count($b24Calls) === $before, 'unmapped cancellation never uses misleading FAIL constant');

$result = SwLeadExistingB24Adapter::checkAcknowledgement(array('success' => true, 'data' => null), 101);
b24Assert(empty($result['success']), 'invalid legacy success without remote acknowledgement rejected');
$result = SwLeadExistingB24Adapter::checkAcknowledgement(array('success' => true, 'data' => array('item' => array('id' => 102))), 101);
b24Assert(empty($result['success']), 'wrong item acknowledgement rejected');
$result = SwLeadExistingB24Adapter::checkAcknowledgement(array('success' => false, 'error' => 'https://example.invalid/rest/private-token/ customer-data', 'httpCode' => 502), 101);
b24Assert(strpos($result['error'], 'private-token') === false && strpos($result['error'], 'customer-data') === false, 'raw transport errors never leak secrets into outbox');

$outbox = new SwLeadB24Outbox($repository);
$eventId = $outbox->enqueue('lead', 1, 'lead.cancelled', array());
$stats = $outbox->flush();
$record = $repository->get('outbox', $eventId);
b24Assert($stats['blocked'] === 1 && $record['status'] === 'retry' && $record['attempts'] === 0, 'missing stage remains retryable without exhausting delivery attempts');

$repository->rows['leads'][1]['status'] = 'assigned';
unset($repository->rows['leads'][1]['work_order_id']);
$repository->rows['outbox'][$eventId]['next_attempt_at'] = new DateTimeImmutable('-1 minute');
$b24Response = array('success' => false, 'httpCode' => 503, 'error' => 'TEMPORARY_UNAVAILABLE');
$stats = $outbox->flush();
$record = $repository->get('outbox', $eventId);
b24Assert($stats['sent'] === 0 && $record['status'] === 'retry' && $record['attempts'] === 1, 'temporary B24 outage persists exponential retry');
$repository->rows['outbox'][$eventId]['next_attempt_at'] = new DateTimeImmutable('-1 minute');
$b24Response = null;
$stats = $outbox->flush();
$record = $repository->get('outbox', $eventId);
b24Assert($stats['sent'] === 1 && $record['status'] === 'sent' && $record['attempts'] === 2 && $record['last_error'] === '', 'acknowledged retry becomes sent');

$fields = SwLeadExistingB24Adapter::leadFields($repository->rows['leads'][1]);
b24Assert($fields['ufCrm31_1787832486'] === '2939' && $fields['ufCrm31_1787832509'] === 'Test customer', 'legacy manual sync retains field and enum mapping');
$import = swB24NormalizeImportedItem(array('title' => 'Test lead', 'ufCrm31_1787832486' => '2941', 'ufCrm31_1787832684' => 999, 'stageId' => 'DT1058_75:FAIL'), 101);
b24Assert($import['leadType'] === 'install' && !isset($import['dealerId']) && !isset($import['status']), 'import maps type without remote owner takeover or false cancellation');
fwrite(STDOUT, "All offline B24 adapter regressions passed.\n");
