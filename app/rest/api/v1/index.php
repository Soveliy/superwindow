<?
define("NO_KEEP_STATISTIC", true);
define("NOT_CHECK_PERMISSIONS", true);

require($_SERVER["DOCUMENT_ROOT"] . "/bitrix/modules/main/include/prolog_before.php");

header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
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

$response = route($_GET);

echo json_encode($response, JSON_UNESCAPED_UNICODE);

