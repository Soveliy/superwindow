<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// Pure mapping regressions. No bootstrap, credentials, database or HTTP calls.
// Also run with --custom-labels to verify installation-specific enum labels.
$customLabels = in_array('--custom-labels', $argv, true);
if ($customLabels) {
    define('SUPERWINDOW_B24_PRODUCT_LABELS_JSON', '{"2945":"Custom A","2947":"Custom B"}');
}
$unexpectedMappingTransportCalls = 0;
function bitrix24UpdateLead($id, array $fields)
{
    ++$GLOBALS['unexpectedMappingTransportCalls'];
    throw new RuntimeException('mapping_must_not_mutate_remote');
}
function bitrix24GetLead($id)
{
    ++$GLOBALS['unexpectedMappingTransportCalls'];
    throw new RuntimeException('mapping_must_not_read_remote');
}
function bitrix24GetLeads($query)
{
    ++$GLOBALS['unexpectedMappingTransportCalls'];
    throw new RuntimeException('mapping_must_not_read_remote');
}
set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});
require_once dirname(__DIR__) . '/controllers/B24SyncController.php';

function fieldMappingAssert($condition, $label)
{
    if (!$condition) { throw new RuntimeException('FAILED: ' . $label); }
    fwrite(STDOUT, 'OK: ' . $label . "\n");
}

function fieldMappingError($callback, $expectedCode)
{
    try { call_user_func($callback); }
    catch (SwLeadApiException $error) { return $error->getErrorCode() === $expectedCode; }
    return false;
}

$labelA = $customLabels ? 'Custom A' : '1';
$labelB = $customLabels ? 'Custom B' : '2';
$item = array(
    'id' => 901, 'title' => 'Delivery fixture',
    'ufCrm31_1787832509' => 'Customer fixture',
    'ufCrm31_1787832518' => '+7 000 000-00-00',
    'ufCrm31_1787832525' => 'Example address|55.75;37.61|571',
    'ufCrm31_1787894491' => 2945,
    'ufCrm31_1787832486' => 2943,
    'ufCrm31_1787894554021' => '120000.50',
    'ufCrm31_1787894566488' => 8500,
    'ufCrm31_1787832625' => 'Factory fixture',
    'ufCrm31_1787832632' => false,
    'ufCrm31_1787832639' => null,
    'ufCrm31_1787832659' => '2026-10-01T12:00:00+03:00',
    'ufCrm31_1787895372840' => '2026-10-05T12:00:00+03:00',
    'ufCrm31_1787895382388' => array(),
    'ufCrm31_1787832684' => 19,
);
$normalized = swB24NormalizeImportedItem($item, 901);
fieldMappingAssert($normalized['b24EntityId'] === '901' && $normalized['title'] === 'Delivery fixture' && $normalized['clientName'] === 'Customer fixture' && $normalized['phone'] === '+7 000 000-00-00' && $normalized['comment'] === 'Factory fixture', 'verified unchanged CRM text fields retain their values');
fieldMappingAssert($normalized['productType'] === $labelA && $normalized['leadType'] === 'delivery' && $normalized['budget'] === 120000.5 && $normalized['reward'] === 8500.0 && $normalized['expiresAt'] === '2026-10-05T12:00:00+03:00', 'current CRM IDs map product enum, money and expiry');
fieldMappingAssert($normalized['measureDate'] === null && $normalized['installDate'] === null && $normalized['deliveryDate'] === '2026-10-01T12:00:00+03:00' && !isset($normalized['dealerId']), 'source schedule maps without making remote owner an assignment command');
fieldMappingAssert($normalized['address'] === 'Example address' && $normalized['coordinates'] === array('latitude' => 55.75, 'longitude' => 37.61) && $normalized['sourceAddress'] === array('format' => 'bitrix_address', 'locationId' => 571), 'composite address separates readable text, valid coordinates and location metadata');
fieldMappingAssert(!isset($normalized['city']) && !isset($normalized['region']) && $normalized['sourceAttachmentRefs'] === array(), 'city and region are not guessed and empty remote files stay empty');

