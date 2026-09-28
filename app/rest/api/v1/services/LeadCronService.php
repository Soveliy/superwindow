<?php

class SwLeadCronService
{
    private $repository;
    private $audit;
    private $notifications;
    private $outbox;
    private $leadService;
    private $importer;
    private $actor = array('user_id' => 0, 'dealer_id' => 0, 'is_admin' => true);

    public function __construct(
        SwLeadRepository $repository,
        SwLeadAuditService $audit,
        SwLeadNotificationService $notifications,
        SwLeadB24Outbox $outbox,
        SwLeadService $leadService,
        $importer = null
    ) {
        $this->repository = $repository;
        $this->audit = $audit;
        $this->notifications = $notifications;
        $this->outbox = $outbox;
        $this->leadService = $leadService;
        $this->importer = $importer;
    }

    public function run()
    {
        $result = array(
            'expiredLeads' => 0,
            'returnedLeads' => 0,
            'leadReminders' => 0,
            'workOrderReminders' => 0,
            'startedWorkOrders' => 0,
            'errors' => array(),
        );

        $now = swLeadUtcNow();
        $this->expireAvailableLeads($now, $result);
        $this->returnUnscheduledLeads($now, $result);
        $this->sendLeadDeadlineReminders($now, $result);
        $this->sendWorkOrderReminders($now, $result);
        $this->startPlannedWorkOrders($now, $result);

        try {
            $result['b24Outbox'] = $this->outbox->flush();
        } catch (Throwable $exception) {
            $this->appendError($result, 'b24_outbox', $exception);
            $result['b24Outbox'] = array('processed' => 0, 'sent' => 0, 'failed' => 1);
        }

        if ($this->importer !== null && swLeadConfig('b24.import.enabled', false)) {
            try {
                $result['b24Import'] = $this->importer->run(false);
                if (empty($result['b24Import']['success'])) {
                    $result['errors'][] = array('phase' => 'b24_import', 'code' => 'b24_import_incomplete');
                }
            } catch (Throwable $exception) {
                $this->appendError($result, 'b24_import', $exception);
            }
        }

        return $result;
    }

    private function expireAvailableLeads(DateTimeImmutable $now, array &$result)
    {
        $rows = $this->repository->find('leads', array('=status' => 'available', '<=expire_at' => $now), array('ID' => 'ASC'), 500, 0);
        foreach ($rows as $row) {
            try {
                $service = $this;
                $changed = $this->repository->locked('leads', $row['id'], function ($current) use ($now, $service) {
                    if (!$current || $current['status'] !== 'available' || empty($current['expire_at'])) {
                        return false;
                    }
                    if (swLeadParseDateTime($current['expire_at'], 'expiresAt', true) > $now) {
                        return false;
                    }
                    $service->repository->update('leads', $current['id'], array(
                        'status' => 'expired',
                        'version' => max(1, (int)$current['version']) + 1,
                        'updated_at' => $now,
                    ));
                    $updated = $service->repository->get('leads', $current['id']);
                    $service->audit->record('lead', $current['id'], 'lead.expired', $service->actor, $current, $updated, array('source' => 'cron'));
                    $service->outbox->enqueue('lead', $current['id'], 'lead.expired', $service->leadService->integrationLeadPayload($updated));
                    return true;
                });
                if ($changed) {
                    $result['expiredLeads']++;
                }
            } catch (Throwable $exception) {
                $this->appendError($result, 'expire_lead_' . $row['id'], $exception);
            }
        }
    }

