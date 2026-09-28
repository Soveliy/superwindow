<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// Offline only: actual import service, in-memory persistence and injected reads.
// Run both: php LeadB24ImportTest.php; php LeadB24ImportTest.php --disabled
// No Bitrix bootstrap, credentials, HTTP calls or filesystem mutations are used.
$disabledMode = in_array('--disabled', $argv, true);
define('SUPERWINDOW_B24_ENABLED', true);
define('SUPERWINDOW_B24_IMPORT_ENABLED', !$disabledMode);
define('SUPERWINDOW_B24_IMPORT_CATEGORY_ID', 75);
define('SUPERWINDOW_B24_IMPORT_MAX_PAGES', 2);
define('SUPERWINDOW_B24_IMPORT_MAX_ITEMS', 3);
define('SUPERWINDOW_B24_IMPORT_TIME_BUDGET_SECONDS', 20);
define('SUPERWINDOW_B24_STAGE_AVAILABLE', 'DT1058_75:PREPARATION');
define('B24_LEAD_ENTITY_TYPE_ID', 1058);

$importUnexpectedTransportCalls = 0;
function bitrix24UpdateLead($id, array $fields)
{
    ++$GLOBALS['importUnexpectedTransportCalls'];
    throw new RuntimeException('remote_mutation_forbidden');
}
function bitrix24GetLeads($query)
{
    ++$GLOBALS['importUnexpectedTransportCalls'];
    throw new RuntimeException('uninjected_transport_forbidden');
}
function bitrix24GetLead($id)
{
    ++$GLOBALS['importUnexpectedTransportCalls'];
    throw new RuntimeException('uninjected_transport_forbidden');
}

require_once dirname(__DIR__) . '/controllers/B24SyncController.php';
require_once dirname(__DIR__) . '/services/LeadB24ImportService.php';

class SwLeadImportMemoryRepository extends SwLeadRepository
{
    public $rows = array('leads' => array(), 'work_orders' => array(), 'audit' => array(), 'outbox' => array(), 'notifications' => array());
    public $writes = 0;
    public $locks = array();
    public $onImportLock = null;

    public function get($blockKey, $id)
    {
        return isset($this->rows[$blockKey][$id]) ? $this->rows[$blockKey][$id] : null;
    }

    public function getForUpdate($blockKey, $id)
    {
        return $this->get($blockKey, $id);
    }

    public function findOne($blockKey, array $filter, array $order = array())
    {
        foreach ($this->rows[$blockKey] as $row) {
            foreach ($filter as $field => $value) {
                $key = ltrim($field, '=');
                if (!array_key_exists($key, $row) || (string)$row[$key] !== (string)$value) {
                    continue 2;
                }
            }
            return $row;
        }
        return null;
    }

    public function add($blockKey, array $values)
    {
        ++$this->writes;
        $id = $this->rows[$blockKey] ? max(array_keys($this->rows[$blockKey])) + 1 : 1;
        $this->rows[$blockKey][$id] = array_merge($this->storedValues($values), array('id' => $id));
        return $id;
    }

    public function update($blockKey, $id, array $values)
    {
        ++$this->writes;
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

    public function withNamedLock($namespace, $key, $callback, $errorCode = 'resource_busy')
    {
        $this->locks[] = array($namespace, (string)$key);
        if ($namespace === 'lead_import' && $this->onImportLock !== null) {
            $hook = $this->onImportLock;
            $this->onImportLock = null;
            call_user_func($hook, $this);
        }
        return call_user_func($callback);
    }

    private function storedValues(array $values)
    {
        // Real repository presents persisted dates as ISO strings.
        foreach ($values as $key => $value) {
            if ($value instanceof DateTimeInterface) {
                $values[$key] = $value->format('c');
            }
        }
        return $values;
    }
}

class SwLeadImportNotifications extends SwLeadNotificationService
{
    public $broadcasts = array();