$item['ufCrm31_1787894491'] = '2947';
fieldMappingAssert(swB24NormalizeImportedItem($item, 901)['productType'] === $labelB, 'second enum uses its actual configured label');
fieldMappingAssert(SwLeadExistingB24Adapter::readSourceField($item, 'product_type') === '2947', 'readSourceField supports omitted optional by-reference arguments');

$legacy = array('title' => 'Legacy fixture', 'ufCrm31_1787832486' => '2939', 'ufCrm31_1787832533' => 'Legacy product label', 'ufCrm31_1787832541' => '12 345,67|RUB', 'ufCrm31_1787832619' => '3' . "\xC2\xA0" . '500,00', 'ufCrm31_1787832673' => '2026-11-01T00:00:00+03:00');
$legacyNormalized = swB24NormalizeImportedItem($legacy, 902);
fieldMappingAssert($legacyNormalized['productType'] === 'Legacy product label' && $legacyNormalized['budget'] === 12345.67 && $legacyNormalized['reward'] === 3500.0 && $legacyNormalized['leadType'] === 'measure', 'legacy IDs remain readable with safe formatted-money parsing');
$emptyCurrent = array_merge($legacy, array('ufCrm31_1787894491' => null, 'ufCrm31_1787894554021' => false, 'ufCrm31_1787894566488' => '', 'ufCrm31_1787895372840' => null));
$emptyNormalized = swB24NormalizeImportedItem($emptyCurrent, 902);
fieldMappingAssert($emptyNormalized['productType'] === '' && $emptyNormalized['budget'] === null && $emptyNormalized['reward'] === null && $emptyNormalized['expiresAt'] === null, 'explicit empty current values override stale populated legacy aliases');
SwLeadExistingB24Adapter::readSourceField($emptyCurrent, 'budget', $found, $used);
fieldMappingAssert($found === true && $used === 'ufCrm31_1787894554021', 'selected source field reports authoritative current key even when empty');

foreach (array(null, false, '', '  ') as $emptyMoney) {
    fieldMappingAssert(SwLeadExistingB24Adapter::normalizeMoney($emptyMoney) === null, 'empty money does not become zero');
}
foreach (array(0, 0.0, '0', '0,00|RUB') as $zero) {
    fieldMappingAssert(SwLeadExistingB24Adapter::normalizeMoney($zero) === 0.0, 'explicit numeric zero is retained');
}
foreach (array(array('amount' => 12), true, -1, '-1', 'not money', '12.5x', INF) as $invalid) {
    fieldMappingAssert(fieldMappingError(function () use ($invalid) { SwLeadExistingB24Adapter::normalizeMoney($invalid); }, 'invalid_source_value'), 'malformed money fails safely without casting or warnings');
}
fieldMappingAssert(fieldMappingError(function () { swB24NormalizeImportedItem(array('ufCrm31_1787894554021' => array('amount' => 1)), 903); }, 'invalid_source_shape'), 'array CRM money shape is rejected before normalization');

fieldMappingAssert(swB24NormalizeAddress('Plain fixture address') === array('address' => 'Plain fixture address'), 'plain address remains plain without manufactured coordinates');
$noCoordinates = swB24NormalizeAddress('Fixture|;|575');
fieldMappingAssert($noCoordinates['address'] === 'Fixture' && $noCoordinates['sourceAddress']['locationId'] === 575 && !isset($noCoordinates['coordinates']), 'empty coordinate pair retains location identity only');
foreach (array('Fixture|91;37|575', 'Fixture|55;181|575', 'Fixture|x;37|575', 'Fixture|55;37;20|575', 'Fixture|1e999;37|575') as $badAddress) {
    fieldMappingAssert(!isset(swB24NormalizeAddress($badAddress)['coordinates']), 'invalid or out-of-range source coordinate pair is not accepted');
}
fieldMappingAssert(swB24NormalizeAddress('Fixture|0;0|0')['coordinates'] === array('latitude' => 0.0, 'longitude' => 0.0), 'valid zero coordinates are retained');

