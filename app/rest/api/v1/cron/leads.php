<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('NO_KEEP_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', true);
define('NO_AGENT_CHECK', true);
define('BX_CRONTAB', true);

$documentRoot = getenv('SUPERWINDOW_DOCUMENT_ROOT');
$candidates = array_filter(array(
    $documentRoot,
    dirname(__DIR__, 5),
    dirname(__DIR__, 4),
));
foreach ($candidates as $candidate) {
    $prolog = rtrim($candidate, '/\\') . '/bitrix/modules/main/include/prolog_before.php';
    if (is_file($prolog)) {
        $_SERVER['DOCUMENT_ROOT'] = rtrim($candidate, '/\\');
        require $prolog;
        break;
    }
}

if (empty($_SERVER['DOCUMENT_ROOT']) || !defined('B_PROLOG_INCLUDED')) {
    fwrite(STDERR, "Bitrix document root was not found. Set SUPERWINDOW_DOCUMENT_ROOT.\n");
    exit(2);
}

require_once dirname(__DIR__) . '/controllers/LeadController.php';

$lockDir = $_SERVER['DOCUMENT_ROOT'] . '/upload/tmp/superwindow_leads';
if (!is_dir($lockDir) && !mkdir($lockDir, 0750, true) && !is_dir($lockDir)) {
    fwrite(STDERR, "Cannot create cron lock directory.\n");
    exit(2);
}
$lock = fopen($lockDir . '/cron.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    fwrite(STDOUT, "Lead cron is already running.\n");
    exit(0);
}

try {
    $container = swLeadServiceContainer();
    $result = $container['repository']->withNamedLock('lead_worker', 'main', function () use ($container) {
        return $container['cron']->run();
    });
    fwrite(STDOUT, json_encode(array('success' => true, 'data' => $result), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n");
    $exitCode = empty($result['errors']) ? 0 : 1;
} catch (Throwable $exception) {
    if (function_exists('AddMessage2Log')) {
        AddMessage2Log('Lead cron: ' . $exception->getMessage() . "\n" . $exception->getTraceAsString(), 'superwindow.leads');
    }
    fwrite(STDERR, json_encode(array(
        'success' => false,
        'error' => array(
            'code' => $exception instanceof SwLeadApiException ? $exception->getErrorCode() : 'internal_error',
            'message' => $exception instanceof SwLeadApiException ? $exception->getMessage() : 'Internal error',
        ),
    ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
    $exitCode = 1;
}

flock($lock, LOCK_UN);
fclose($lock);
exit($exitCode);
