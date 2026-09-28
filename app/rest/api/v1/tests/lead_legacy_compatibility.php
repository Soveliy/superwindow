<?php

// Standalone contract check: php tests/lead_legacy_compatibility.php.
// Only Bitrix's date value object is stubbed; repository transforms are real.
namespace Bitrix\Main\Type {
    class DateTime
    {
        private $value;

        public function __construct($time = 'now', $format = null)
        {
            $this->value = new \DateTime($time);
        }

        public function format($format)
        {
            return $this->value->format($format);
        }

        public function getTimestamp()
        {
            return $this->value->getTimestamp();
        }
    }
}

namespace {
    if (PHP_SAPI !== 'cli') {
        http_response_code(404);
        exit;
    }
    define('SUPERWINDOW_LEADS_LEGACY_B24', true);
    date_default_timezone_set('Europe/Moscow');
    require_once dirname(__DIR__) . '/services/LeadApiSupport.php';
    require_once dirname(__DIR__) . '/services/LeadRepository.php';

    function check($condition, $message)
    {
        if (!$condition) {
            throw new \RuntimeException($message);
        }
    }

    $repository = new \SwLeadRepository();
    $reflection = new \ReflectionClass($repository);
    $call = function ($method, ...$args) use ($repository, $reflection) {
        return $reflection->getMethod($method)->invoke($repository, ...$args);
    };
    $makeMeta = function ($key, $legacy = true) {
        $config = swLeadConfig('hlblocks.' . $key);
        $types = array_fill_keys(array_values($config['fields']), 'string');
        $types['UF_B24_ENTITY_ID'] = 'integer';
        $types['UF_SCHEDULE_DEADLINE'] = 'datetime';
        return array(
            'block_key' => $key,
            'legacy' => $legacy,
            'config' => $config,
            'available' => array_fill_keys(array_values($config['fields']), true),
            'user_types' => $types,
            'query_fields' => array('budget' => 'SW_NUMBER_BUDGET', 'expire_at' => 'SW_DATE_EXPIRE_AT'),
        );
    };
    $leadMeta = $makeMeta('leads');
    $workMeta = $makeMeta('work_orders');
    $inputDate = new \DateTimeImmutable('2026-09-24T06:30:00Z');
    check(swLeadParseDateTime($inputDate, 'actualDate', true) === $inputDate, 'Immutable date values must be accepted without string casting');
    check(swLeadIso(swLeadParseDateTime(new \DateTime('2026-09-24T09:30:00+03:00'), 'actualDate', true)) === '2026-09-24T06:30:00Z', 'Mutable date values must preserve their absolute time');
    check(swLeadIso(swLeadParseDateTime(new \Bitrix\Main\Type\DateTime('2026-09-24 09:30:00'), 'actualDate', true)) === '2026-09-24T06:30:00Z', 'Bitrix date values must be accepted');
    $stored = $call('fromLogical', $leadMeta, array(
        'type' => 'installation',
        'taken_at' => $inputDate,
        'schedule_deadline' => $inputDate->modify('+24 hours'),
        'b24_id' => '435',
        'coordinates' => array('latitude' => 55.75, 'longitude' => 37.62),
    ));
    check($stored['UF_LEAD_TYPE'] === 'install', 'Lead type must preserve the B24 legacy value');
    check($stored['UF_TAKEN_AT'] === '24-09-2026 09:30:00', 'Legacy string date must use server local timezone');
    check($stored['UF_SCHEDULE_DEADLINE'] instanceof \Bitrix\Main\Type\DateTime, 'New datetime field must stay typed');
    check($stored['UF_B24_ENTITY_ID'] === 435, 'Legacy numeric external ID must stay numeric');
    check(json_decode($stored['UF_COORDINATES'], true)['latitude'] === 55.75, 'Coordinates must be JSON, not a raw array');

    $lead = $call('toLogical', $leadMeta, array(
        'ID' => 7,
        'UF_LEAD_TYPE' => 'install',
        'UF_BUDGET' => '15 000,50|RUB',
        'UF_TAKEN_AT' => '24-09-2026 09:30:00',
        'UF_VERSION' => null,
        'UF_COORDINATES' => '55.75, 37.62',
    ));
    check($lead['type'] === 'installation', 'Legacy lead type must normalize for API');
    check($lead['budget'] === 15000.5, 'Money string must normalize before numeric filters/UI');
    check($lead['taken_at'] === '2026-09-24T06:30:00Z', 'String date must normalize to UTC');
    check($lead['schedule_deadline'] === '2026-09-25T06:30:00Z', 'Old assigned leads need the original 24-hour deadline');
    check($lead['version'] === 1, 'Old records start at version one');
    check($lead['coordinates'] === '55.75, 37.62', 'Legacy comma coordinates must remain readable');

    $work = $call('fromLogical', $workMeta, array('type' => 'delivery', 'customer_name' => 'Иван', 'photo_ids' => array('19', 20)));
    check($work['UF_TYPE'] === 'доставка', 'Work type must preserve the existing Russian value');
    check($work['UF_CLIENT_NAME'] === 'Иван', 'Work customer must use the existing UF_CLIENT_NAME');
    check($work['UF_PHOTOS'] === array(19, 20), 'Existing multi-file IDs must not become JSON');

    $filter = $call('mapFilter', $leadMeta, array('=type' => 'measurement', '>=budget' => 5000, '<=expire_at' => $inputDate));
    check(in_array('measure', $filter['=UF_LEAD_TYPE'], true), 'Type filters must match imported legacy values');
    check(isset($filter['>=SW_NUMBER_BUDGET'], $filter['<=SW_DATE_EXPIRE_AT']), 'Range filters must use typed runtime fields');
    $native = $call('fromLogical', $makeMeta('leads', false), array('type' => 'installation', 'taken_at' => $inputDate));
    check($native['UF_LEAD_TYPE'] === 'installation', 'Native storage must retain canonical type');
    check($native['UF_TAKEN_AT'] instanceof \Bitrix\Main\Type\DateTime, 'Native datetime storage must be unchanged');
    fwrite(STDOUT, "Legacy repository compatibility checks passed.\n");
}