    private function returnUnscheduledLeads(DateTimeImmutable $now, array &$result)
    {
        $rows = $this->repository->find('leads', array(
            '=status' => 'assigned',
            '<=schedule_deadline' => $now,
        ), array('ID' => 'ASC'), 500, 0);

        foreach ($rows as $row) {
            try {
                $service = $this;
                $outcome = $this->repository->locked('leads', $row['id'], function ($current) use ($now, $service) {
                    $dateFieldsByType = array(
                        'measurement' => 'measure_date',
                        'installation' => 'install_date',
                        'delivery' => 'delivery_date',
                    );
                    $typeDateField = $current && isset($dateFieldsByType[$current['type']]) ? $dateFieldsByType[$current['type']] : null;
                    $hasScheduledDate = $current && (!empty($current['scheduled_at']) || ($typeDateField !== null && !empty($current[$typeDateField])));
                    if (!$current || $current['status'] !== 'assigned' || $hasScheduledDate || empty($current['schedule_deadline'])) {
                        return null;
                    }
                    if (swLeadParseDateTime($current['schedule_deadline'], 'scheduleDueAt', true) > $now) {
                        return null;
                    }
                    $oldDealerId = (int)$current['dealer_id'];
                    $legacyWork = $service->repository->findOne('work_orders', array('=lead_id' => (int)$current['id']), array('ID' => 'ASC'));
                    if ($legacyWork) {
                        $legacyWork = $service->repository->getForUpdate('work_orders', $legacyWork['id']);
                        if ($legacyWork['status'] === 'assigned' && empty($legacyWork['planned_at']) && empty($legacyWork['fact_date']) && empty($legacyWork['photo_ids']) && (int)$legacyWork['dealer_id'] === $oldDealerId) {
                            $service->repository->update('work_orders', $legacyWork['id'], array(
                                'status' => 'cancelled',
                                'cancellation_reason' => 'Лид возвращён: дата не назначена за 24 часа.',
                                'reminder_at' => null,
                                'reminder_sent_at' => null,
                                'version' => max(1, (int)$legacyWork['version']) + 1,
                                'updated_at' => $now,
                            ));
                            $cancelledWork = $service->repository->get('work_orders', $legacyWork['id']);
                            $service->audit->record('work_order', $legacyWork['id'], 'work_order.cancelled', $service->actor, $legacyWork, $cancelledWork, array('source' => 'lead_return_timeout'));
                            $service->outbox->enqueue('work_order', $legacyWork['id'], 'work_order.cancelled', $service->leadService->integrationWorkOrderPayload($cancelledWork));
                        } elseif ($legacyWork['status'] !== 'cancelled' || !in_array((string)$legacyWork['cancellation_reason'], array('lead_returned_without_date', 'Лид возвращён: дата не назначена за 24 часа.'), true)) {
                            // An already scheduled/started job must not be silently
                            // detached from its owner by the lead deadline worker.
                            throw new SwLeadApiException(409, 'lead_return_work_conflict', 'Связанная работа уже запланирована или начата');
                        }
                    }
                    $service->repository->update('leads', $current['id'], array(
                        'status' => 'available',
                        'dealer_id' => null,
                        'taken_at' => null,
                        'schedule_deadline' => null,
                        'required_date_filled_at' => null,
                        'work_order_id' => null,
                        'version' => max(1, (int)$current['version']) + 1,
                        'updated_at' => $now,
                    ));
                    $updated = $service->repository->get('leads', $current['id']);
                    $service->audit->record('lead', $current['id'], 'lead.returned', $service->actor, $current, $updated, array('source' => 'cron', 'oldDealerId' => $oldDealerId));
                    $service->outbox->enqueue('lead', $current['id'], 'lead.returned', $service->leadService->integrationLeadPayload($updated));
                    return array('lead' => $updated, 'dealerId' => $oldDealerId);
                });
                if ($outcome) {
                    $result['returnedLeads']++;
                    $this->notifications->create(
                        $outcome['dealerId'],
                        'lead_returned',
                        'Лид возвращён на витрину',
                        'Дата не была назначена за 24 часа.',
                        array('notificationType' => 'lead_returned', 'leadId' => (string)$row['id']),
                        'lead_returned_' . $row['id'] . '_' . (int)$row['version']
                    );
                }
            } catch (Throwable $exception) {
                $this->appendError($result, 'return_lead_' . $row['id'], $exception);
            }
        }
    }

    private function sendLeadDeadlineReminders(DateTimeImmutable $now, array &$result)
    {
        $offsets = array_values(array_unique(array_map('intval', (array)swLeadConfig('lead.deadline_reminder_offsets_seconds', array(43200, 3600)))));
        rsort($offsets, SORT_NUMERIC);
        $maximumOffset = $offsets ? max($offsets) : 43200;
        $reminderThreshold = $now->modify('+' . $maximumOffset . ' seconds');
        $rows = $this->repository->find('leads', array(
            '=status' => 'assigned',
            '<=schedule_deadline' => $reminderThreshold,
            '>schedule_deadline' => $now,
        ), array('schedule_deadline' => 'ASC'), 500, 0);

        foreach ($rows as $row) {
            foreach ($offsets as $offset) {
                if ($offset <= 0 || swLeadParseDateTime($row['schedule_deadline'], 'scheduleDueAt', true) > $now->modify('+' . $offset . ' seconds')) {
                    continue;
                }
                $dedupeKey = 'lead_deadline_' . $row['id'] . '_' . (string)$row['schedule_deadline'] . '_' . $offset;
                try {
                    $existing = $this->repository->findOne('notifications', array(
                        '=dealer_id' => (int)$row['dealer_id'],
                        '=dedupe_key' => $dedupeKey,
                    ));
                    if ($existing) {
                        continue;
                    }
                    $minutes = (int)round($offset / 60);
                    $remainingText = $minutes >= 120 && $minutes % 60 === 0
                        ? ((int)($minutes / 60) . ' ч.')
                        : ($minutes . ' мин.');
                    $notification = $this->notifications->create(
                        $row['dealer_id'],
                        'deadline_reminder',
                        'Назначьте дату по лиду',
                        'До возврата лида на витрину осталось не более ' . $remainingText,
                        array('notificationType' => 'lead_schedule_due', 'leadId' => (string)$row['id'], 'reminderOffsetSeconds' => $offset),
                        $dedupeKey
                    );
                    if ($notification) {
                        $result['leadReminders']++;
                    }
                } catch (Throwable $exception) {
                    $this->appendError($result, 'lead_reminder_' . $row['id'] . '_' . $offset, $exception);
                }
            }
        }
    }

