<?php

/** Bitrix agent fallback for hosting accounts without CLI crontab access. */
function swLeadWorkerAgent()
{
    require_once dirname(__DIR__) . '/controllers/LeadController.php';
    try {
        $container = swLeadServiceContainer();
        $container['repository']->withNamedLock('lead_worker', 'main', function () use ($container) {
            $result = $container['cron']->run();
            if (!empty($result['errors']) && function_exists('AddMessage2Log')) {
                AddMessage2Log(swLeadJsonEncode($result['errors']), 'superwindow.leads.worker');
            }
        });
    } catch (Throwable $exception) {
        if (function_exists('AddMessage2Log')) {
            $code = $exception instanceof SwLeadApiException ? $exception->getErrorCode() : 'internal_error';
            AddMessage2Log('Worker failed: ' . $code, 'superwindow.leads.worker');
        }
    }
    return 'swLeadWorkerAgent();';
}
