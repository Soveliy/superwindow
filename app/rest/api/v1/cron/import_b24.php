<?php

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (in_array('--help', $argv, true)) {
    fwrite(STDOUT, "Usage: php import_b24.php [--dry-run|--status|--apply]\nDefault is read-only discovery. --apply requires SUPERWINDOW_B24_IMPORT_ENABLED=true in server runtime configuration. No existing portal lead is updated; no CRM mutation is sent.\n");
    exit(0);
}
$flags = array_values(array_diff(array_slice($argv, 1), array('--dry-run', '--status', '--apply')));
if ($flags || count(array_intersect(array_slice($argv, 1), array('--dry-run', '--status', '--apply'))) > 1) {
    fwrite(STDERR, "Choose one of --dry-run, --status or --apply.\n");
    exit(2);
}
foreach (array('NO_KEEP_STATISTIC', 'NOT_CHECK_PERMISSIONS', 'NO_AGENT_CHECK', 'NO_AGENT_STATISTIC', 'BX_CRONTAB') as $flag) {
    if (!defined($flag)) { define($flag, true); }
}
foreach (array_filter(array(getenv('SUPERWINDOW_DOCUMENT_ROOT'), dirname(__DIR__, 5), dirname(__DIR__, 4))) as $candidate) {
    $prolog = rtrim($candidate, '/\\') . '/bitrix/modules/main/include/prolog_before.php';
    if (is_file($prolog)) {
        $_SERVER['DOCUMENT_ROOT'] = rtrim($candidate, '/\\');
        require $prolog;
        break;
    }
}
if (!defined('B_PROLOG_INCLUDED')) { fwrite(STDERR, "Set SUPERWINDOW_DOCUMENT_ROOT to the Bitrix web root.\n"); exit(2); }
require_once dirname(__DIR__) . '/controllers/LeadController.php';
try {
    $importer = swLeadServiceContainer()['b24Import'];
    $result = in_array('--status', $argv, true) ? $importer->getStatus() : $importer->run(!in_array('--apply', $argv, true));
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n";
    exit(isset($result['success']) && !$result['success'] ? 1 : 0);
} catch (Throwable $error) {
    // Never emit transport URLs, CRM snapshots, tokens, exception text or traces.
    $code = $error instanceof SwLeadApiException ? $error->getErrorCode() : 'internal_error';
    fwrite(STDERR, json_encode(array('success' => false, 'code' => $code)) . "\n");
    exit(1);
}