    private function sendWorkOrderReminders(DateTimeImmutable $now, array &$result)
    {
        $rows = $this->repository->find('work_orders', array(
            '@status' => array('assigned', 'in_work'),
            '<=reminder_at' => $now,
            '=reminder_sent_at' => null,
        ), array('reminder_at' => 'ASC'), 500, 0);

        foreach ($rows as $row) {
            try {
                $service = $this;
                $changed = $this->repository->locked('work_orders', $row['id'], function ($current) use ($now, $service) {
                    if (!$current || !in_array($current['status'], array('assigned', 'in_work'), true) || !empty($current['reminder_sent_at']) || empty($current['reminder_at'])) {
                        return false;
                    }
                    if (swLeadParseDateTime($current['reminder_at'], 'reminderAt', true) > $now) {
                        return false;
                    }
                    $reminder = isset($current['reminder']) && is_array($current['reminder']) ? $current['reminder'] : array();
                    $service->notifications->create(
                        $current['dealer_id'],
                        'work_order',
                        'Скоро выезд по заказу',
                        isset($reminder['message']) ? (string)$reminder['message'] : 'Проверьте время и свяжитесь с клиентом.',
                        array('notificationType' => 'work_order_due', 'leadId' => isset($current['lead_id']) ? (string)$current['lead_id'] : null, 'workOrderId' => (string)$current['id']),
                        'work_order_reminder_' . $current['id'] . '_' . (string)$current['reminder_at']
                    );
                    $service->repository->update('work_orders', $current['id'], array('reminder_sent_at' => $now, 'updated_at' => $now));
                    return true;
                });
                if ($changed) {
                    $result['workOrderReminders']++;
                }
            } catch (Throwable $exception) {
                $this->appendError($result, 'work_order_reminder_' . $row['id'], $exception);
            }
        }
    }

    private function startPlannedWorkOrders(DateTimeImmutable $now, array &$result)
    {
        $rows = $this->repository->find('work_orders', array('=status' => 'assigned', '<=planned_at' => $now), array('planned_at' => 'ASC'), 500, 0);
        foreach ($rows as $row) {
            try {
                $service = $this;
                $changed = $this->repository->locked('work_orders', $row['id'], function ($current) use ($now, $service) {
                    if (!$current || $current['status'] !== 'assigned' || empty($current['planned_at'])) {
                        return false;
                    }
                    if (swLeadParseDateTime($current['planned_at'], 'plannedAt', true) > $now) {
                        return false;
                    }
                    $service->repository->update('work_orders', $current['id'], array(
                        'status' => 'in_work',
                        'version' => max(1, (int)$current['version']) + 1,
                        'updated_at' => $now,
                    ));
                    $updated = $service->repository->get('work_orders', $current['id']);
                    $service->audit->record('work_order', $current['id'], 'work_order.started', $service->actor, $current, $updated, array('source' => 'cron'));
                    $service->outbox->enqueue('work_order', $current['id'], 'work_order.started', $service->leadService->integrationWorkOrderPayload($updated));
                    return true;
                });
                if ($changed) {
                    $result['startedWorkOrders']++;
                }
            } catch (Throwable $exception) {
                $this->appendError($result, 'start_work_order_' . $row['id'], $exception);
            }
        }
    }

    private function appendError(array &$result, $operation, Throwable $exception)
    {
        if (count($result['errors']) >= 20) {
            return;
        }
        $result['errors'][] = array(
            'operation' => (string)$operation,
            'code' => $exception instanceof SwLeadApiException ? $exception->getErrorCode() : 'internal_error',
            'message' => $exception instanceof SwLeadApiException ? $exception->getMessage() : 'Внутренняя ошибка',
        );
    }
}
