<?php

require_once __DIR__ . '/LeadB24Adapter.php';

class SwLeadAuditService
{
    private $repository;

    public function __construct(SwLeadRepository $repository)
    {
        $this->repository = $repository;
    }

    public function record($entityType, $entityId, $event, array $actor, $before, $after, array $meta = array())
    {
        $now = swLeadUtcNow();
        return $this->repository->add('audit', array(
            'entity_type' => (string)$entityType,
            'entity_id' => (int)$entityId,
            'event' => (string)$event,
            'actor_id' => isset($actor['user_id']) ? (int)$actor['user_id'] : 0,
            'dealer_id' => isset($actor['dealer_id']) ? (int)$actor['dealer_id'] : 0,
            'before' => $this->compactSnapshot(is_array($before) ? $before : array()),
            'after' => $this->compactSnapshot(is_array($after) ? $after : array()),
            'meta' => array_merge(array('requestId' => swLeadRequestId()), $meta),
            'created_at' => $now,
        ));
    }

    private function compactSnapshot(array $snapshot)
    {
        foreach (array('source_data', 'files', 'photo_ids') as $largeField) {
            if (!isset($snapshot[$largeField])) {
                continue;
            }
            $encoded = swLeadJsonEncode($snapshot[$largeField]);
            $snapshot[$largeField] = array(
                'redactedFromAudit' => true,
                'items' => is_array($snapshot[$largeField]) ? count($snapshot[$largeField]) : null,
                'sha256' => hash('sha256', $encoded),
            );
        }
        return $snapshot;
    }
}

/**
 * Extension point for matching a newly imported lead to eligible dealers.
 * A project-specific class configured through the environment may implement
 * resolve(array $lead): array and return dealer IDs.
 */
class SwLeadEligibleDealerResolver
{
    public function resolve(array $lead)
    {
        $customClass = trim((string)swLeadConfig('notifications.eligible_dealer_resolver_class', ''));
        if ($customClass !== '' && $customClass !== __CLASS__ && class_exists($customClass)) {
            try {
                $custom = new $customClass();
                if (is_callable(array($custom, 'resolve'))) {
                    return $this->sanitizeIds(call_user_func(array($custom, 'resolve'), $lead));
                }
            } catch (Throwable $exception) {
                $this->logFailure('custom resolver', $exception);
                return array();
            }
        }

        $groupIds = array_values(array_filter(array_map('intval', (array)swLeadConfig('auth.dealer_group_ids', array()))));
        if (!$groupIds || !class_exists('CUser')) {
            // Safe no-op until dealer eligibility groups or a custom resolver are configured.
            return array();
        }

        $dealerField = trim((string)swLeadConfig('auth.dealer_user_field', ''));
        $regionField = trim((string)swLeadConfig('auth.dealer_region_user_field', ''));
        $select = array_values(array_filter(array($dealerField, $regionField)));
        $by = 'id';
        $order = 'asc';
        $filter = array('ACTIVE' => 'Y', 'GROUPS_ID' => $groupIds);
        $parameters = array('FIELDS' => array('ID'));
        if ($select) {
            $parameters['SELECT'] = $select;
        }
        $leadRegion = $this->lower(isset($lead['region']) ? $lead['region'] : '');
        $max = (int)swLeadConfig('notifications.max_broadcast_recipients', 1000);
        $ids = array();

        try {
            $users = CUser::GetList($by, $order, $filter, $parameters);
            while ($user = $users->Fetch()) {
                if ($regionField !== '' && $leadRegion !== '') {
                    $regions = isset($user[$regionField]) ? $user[$regionField] : array();
                    if (!is_array($regions)) {
                        $regions = preg_split('/[,;]+/', (string)$regions);
                    }
                    $regions = array_map(array($this, 'lower'), array_map('trim', $regions));
                    if (!in_array('*', $regions, true) && !in_array($leadRegion, $regions, true)) {
                        continue;
                    }
                }
                $dealerId = $dealerField !== '' && !empty($user[$dealerField]) ? (int)$user[$dealerField] : (int)$user['ID'];
                if ($dealerId > 0) {
                    $ids[] = $dealerId;
                }
                if (count($ids) >= $max) {
                    break;
                }
            }
        } catch (Throwable $exception) {
            $this->logFailure('default resolver', $exception);
            return array();
        }

        return $this->sanitizeIds($ids);
    }

    public function lower($value)
    {
        $value = trim((string)$value);
        return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
    }

