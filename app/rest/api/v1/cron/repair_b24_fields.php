<?php

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (in_array('--help', $argv, true)) {
    fwrite(STDOUT, "Usage: php repair_b24_fields.php --ids=123,456 [--dry-run|--apply]\nDefault: read-only preview. Requires 1..20 explicit, unique CRM IDs. Repairs missing source fields only; owner, status and workflow dates remain unchanged. No CRM writes or notifications.\n");
    exit(0);
}
$idsArgument = null;
$mode = null;
$invalid = false;
for ($i = 1; $i < count($argv); ++$i) {
    $argument = $argv[$i];
    if ($argument === '--ids' || strpos($argument, '--ids=') === 0) {
        if ($idsArgument !== null) { $invalid = true; break; }
        $idsArgument = $argument === '--ids' ? (isset($argv[$i + 1]) ? $argv[++$i] : '') : substr($argument, 6);
    } elseif ($argument === '--apply' || $argument === '--dry-run') {
        if ($mode !== null) { $invalid = true; break; }
        $mode = $argument;
    } else { $invalid = true; break; }
}
$ids = $idsArgument !== null ? explode(',', $idsArgument) : array();
if (!$ids || count($ids) > 20 || count(array_unique($ids)) !== count($ids)) { $invalid = true; }
foreach ($ids as $id) {
    if (!preg_match('/^[1-9][0-9]*$/D', $id) || (string)(int)$id !== $id) { $invalid = true; }
}
if ($invalid) {
    fwrite(STDERR, "Supply --ids=123,456 with 1..20 unique positive CRM IDs and at most one of --dry-run or --apply.\n");
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
require_once dirname(__DIR__) . '/services/LeadB24FieldRepairService.php';
try {
    $repository = new SwLeadRepository();
    $service = new SwLeadB24FieldRepairService($repository, new SwLeadAuditService($repository));
    $result = $service->run($ids, $mode === '--apply');
    fwrite($result['success'] ? STDOUT : STDERR, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n");
    exit($result['success'] ? 0 : 1);
} catch (Throwable $error) {
    $code = $error instanceof SwLeadApiException ? $error->getErrorCode() : 'repair_failed';
    if (!is_string($code) || !preg_match('/^[a-z0-9_]{1,80}$/D', $code)) { $code = 'repair_failed'; }
    fwrite(STDERR, json_encode(array('success' => false, 'code' => $code)) . "\n");
    exit(1);
}
