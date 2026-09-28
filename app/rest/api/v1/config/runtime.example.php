<?php

// Copy this file to local/php_interface/include/superwindow_leads.php and
// require_once it from local/php_interface/init.php. No secrets are needed
// for the existing private Bitrix24.php transport.
if (!defined('SUPERWINDOW_LEADS_LEGACY_B24')) { define('SUPERWINDOW_LEADS_LEGACY_B24', true); }
if (!defined('SUPERWINDOW_B24_ENABLED')) { define('SUPERWINDOW_B24_ENABLED', true); }
if (!defined('SUPERWINDOW_B24_TRANSPORT')) { define('SUPERWINDOW_B24_TRANSPORT', 'existing_bitrix24'); }
// Enable after cron/import_b24.php --dry-run confirms the intended CRM pipeline.
if (!defined('SUPERWINDOW_B24_IMPORT_ENABLED')) { define('SUPERWINDOW_B24_IMPORT_ENABLED', false); }
if (!defined('SUPERWINDOW_B24_EXISTING_HELPER_PATH')) {
    define('SUPERWINDOW_B24_EXISTING_HELPER_PATH', $_SERVER['DOCUMENT_ROOT'] . '/local/rest/api/v1/controllers/Bitrix24.php');
}
require_once $_SERVER['DOCUMENT_ROOT'] . '/local/rest/api/v1/cron/agent.php';