    private function sanitizeIds($ids)
    {
        if (!is_array($ids)) {
            return array();
        }
        return array_values(array_unique(array_filter(array_map('intval', $ids), function ($id) {
            return $id > 0;
        })));
    }

    private function logFailure($context, Throwable $exception)
    {
        if (function_exists('AddMessage2Log')) {
            AddMessage2Log('Eligible dealer ' . $context . ': ' . $exception->getMessage(), 'superwindow.leads');
        }
    }
}

class SwLeadNotificationService
{
    private $repository;

    public function __construct(SwLeadRepository $repository)
    {
        $this->repository = $repository;
    }

    public function defaults()
    {
        return $this->normalizePreferences((array)swLeadConfig('notifications.defaults', array()));
    }

    public function preferences($dealerId)
    {
        try {
            $row = $this->repository->findOne('preferences', array('=dealer_id' => (int)$dealerId), array('ID' => 'ASC'));
        } catch (SwLeadApiException $exception) {
            if (in_array($exception->getErrorCode(), array('storage_not_configured', 'storage_schema_error'), true)) {
                return array('preferences' => $this->defaults(), 'source' => 'defaults', 'persistent' => false);
            }
            throw $exception;
        }

        if (!$row) {
            return array('preferences' => $this->defaults(), 'source' => 'defaults', 'persistent' => true);
        }

        return array(
            'preferences' => $this->normalizePreferences(isset($row['preferences']) ? $row['preferences'] : array()),
            'source' => 'dealer',
            'persistent' => true,
            'updatedAt' => isset($row['updated_at']) ? $row['updated_at'] : null,
        );
    }

    public function updatePreferences($dealerId, array $input)
    {
        $preferences = $this->normalizePreferences($input, true);
        $now = swLeadUtcNow();
        $row = $this->repository->findOne('preferences', array('=dealer_id' => (int)$dealerId), array('ID' => 'ASC'));
        if ($row) {
            $this->repository->update('preferences', $row['id'], array(
                'preferences' => $preferences,
                'updated_at' => $now,
            ));
        } else {
            $this->repository->add('preferences', array(
                'dealer_id' => (int)$dealerId,
                'preferences' => $preferences,
                'created_at' => $now,
                'updated_at' => $now,
            ));
        }

        return array('preferences' => $preferences, 'source' => 'dealer', 'persistent' => true, 'updatedAt' => swLeadIso($now));
    }

    public function create($dealerId, $event, $title, $message, array $payload = array(), $dedupeKey = '')
    {
        $dealerId = (int)$dealerId;
        if ($dealerId <= 0) {
            return null;
        }

        $events = (array)swLeadConfig('notifications.events', array());
        if (!in_array($event, $events, true)) {
            throw new SwLeadApiException(500, 'notification_event_unknown', 'Неизвестный тип уведомления');
        }

        if ($dedupeKey !== '') {
            $existing = $this->repository->findOne('notifications', array(
                '=dealer_id' => $dealerId,
                '=dedupe_key' => $dedupeKey,
            ));
            if ($existing) {
                return $existing;
            }
        }

        $preferenceResult = $this->preferences($dealerId);
        $preferences = $preferenceResult['preferences'];
        $inAppVisible = !empty($preferences['in_app'][$event]);
        $channels = array();
        $delivery = array();
        $externalEnabled = (bool)swLeadConfig('notifications.external_delivery_enabled', false);
        foreach ((array)swLeadConfig('notifications.channels', array()) as $channel) {
            if (empty($preferences[$channel][$event])) {
                continue;
            }
            $channels[] = $channel;
            if ($channel === 'in_app') {
                $delivery[$channel] = array('status' => 'available');
            } elseif ($externalEnabled) {
                // Transport workers can claim queued intents later.
                $delivery[$channel] = array('status' => 'queued');
            } else {
                $delivery[$channel] = array('status' => 'disabled');
            }
        }

        if (!$channels) {
            return null;
        }

        $id = $this->repository->add('notifications', array(
            'dealer_id' => $dealerId,
            'event' => $event,
            'title' => (string)$title,
            'message' => (string)$message,
            'payload' => $payload,
            'channels' => $channels,
            'delivery' => $delivery,
            'in_app_visible' => $inAppVisible ? 1 : 0,
            'dedupe_key' => (string)$dedupeKey,
            'read_at' => null,
            'created_at' => swLeadUtcNow(),
        ));

        return $this->repository->get('notifications', $id);
    }

