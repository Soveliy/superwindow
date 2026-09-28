<?php
define("NO_KEEP_STATISTIC", true);
define("NOT_CHECK_PERMISSIONS", true);

require($_SERVER["DOCUMENT_ROOT"] . "/bitrix/modules/main/include/prolog_before.php");

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, X-Bitrix-Csrf-Token, X-CSRF-Token, X-API-Key, X-Cron-Key, Idempotency-Key, X-Request-ID');

// Cross-origin sessions are opt-in. Same-origin browser requests need no CORS header.
$requestOrigin = isset($_SERVER['HTTP_ORIGIN']) ? trim((string)$_SERVER['HTTP_ORIGIN']) : '';
$allowedOriginsRaw = getenv('SUPERWINDOW_LEADS_CORS_ORIGINS');
$allowedOrigins = $allowedOriginsRaw === false ? array() : array_filter(array_map('trim', explode(',', $allowedOriginsRaw)));
if ($requestOrigin !== '' && in_array($requestOrigin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// только GET
// if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
//     http_response_code(405);
//     echo json_encode(['error' => 'Метод не найден']);
//     exit;
// }

// защита от частых запросов
require_once __DIR__ . '/rateLimit.php';
rateLimit();
basicFilter();

// разделение логики
require_once __DIR__ . '/router.php';

$response = route(is_array($_GET) ? $_GET : array());

$json = json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($json === false) {
    http_response_code(500);
    $json = '{"success":false,"error":{"code":"response_encoding_failed","message":"Response encoding failed"}}';
}

echo $json;