    public function broadcastNewLead(array $lead)
    {
        $this->broadcasts[] = $lead['id'];
        return 0;
    }
}

function importAssert($condition, $label)
{
    if (!$condition) {
        throw new RuntimeException('FAILED: ' . $label);
    }
    fwrite(STDOUT, 'OK: ' . $label . "\n");
}

function importRemote($id, array $changes = array())
{
    return array_merge(array(
        'id' => (string)$id, 'entityTypeId' => 1058, 'categoryId' => 75,
        'stageId' => 'DT1058_75:PREPARATION', 'title' => 'Synthetic discovery',
        'ufCrm31_1787832486' => '2939', 'ufCrm31_1787832684' => '',
        'ufCrm31_1787832673' => (new DateTimeImmutable('+2 days'))->format('c'),
    ), $changes);
}

function importPage(array $ids)
{
    return array('success' => true, 'data' => array('items' => array_map(function ($id) {
        return array('id' => (string)$id);
    }, $ids)));
}

function importFixture(array $pages, array $items = array(), $state = array())
{
    $fixture = new stdClass();
    $fixture->repository = new SwLeadImportMemoryRepository();
    $fixture->notifications = new SwLeadImportNotifications($fixture->repository);
    $fixture->leads = new SwLeadService($fixture->repository, new SwLeadAuditService($fixture->repository), $fixture->notifications, new SwLeadB24Outbox($fixture->repository));
    $fixture->pages = $pages;
    $fixture->items = $items;
    $fixture->queries = array();
    $fixture->gets = array();
    $fixture->state = $state;
    $fixture->stateWrites = array();
    $fixture->service = new SwLeadB24ImportService(
        $fixture->repository,
        $fixture->leads,
        function ($query) use ($fixture) {
            $fixture->queries[] = $query;
            if (!$fixture->pages) { throw new RuntimeException('unexpected_extra_page'); }
            $response = array_shift($fixture->pages);
            if ($response instanceof Throwable) { throw $response; }
            return $response;
        },
        function ($id) use ($fixture) {
            $fixture->gets[] = $id;
            $response = array_key_exists($id, $fixture->items) ? $fixture->items[$id] : importRemote($id);
            if ($response instanceof Throwable) { throw $response; }
            return isset($response['success']) ? $response : array('success' => true, 'data' => array('item' => $response));
        },
        function () use ($fixture) { return $fixture->state; },
        function ($state) use ($fixture) { $fixture->stateWrites[] = $state; $fixture->state = $state; }
    );
    return $fixture;
}

function importSeed($id, array $changes = array())
{
    return array_merge(array(
        'id' => $id, 'b24_id' => (string)$id, 'status' => 'assigned', 'type' => 'measurement',
        'dealer_id' => 19, 'version' => 7, 'title' => 'Preserved portal title',
        'scheduled_at' => null, 'measure_date' => null, 'install_date' => null, 'delivery_date' => null,
    ), $changes);
}

if ($disabledMode) {
    $f = importFixture(array(importPage(array(20))));
    $result = $f->service->run();
    importAssert($result['skipped'] && $result['reason'] === 'disabled', 'discovery remains opt-in');
    importAssert(!$f->queries && !$f->gets && !$f->stateWrites && $f->repository->writes === 0, 'disabled run has no reads or writes beyond local state/lock');
    $result = $f->service->run(true);
    importAssert($result['wouldCreate'] === 1 && !$result['enabled'], 'forced dry-run can preview a disabled importer');
    importAssert(!$f->stateWrites && $f->repository->writes === 0 && !$f->notifications->broadcasts, 'disabled dry-run is read-only');
    importAssert($importUnexpectedTransportCalls === 0, 'no real or mutating remote transport calls');
    fwrite(STDOUT, "All disabled B24 discovery regressions passed.\n");
    exit(0);
}

// Existing ownership, workflow, audit, version and notifications must be inert.
$f = importFixture(array(importPage(array(90, 80, 70))));
foreach (array(90 => 'assigned', 80 => 'converted', 70 => 'available') as $id => $status) {
    $f->repository->rows['leads'][$id] = importSeed($id, array('status' => $status));
}
$before = $f->repository->rows;
$result = $f->service->run();
importAssert($result['existing'] === 3 && $result['created'] === 0 && !$result['errors'], 'existing assigned, converted and available IDs are skipped');
importAssert($f->repository->rows === $before && $f->repository->writes === 0 && !$f->gets && !$f->notifications->broadcasts, 'existing skip does not request details or mutate any entity');
importAssert($f->repository->locks[0] === array('b24_import_poll', 'main'), 'polling uses its shared named lock');

// Eligibility is evaluated against fresh GET, never stale list fields.
$cases = array(
    'not_published' => array('stageId' => 'DT1058_75:CLIENT'),
    'category_mismatch' => array('categoryId' => 76),
    'entity_type_mismatch' => array('entityTypeId' => 1059),
    'remote_dealer_assigned' => array('ufCrm31_1787832684' => '19'),
    'invalid_type' => array('ufCrm31_1787832486' => 'unknown'),
    'invalid_source_shape' => array('ufCrm31_1787832518' => array('not', 'scalar')),
    'invalid_source_value' => array('title' => str_repeat('x', 256)),
    'expired' => array('ufCrm31_1787832673' => '2000-01-01'),
    'invalid_expiry' => array('ufCrm31_1787832673' => '2099-02-30'),
    'id_mismatch' => array('id' => '29'),
);
foreach ($cases as $reason => $changes) {
    $page = array('success' => true, 'data' => array('items' => array(importRemote(30))));
    $f = importFixture(array($page), array(30 => importRemote(30, $changes)));
    $result = $f->service->run();
    importAssert($result['ineligible'] === 1 && isset($result['skipReasons'][$reason]) && $f->repository->writes === 0, 'fresh detail guard: ' . $reason);
}
$missingDealer = importRemote(30);
unset($missingDealer['ufCrm31_1787832684']);
$f = importFixture(array(importPage(array(30))), array(30 => $missingDealer));
$result = $f->service->run();
importAssert(isset($result['skipReasons']['dealer_field_missing']) && $f->repository->writes === 0, 'missing dealer metadata does not prove an unassigned lead');
$f = importFixture(array(importPage(array(30, 20))), array(30 => importRemote(30, array('title' => str_repeat('x', 256))), 20 => importRemote(20, array('ufCrm31_1787832541' => 'not money'))));
$result = $f->service->run(true);
importAssert($result['wouldCreate'] === 0 && $result['ineligible'] === 2 && $result['success'] && !$f->stateWrites && $f->repository->writes === 0, 'dry-run performs the same title and amount validation as an actual import');
$f = importFixture(array(importPage(array(30))), array(30 => importRemote(30, array('ufCrm31_1787832541' => '300 000,50|RUB', 'ufCrm31_1787832619' => '2 000|RUB'))));
$result = $f->service->run();
$moneyLead = $f->repository->findOne('leads', array('=b24_id' => '30'));
importAssert($result['success'] && $moneyLead['budget'] === 300000.5 && $moneyLead['reward'] === 2000.0, 'CRM money formatting retains full budget and reward values');

$schedule = (new DateTimeImmutable('+1 day'))->format('c');
$f = importFixture(array(importPage(array(30, 20, 10))), array(
    30 => importRemote(30, array('ufCrm31_1787832632' => $schedule, 'ufCrm31_1787832639' => $schedule, 'ufCrm31_1787832659' => $schedule)),
    20 => importRemote(20, array('ufCrm31_1787832486' => '2941')),
    10 => importRemote(10, array('ufCrm31_1787832486' => '2943')),
));
$result = $f->service->run();
importAssert($result['created'] === 3 && !$result['errors'] && count($f->notifications->broadcasts) === 3, 'three supported types create through the actual LeadService');
$lead = $f->repository->findOne('leads', array('=b24_id' => '30'));
foreach (array('scheduled_at', 'measure_date', 'install_date', 'delivery_date') as $field) {
    importAssert(array_key_exists($field, $lead) && $lead[$field] === null, 'CRM suggestion does not satisfy dealer workflow: ' . $field);
}
importAssert(count($lead['source_data']['sourceSchedule']) === 3 && $lead['source_data']['sourceSchedule']['measureDate'] === $schedule, 'CRM suggestions remain source metadata');
importAssert($lead['status'] === 'available' && $lead['dealer_id'] === null && count($f->repository->rows['audit']) === 3 && !$f->repository->rows['outbox'], 'discovery creates available unowned records without outbox echo');
importAssert(array_column($f->repository->rows['leads'], 'type') === array('measurement', 'installation', 'delivery'), 'remote enums normalize to workflow types');
importAssert($result['cursor'] === 0 && $f->state['cursor'] === 0, 'short final page resets sweep cursor');
importAssert($f->queries[0]['filter'] === array('=categoryId' => 75, '=stageId' => 'DT1058_75:PREPARATION') && $f->queries[0]['start'] === -1, 'list is restricted to published category with keyset pagination');

// Direct service call and import-lock race must both preserve the winner.
$before = $f->repository->rows;
$writes = $f->repository->writes;
$repeat = $f->leads->importDiscoveredLead(array('b24EntityId' => '30', 'title' => 'Changed', 'leadType' => 'delivery'), 'different-key');
importAssert(empty($repeat['created']) && $f->repository->rows === $before && $f->repository->writes === $writes, 'atomic create-only sink never changes an existing ID');
$f = importFixture(array(importPage(array(40))));
$f->repository->onImportLock = function ($repository) { $repository->rows['leads'][40] = importSeed(40); };
$result = $f->service->run();
importAssert($result['existing'] === 1 && $result['created'] === 0 && $f->repository->get('leads', 40) === importSeed(40) && $f->repository->writes === 0, 'concurrent creation under import lock cannot overwrite owner or version');

// Limit detail reads mid-page, then resume strictly below the last consumed ID.
$f = importFixture(array(importPage(array(50, 40, 30, 20, 10))));
$result = $f->service->run();
importAssert($result['limited'] && $result['checked'] === 3 && $result['cursor'] === 30 && count($f->gets) === 3, 'item budget saves the last fully consumed cursor');
$f->pages = array(importPage(array(20, 10)));
$result = $f->service->run();
importAssert($f->queries[1]['filter']['<id'] === 30 && $result['created'] === 2 && $result['cursor'] === 0, 'next run resumes bounded sweep and resets at end');
$f->pages = array(importPage(array(60)));
$f->service->run();
importAssert(!isset($f->queries[2]['filter']['<id']) && $f->repository->findOne('leads', array('=b24_id' => '60')), 'completed sweep restarts from newest published IDs');

$f = importFixture(array(importPage(range(200, 151)), importPage(range(150, 101))));
foreach (range(200, 101) as $id) { $f->repository->rows['leads'][$id] = importSeed($id); }
$result = $f->service->run();
importAssert($result['pages'] === 2 && $result['existing'] === 100 && $result['limited'] && $result['cursor'] === 101 && !$f->gets, 'page budget bounds long sweeps of existing records');
importAssert($f->queries[1]['filter']['<id'] === 151, 'second full page uses its preceding last ID');
$f->pages = array(importPage(array()));
$result = $f->service->run();
importAssert($result['cursor'] === 0 && !$result['limited'], 'empty page resets a saved cursor');

// Retry a failed page without losing earlier IDs; success later on it is safe.
$f = importFixture(array(importPage(array(90, 80, 70))), array(80 => array('success' => false, 'error' => 'private response')), array('cursor' => 100));
$result = $f->service->run();
importAssert($result['created'] === 2 && count($result['errors']) === 1 && $result['cursor'] === 100 && $f->state['cursor'] === 100, 'transient detail failure rewinds the failed page but allows its other items');
importAssert($f->state['failures'] === 1 && strtotime($f->state['nextAttemptAt']) > time(), 'failure persists future backoff');
$queryCount = count($f->queries);
$writeCount = count($f->stateWrites);
$result = $f->service->run();
importAssert($result['skipped'] && $result['reason'] === 'backoff' && count($f->queries) === $queryCount && count($f->stateWrites) === $writeCount, 'backoff run makes no transport or state writes');
$f->state['nextAttemptAt'] = gmdate('c', time() - 1);
$f->pages = array(importPage(array(90, 80, 70)));
$f->items[80] = importRemote(80);
$result = $f->service->run();
importAssert($result['created'] === 1 && $result['existing'] === 2 && !$result['errors'] && $f->state['failures'] === 0 && $f->state['nextAttemptAt'] === null, 'retry fills only the missing ID and clears backoff');

$f = importFixture(array(importPage(range(200, 151)), new RuntimeException('https://example.invalid/rest/private-token/ customer-data')), array(), array('cursor' => 250));
foreach (range(200, 151) as $id) { $f->repository->rows['leads'][$id] = importSeed($id); }
$result = $f->service->run();
importAssert($result['cursor'] === 151 && count($result['errors']) === 1, 'list failure preserves the failed second page cursor');
importAssert(strpos(json_encode(array($result, $f->service->getStatus())), 'private-token') === false && strpos(json_encode($result), 'customer-data') === false, 'status and error diagnostics exclude raw transport secrets');

foreach (array(array(10, 20), array(20, 20), array(100), array('invalid'), range(99, 49)) as $invalidIds) {
    $f = importFixture(array(importPage($invalidIds)), array(), array('cursor' => 100));
    $result = $f->service->run();
    importAssert(count($result['errors']) === 1 && $result['cursor'] === 100 && !$f->gets && $f->repository->writes === 0, 'invalid or non-descending page cannot advance cursor or create rows');
}

// Preview bypasses backoff but never persists state, entities or notifications.
$initialState = array('cursor' => 100, 'failures' => 3, 'nextAttemptAt' => gmdate('c', time() + 3600));
$f = importFixture(array(importPage(array(90, 80))), array(), $initialState);
$result = $f->service->run(true);
importAssert($result['wouldCreate'] === 2 && $result['created'] === 0 && !$result['errors'], 'dry-run previews eligible new records during backoff');
importAssert($f->state === $initialState && !$f->stateWrites && $f->repository->writes === 0 && !$f->notifications->broadcasts, 'dry-run has zero persistent side effects');
// Current CRM schema must win over retired aliases, including explicit empties.
$f = importFixture(array(importPage(array(95))), array(95 => importRemote(95, array(
    'ufCrm31_1787894491' => 2945,
    'ufCrm31_1787832533' => 'Retired product',
    'ufCrm31_1787894554021' => '300 000,50|RUB',
    'ufCrm31_1787832541' => 99,
    'ufCrm31_1787894566488' => 4500,
    'ufCrm31_1787895372840' => null,
    'ufCrm31_1787832525' => 'Synthetic address|51.5;36.2|456',
))));
$result = $f->service->run();
$lead = $f->repository->findOne('leads', array('=b24_id' => '95'));
importAssert($result['success'] && $result['created'] === 1 && $lead['product_type'] === '1' && $lead['budget'] === 300000.5 && (float)$lead['reward'] === 4500.0, 'current product enum and monetary fields reach stored lead');
importAssert($lead['address'] === 'Synthetic address' && (float)$lead['coordinates']['latitude'] === 51.5 && (float)$lead['coordinates']['longitude'] === 36.2, 'CRM composite address is separated from its coordinates');

$f = importFixture(array(importPage(array(96))), array(96 => importRemote(96, array('ufCrm31_1787895372840' => '2000-01-01T00:00:00+03:00'))));
$result = $f->service->run();
importAssert($result['ineligible'] === 1 && isset($result['skipReasons']['expired']) && $result['created'] === 0, 'current expiry field blocks expired lead despite future retired alias');

$f = importFixture(array(importPage(array(97))), array(97 => importRemote(97, array('ufCrm31_1787894554021' => false, 'ufCrm31_1787832541' => 99, 'ufCrm31_1787894566488' => null, 'ufCrm31_1787832619' => 99))));
$result = $f->service->run();
$lead = $f->repository->findOne('leads', array('=b24_id' => '97'));
importAssert($result['created'] === 1 && $lead['budget'] === null && $lead['reward'] === null, 'explicit empty current money stays empty instead of zero or legacy fallback');

importAssert($importUnexpectedTransportCalls === 0, 'no real or mutating remote transport calls');
fwrite(STDOUT, "All offline B24 discovery regressions passed.\n");