    public function broadcastNewLead(array $lead)
    {
        $resolver = new SwLeadEligibleDealerResolver();
        $dealerIds = $resolver->resolve($lead);
        $notified = 0;
        foreach ($dealerIds as $dealerId) {
            try {
                $notification = $this->create(
                    $dealerId,
                    'new_lead',
                    'Новый лид на витрине',
                    trim((string)(isset($lead['product']) ? $lead['product'] : $lead['title'])) . (!empty($lead['city']) ? ', ' . $lead['city'] : ''),
                    array('notificationType' => 'lead_available', 'leadId' => (string)$lead['id']),
                    'lead_available_' . $lead['id'] . '_' . $dealerId
                );
                if ($notification) {
                    $notified++;
                }
            } catch (Throwable $exception) {
                if (function_exists('AddMessage2Log')) {
                    AddMessage2Log('New lead notification for dealer ' . $dealerId . ': ' . $exception->getMessage(), 'superwindow.leads');
                }
            }
        }
        return $notified;
    }

    public function listForDealer($dealerId, array $input)
    {
        list($page, $pageSize) = swLeadNormalizePage($input);
        $filter = array('=dealer_id' => (int)$dealerId, '=in_app_visible' => 1);
        if (isset($input['unread']) && filter_var($input['unread'], FILTER_VALIDATE_BOOLEAN)) {
            $filter['=read_at'] = null;
        }

        $total = $this->repository->count('notifications', $filter);
        $items = $this->repository->find('notifications', $filter, array('created_at' => 'DESC', 'ID' => 'DESC'), $pageSize, ($page - 1) * $pageSize);

        return array($items, array('page' => $page, 'pageSize' => $pageSize, 'total' => $total));
    }

    public function markRead($dealerId, $notificationId)
    {
        $row = $this->repository->get('notifications', (int)$notificationId);
        if (!$row) {
            throw new SwLeadApiException(404, 'notification_not_found', 'Уведомление не найдено');
        }
        if ((int)$row['dealer_id'] !== (int)$dealerId) {
            throw new SwLeadApiException(403, 'notification_forbidden', 'Нет доступа к уведомлению');
        }
        if (empty($row['in_app_visible'])) {
            throw new SwLeadApiException(404, 'notification_not_found', 'Уведомление не найдено');
        }
        if (empty($row['read_at'])) {
            $this->repository->update('notifications', $row['id'], array('read_at' => swLeadUtcNow()));
            $row = $this->repository->get('notifications', $row['id']);
        }
        return $row;
    }

    public function markAllRead($dealerId)
    {
        $rows = $this->repository->find('notifications', array('=dealer_id' => (int)$dealerId, '=in_app_visible' => 1, '=read_at' => null), array('ID' => 'ASC'), 500, 0);
        $now = swLeadUtcNow();
        foreach ($rows as $row) {
            $this->repository->update('notifications', $row['id'], array('read_at' => $now));
        }
        return count($rows);
    }

    private function normalizePreferences(array $input, $strict = false)
    {
        $defaults = (array)swLeadConfig('notifications.defaults', array());
        $channels = (array)swLeadConfig('notifications.channels', array());
        $events = (array)swLeadConfig('notifications.events', array());
        $normalized = array();

        foreach ($channels as $channel) {
            $normalized[$channel] = array();
            foreach ($events as $event) {
                $fallback = !empty($defaults[$channel][$event]);
                if (isset($input[$channel]) && is_array($input[$channel]) && array_key_exists($event, $input[$channel])) {
                    $normalized[$channel][$event] = filter_var($input[$channel][$event], FILTER_VALIDATE_BOOLEAN);
                } else {
                    $normalized[$channel][$event] = $strict ? $fallback : $fallback;
                }
            }
        }

        return $normalized;
    }
}

class SwLeadB24Outbox
{
    private $repository;

    public function __construct(SwLeadRepository $repository)
    {
        $this->repository = $repository;
    }

    public function enqueue($aggregateType, $aggregateId, $event, array $payload)
    {
        $now = swLeadUtcNow();
        return $this->repository->add('outbox', array(
            'aggregate_type' => (string)$aggregateType,
            'aggregate_id' => (int)$aggregateId,
            'event' => (string)$event,
            'payload' => $payload,
            'status' => 'pending',
            'attempts' => 0,
            'next_attempt_at' => $now,
            'last_error' => '',
            'created_at' => $now,
            'updated_at' => $now,
            'sent_at' => null,
        ));
    }