$fileItem = array('ufCrm31_1787895382388' => array(
    array('id' => 17, 'url' => 'https://example.invalid/rest/private-token/file', 'urlMachine' => 'https://example.invalid/?auth=fixture-secret'),
    array('ID' => '18', 'name' => 'Private fixture'),
    19, 17, array('id' => array('invalid')), 'https://example.invalid/?auth=fixture-secret', false,
));
$fileNormalized = swB24NormalizeImportedItem($fileItem, 904);
fieldMappingAssert($fileNormalized['sourceAttachmentRefs'] === array(array('id' => '17', 'field' => 'ufCrm31_1787895382388'), array('id' => '18', 'field' => 'ufCrm31_1787895382388'), array('id' => '19', 'field' => 'ufCrm31_1787895382388')), 'file metadata retains only deduplicated safe source IDs');
$fileJson = json_encode($fileNormalized);
fieldMappingAssert(strpos($fileJson, 'https:') === false && strpos($fileJson, 'fixture-secret') === false && strpos($fileJson, 'private-token') === false && !isset($fileNormalized['attachments']) && !isset($fileNormalized['files']), 'auth-bearing file URLs never become source metadata or fake download links');

$outbound = SwLeadExistingB24Adapter::leadFields(array(
    'title' => 'Delivery fixture', 'customer_name' => 'Customer fixture', 'phone' => '+7 000 000-00-00',
    'comment' => 'Factory fixture', 'address' => $normalized['address'], 'coordinates' => $normalized['coordinates'],
    'source_data' => $normalized, 'product_type' => $labelA, 'type' => 'delivery',
    'budget' => 120000.5, 'reward' => null, 'expire_at' => '2026-10-05T12:00:00+03:00',
    'dealer_id' => null, 'measure_date' => null, 'install_date' => null, 'delivery_date' => null,
    'files' => array(array('id' => 17, 'url' => '/safe-local-file')),
));
fieldMappingAssert($outbound['ufCrm31_1787894491'] === '2945' && $outbound['ufCrm31_1787894554021'] === 120000.5 && $outbound['ufCrm31_1787894566488'] === '' && $outbound['ufCrm31_1787895372840'] === '2026-10-05T12:00:00+03:00', 'full sync writes current field IDs and reverses actual enum label');
fieldMappingAssert($outbound['ufCrm31_1787832525'] === 'Example address|55.75;37.61|571', 'full sync reconstructs the verified composite address metadata');
fieldMappingAssert($outbound['ufCrm31_1787832486'] === '2943' && $outbound['ufCrm31_1787832684'] === '' && $outbound['ufCrm31_1787832632'] === '' && $outbound['ufCrm31_1787832639'] === '' && $outbound['ufCrm31_1787832659'] === '', 'verified workflow IDs remain unchanged');
fieldMappingAssert(!isset($outbound['ufCrm31_1787832533']) && !isset($outbound['ufCrm31_1787832541']) && !isset($outbound['ufCrm31_1787832619']) && !isset($outbound['ufCrm31_1787832673']) && !isset($outbound['ufCrm31_1787895382388']), 'full sync never targets retired fields or clears unmanaged remote files');
fieldMappingAssert(SwLeadExistingB24Adapter::productId($labelB) === '2947' && SwLeadExistingB24Adapter::productId('2947') === '2947', 'both configured product label and known enum ID reverse correctly');
fieldMappingAssert(fieldMappingError(function () { SwLeadExistingB24Adapter::productId('Unknown product label'); }, 'b24_product_unmapped'), 'unmapped product cannot silently write an invented enum');
$legacyAddress = SwLeadExistingB24Adapter::leadFields(array('address' => 'Legacy|;|575'));
fieldMappingAssert($legacyAddress['ufCrm31_1787832525'] === 'Legacy|;|575', 'existing composite address remains backward compatible');
$malformedMeta = SwLeadExistingB24Adapter::leadFields(array('address' => 'Fixture', 'source_data' => array('sourceAddress' => array('locationId' => array())), 'coordinates' => array('latitude' => array(), 'longitude' => 'x')));
fieldMappingAssert($malformedMeta['ufCrm31_1787832525'] === 'Fixture|;|', 'malformed optional outbound address metadata emits no warnings');
fieldMappingAssert($unexpectedMappingTransportCalls === 0, 'mapping performs no remote reads or writes');
fwrite(STDOUT, 'All offline B24 field mapping regressions passed' . ($customLabels ? ' (custom labels)' : '') . ".\n");