    public function flush()
    {
        $enabled = (bool)swLeadConfig('b24.enabled', false);
        if (!$enabled) {
            return array('enabled' => false, 'processed' => 0, 'sent' => 0, 'failed' => 0, 'blocked' => 0);
        }
        $outbox = $this;
        // The HTTP maintenance endpoint and CLI cron may run concurrently.
        return $this->repository->withNamedLock('b24_outbox', 'delivery', function () use ($outbox) {
            return $outbox->flushLocked();
        }, 'b24_outbox_busy');
    }

    private function flushLocked()
    {
        $transport = (string)swLeadConfig('b24.transport', 'existing_bitrix24');
        $url = trim((string)swLeadConfig('b24.event_sink_url', ''));
        if (!in_array($transport, array('existing_bitrix24', 'event_sink'), true)) {
            throw new SwLeadApiException(503, 'b24_transport_unconfigured', 'Неизвестный транспорт Битрикс24');
        }
        if ($transport === 'event_sink' && $url === '') {
            throw new SwLeadApiException(503, 'b24_transport_unconfigured', 'Не указан адрес приёмника событий Битрикс24');
        }
        if ($transport === 'event_sink' && !function_exists('curl_init')) {
            throw new SwLeadApiException(503, 'curl_unavailable', 'Расширение cURL недоступно');
        }
        $adapter = $transport === 'existing_bitrix24' ? new SwLeadExistingB24Adapter($this->repository) : null;

        $now = swLeadUtcNow();
        $limit = (int)swLeadConfig('b24.batch_size', 25);
        $rows = $this->repository->find('outbox', array(
            'LOGIC' => 'OR',
            array('=status' => 'pending'),
            array('LOGIC' => 'AND', '=status' => 'retry', '<=next_attempt_at' => $now),
        ), array('ID' => 'ASC'), $limit, 0);

        $stats = array('enabled' => true, 'transport' => $transport, 'processed' => 0, 'sent' => 0, 'failed' => 0, 'blocked' => 0);
        foreach ($rows as $row) {
            $stats['processed']++;
            try {
                $result = $adapter ? $adapter->deliver($row) : $this->send($url, $row);
            } catch (Throwable $exception) {
                $code = $exception instanceof SwLeadApiException ? $exception->getErrorCode() : 'b24_transport_exception';
                $result = array('success' => false, 'error' => $code, 'blocked' => $code === 'b24_transport_unavailable');
            }
            if ($result['success']) {
                $stats['sent']++;
                $this->repository->update('outbox', $row['id'], array(
                    'status' => 'sent',
                    'attempts' => (int)$row['attempts'] + 1,
                    'last_error' => '',
                    'updated_at' => swLeadUtcNow(),
                    'sent_at' => swLeadUtcNow(),
                ));
                continue;
            }

            $stats['failed']++;
            $blocked = !empty($result['blocked']);
            if ($blocked) {
                $stats['blocked']++;
            }
            $attempts = (int)$row['attempts'] + ($blocked ? 0 : 1);
            $terminal = !$blocked && ((isset($result['retryable']) && !$result['retryable']) || $attempts >= (int)swLeadConfig('b24.max_attempts', 10));
            $delay = $blocked ? 900 : min(21600, (int)pow(2, min($attempts, 10)) * 60);
            $this->repository->update('outbox', $row['id'], array(
                'status' => $terminal ? 'failed' : 'retry',
                'attempts' => $attempts,
                'next_attempt_at' => swLeadUtcNow()->modify('+' . $delay . ' seconds'),
                'last_error' => substr((string)$result['error'], 0, 2000),
                'updated_at' => swLeadUtcNow(),
            ));
        }

        return $stats;
    }

    private function send($url, array $row)
    {
        $payload = array(
            'id' => $row['id'],
            'aggregateType' => $row['aggregate_type'],
            'aggregateId' => $row['aggregate_id'],
            'event' => $row['event'],
            'payload' => $row['payload'],
            'createdAt' => $row['created_at'],
        );
        $headers = array('Content-Type: application/json', 'Accept: application/json', 'X-Idempotency-Key: superwindow-outbox-' . $row['id']);
        $token = (string)swLeadConfig('b24.event_sink_token', '');
        if ($token !== '') {
            $headers[] = 'Authorization: Bearer ' . $token;
        }

        $curl = curl_init($url);
        curl_setopt_array($curl, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => swLeadJsonEncode($payload),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => (int)swLeadConfig('b24.timeout_seconds', 15),
        ));
        $response = curl_exec($curl);
        $errno = curl_errno($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);

        if ($response === false || $status < 200 || $status >= 300) {
            return array('success' => false, 'error' => $errno ? 'sink_curl_' . $errno : 'sink_HTTP_' . $status);
        }

        return array('success' => true);
    }
}
