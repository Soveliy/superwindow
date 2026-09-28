<?php

class SwLeadService
{
    private $repository;
    private $audit;
    private $notifications;
    private $outbox;

    public function __construct(
        SwLeadRepository $repository,
        SwLeadAuditService $audit,
        SwLeadNotificationService $notifications,
        SwLeadB24Outbox $outbox
    ) {
        $this->repository = $repository;
        $this->audit = $audit;
        $this->notifications = $notifications;
        $this->outbox = $outbox;
    }

    public function listLeads(array $input, array $actor)
    {
        list($page, $pageSize) = swLeadNormalizePage($input);
        $scope = isset($input['scope']) ? (string)$input['scope'] : 'available';
        if (!in_array($scope, array('available', 'my', 'archive'), true)) {
            throw new SwLeadApiException(422, 'validation_error', 'Неизвестный раздел лидов', array('field' => 'scope'));
        }

        $filter = array();
        if ($scope === 'available') {
            $filter['=status'] = 'available';
        } elseif ($scope === 'my') {
            $filter['=dealer_id'] = (int)$actor['dealer_id'];
            $filter['@status'] = array('assigned', 'in_work');
        } else {
            $filter['=dealer_id'] = (int)$actor['dealer_id'];
            $filter['@status'] = array('converted', 'expired', 'cancelled');
        }

        $serviceType = isset($input['serviceType']) ? $input['serviceType'] : (isset($input['service_type']) ? $input['service_type'] : (isset($input['type']) ? $input['type'] : ''));
        if ($serviceType !== '') {
            $serviceType = $this->normalizeLeadType($serviceType);
            $filter['=type'] = $serviceType;
        }
        if (!empty($input['region']) && $this->repository->supports('leads', 'region')) {
            $filter['=region'] = trim((string)$input['region']);
        }
        $product = isset($input['product']) ? trim((string)$input['product']) : (isset($input['productType']) ? trim((string)$input['productType']) : (isset($input['product_type']) ? trim((string)$input['product_type']) : ''));
        if ($product !== '' && $this->repository->supports('leads', 'product_type')) {
            $filter['=product_type'] = substr($product, 0, 255);
        }
        $budgetMin = isset($input['budgetMin']) ? $input['budgetMin'] : (isset($input['budget_min']) ? $input['budget_min'] : null);
        $budgetMax = isset($input['budgetMax']) ? $input['budgetMax'] : (isset($input['budget_max']) ? $input['budget_max'] : null);
        if ($budgetMin !== null && $budgetMin !== '' && $this->repository->supports('leads', 'budget')) {
            $filter['>=budget'] = (float)$budgetMin;
        }
        if ($budgetMax !== null && $budgetMax !== '' && $this->repository->supports('leads', 'budget')) {
            $filter['<=budget'] = (float)$budgetMax;
        }
        $search = isset($input['search']) ? trim((string)$input['search']) : '';
        if ($search !== '') {
            $term = substr($search, 0, 100);
            $filter[] = array(
                'LOGIC' => 'OR',
                '%title' => $term,
                '%product_type' => $term,
                '%city' => $term,
                '%region' => $term,
            );
        }

        $total = $this->repository->count('leads', $filter);
        $rows = $this->repository->find('leads', $filter, array('created_at' => 'DESC', 'ID' => 'DESC'), $pageSize, ($page - 1) * $pageSize);
        $items = array();
        foreach ($rows as $row) {
            $items[] = $this->presentLead($row, $actor, false);
        }

        return array($items, array('scope' => $scope, 'page' => $page, 'pageSize' => $pageSize, 'total' => $total));
    }

    public function getLead($identifier, array $actor)
    {
        $lead = $this->findLead($identifier);
        $this->guardLeadRead($lead, $actor);
        return $this->presentLead($lead, $actor, true);
    }

    public function getMeasurementOrderContext($identifier, array $input, array $actor)
    {
        $lead = $this->findLead($identifier);
        $this->guardLeadOwner($lead, $actor);
        if ($lead['type'] !== 'measurement') {
            throw new SwLeadApiException(422, 'wrong_lead_type', 'Стандартный заказ можно создать только из лида на замер');
        }
        if ($lead['status'] !== 'converted') {
            $this->assertVersion($lead, $input);
            if (!in_array($lead['status'], array('assigned', 'in_work'), true)) {
                throw new SwLeadApiException(409, 'lead_status_conflict', 'Из лида в текущем статусе нельзя создать заказ', array('status' => $lead['status']));
            }
            if ($this->scheduledDateForLead($lead) === null) {
                throw new SwLeadApiException(409, 'visit_not_scheduled', 'Сначала назначьте дату замера');
            }
        }
        if ($lead['status'] !== 'converted' && (trim((string)(isset($lead['product_type']) ? $lead['product_type'] : '')) === '' || !isset($lead['budget']) || $lead['budget'] === null)) {
            throw new SwLeadApiException(422, 'lead_order_data_incomplete', 'В лиде не заполнены тип продукта или бюджет, заказ создать нельзя');
        }

        return array(
            'leadId' => (int)$lead['id'],
            'dealerId' => (int)$lead['dealer_id'],
            'status' => (string)$lead['status'],
            'version' => max(1, (int)$lead['version']),
            'orderId' => !empty($lead['order_id']) ? (string)$lead['order_id'] : null,
            'productType' => (string)(isset($lead['product_type']) ? $lead['product_type'] : ''),
            'budget' => isset($lead['budget']) && $lead['budget'] !== null ? (float)$lead['budget'] : null,
            'customerName' => (string)(isset($lead['customer_name']) ? $lead['customer_name'] : ''),
            'phone' => (string)(isset($lead['phone']) ? $lead['phone'] : ''),
            'address' => (string)(isset($lead['address']) ? $lead['address'] : ''),
        );
    }

    public function takeLead($identifier, array $input, array $actor)
    {
        $lead = $this->findLead($identifier);
        $leadId = (int)$lead['id'];
        $service = $this;

        return $this->repository->locked('leads', $leadId, function ($current) use ($input, $actor, $service) {
            if (!$current) {
                throw new SwLeadApiException(404, 'lead_not_found', 'Лид не найден');
            }

            if ((int)$current['dealer_id'] === (int)$actor['dealer_id'] && in_array($current['status'], array('assigned', 'in_work', 'converted'), true)) {
                return $service->presentLead($current, $actor, true);
            }

            $service->assertVersion($current, $input);
            if ($current['status'] !== 'available' || !empty($current['dealer_id'])) {
                throw new SwLeadApiException(409, 'lead_unavailable', 'Лид уже недоступен', array('status' => $current['status']));
            }
            if (!empty($current['expire_at'])) {
                $expires = swLeadParseDateTime($current['expire_at'], 'expiresAt', true);
                if ($expires <= swLeadUtcNow()) {
                    throw new SwLeadApiException(409, 'lead_expired', 'Срок доступности лида истёк');
                }
            }

            $now = swLeadUtcNow();
            $changes = array(
                'status' => 'assigned',
                'dealer_id' => (int)$actor['dealer_id'],
                'taken_at' => $now,
                'schedule_deadline' => $now->modify('+' . (int)swLeadConfig('lead.schedule_timeout_seconds', 86400) . ' seconds'),
                'version' => max(1, (int)$current['version']) + 1,
                'updated_at' => $now,
            );
            $service->repository->update('leads', $current['id'], $changes);
            $updated = $service->repository->get('leads', $current['id']);
            $service->audit->record('lead', $current['id'], 'lead.taken', $actor, $current, $updated);
            $service->outbox->enqueue('lead', $current['id'], 'lead.taken', $service->integrationLeadPayload($updated));
            $service->notifications->create(
                $actor['dealer_id'],
                'new_lead',
                'Лид закреплён за вами',
                'Контакт клиента открыт. Назначьте дату в течение 24 часов.',
                array('notificationType' => 'lead_taken', 'leadId' => (string)$current['id']),
                'lead_taken_' . $current['id'] . '_' . $actor['dealer_id']
            );

            return $service->presentLead($updated, $actor, true);
        });
    }

    public function scheduleLead($identifier, array $input, array $actor)
    {
        $lead = $this->findLead($identifier);
        $leadId = (int)$lead['id'];
        list($visitAt, $timeWindow) = $this->parseVisit($input, true);
        $service = $this;

        return $this->repository->locked('leads', $leadId, function ($current) use ($input, $actor, $service, $visitAt, $timeWindow) {
            if (!$current) {
                throw new SwLeadApiException(404, 'lead_not_found', 'Лид не найден');
            }
            $service->guardLeadOwner($current, $actor);

            $sameVisit = swLeadIso($visitAt) === $service->scheduledDateForLead($current)
                && (string)$timeWindow === (string)(isset($current['time_window']) ? $current['time_window'] : '');
            if ($sameVisit && in_array($current['status'], array('in_work', 'converted'), true)) {
                return $service->presentLead($current, $actor, true);
            }

            $service->assertVersion($current, $input);
            if (!in_array($current['status'], array('assigned', 'in_work'), true)) {
                throw new SwLeadApiException(409, 'lead_status_conflict', 'Для лида в текущем статусе нельзя назначить дату', array('status' => $current['status']));
            }
            if (!empty($current['schedule_deadline']) && swLeadParseDateTime($current['schedule_deadline'], 'scheduleDueAt', true) < swLeadUtcNow()) {
                throw new SwLeadApiException(409, 'schedule_deadline_expired', 'Срок назначения даты истёк');
            }

            $now = swLeadUtcNow();
            $changes = array(
                'status' => 'in_work',
                'scheduled_at' => $visitAt,
                'time_window' => $timeWindow,
                'required_date_filled_at' => !empty($current['required_date_filled_at']) ? $current['required_date_filled_at'] : $now,
                'version' => max(1, (int)$current['version']) + 1,
                'updated_at' => $now,
            );
            $serviceDateField = $service->leadServiceDateField($current['type']);
            if ($serviceDateField === null) {
                throw new SwLeadApiException(503, 'lead_schema_error', 'Для типа лида не настроено поле даты');
            }
            $changes[$serviceDateField] = $visitAt;

            $workOrder = null;
            if (in_array($current['type'], array('installation', 'delivery'), true)) {
                $workOrder = $service->repository->findOne('work_orders', array('=lead_id' => (int)$current['id']), array('ID' => 'ASC'));
                if ($workOrder) {
                    $workOrder = $service->repository->getForUpdate('work_orders', $workOrder['id']);
                }
                if ($workOrder && $workOrder['status'] === 'cancelled' && in_array((string)$workOrder['cancellation_reason'], array('lead_returned_without_date', 'Лид возвращён: дата не назначена за 24 часа.'), true) && empty($workOrder['planned_at']) && empty($workOrder['fact_date']) && empty($workOrder['photo_ids'])) {
                    // Reclaim only an untouched legacy job explicitly cancelled
                    // when its lead returned to the marketplace. Ordinary cancelled
                    // jobs remain terminal and cannot be reassigned this way.
                    $beforeWorkOrder = $workOrder;
                    $service->repository->update('work_orders', $workOrder['id'], array(
                        'dealer_id' => (int)$actor['dealer_id'],
                        'status' => 'assigned',
                        'cancellation_reason' => '',
                        'type' => $current['type'],
                        'customer_name' => isset($current['customer_name']) ? $current['customer_name'] : '',
                        'phone' => isset($current['phone']) ? $current['phone'] : '',
                        'address' => isset($current['address']) ? $current['address'] : '',
                        'product_type' => isset($current['product_type']) ? $current['product_type'] : '',
                        'reward' => isset($current['reward']) ? $current['reward'] : null,
                        'version' => max(1, (int)$workOrder['version']) + 1,
                        'updated_at' => $now,
                    ));
                    $workOrder = $service->repository->get('work_orders', $workOrder['id']);
                    $service->audit->record('work_order', $workOrder['id'], 'work_order.reassigned', $actor, $beforeWorkOrder, $workOrder, array('leadId' => $current['id']));
                }
                if (!$workOrder) {
                    $workOrderId = $service->repository->add('work_orders', array(
                        'lead_id' => (int)$current['id'],
                        'b24_id' => isset($current['b24_id']) ? $current['b24_id'] : '',
                        'dealer_id' => (int)$actor['dealer_id'],
                        'type' => $current['type'],
                        'product_type' => isset($current['product_type']) ? $current['product_type'] : '',
                        'reward' => isset($current['reward']) ? $current['reward'] : null,
                        'status' => 'assigned',
                        'title' => isset($current['title']) ? $current['title'] : '',
                        'customer_name' => isset($current['customer_name']) ? $current['customer_name'] : '',
                        'phone' => isset($current['phone']) ? $current['phone'] : '',
                        'address' => isset($current['address']) ? $current['address'] : '',
                        'region' => isset($current['region']) ? $current['region'] : '',
                        'city' => isset($current['city']) ? $current['city'] : '',
                        'coordinates' => isset($current['coordinates']) ? $current['coordinates'] : array(),
                        'map_image_url' => isset($current['map_image_url']) ? $current['map_image_url'] : '',
                        'warehouse_address' => isset($current['warehouse_address']) ? $current['warehouse_address'] : '',
                        'route' => isset($current['route']) ? $current['route'] : array(),
                        'planned_at' => $visitAt,
                        'time_window' => $timeWindow,
                        'reminder_at' => $visitAt->modify('-' . (int)swLeadConfig('work_order.reminder_seconds', 7200) . ' seconds'),
                        'reminder' => array('message' => 'Связаться с клиентом перед выездом', 'minutesBefore' => (int)round((int)swLeadConfig('work_order.reminder_seconds', 7200) / 60)),
                        'photo_ids' => array(),
                        'comment' => isset($current['comment']) ? $current['comment'] : '',
                        'result_comment' => '',
                        'version' => 1,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ));
                    $displayId = ($current['type'] === 'delivery' ? 'Д-' : 'М-') . $workOrderId;
                    $service->repository->update('work_orders', $workOrderId, array('display_id' => $displayId));
                    $workOrder = $service->repository->get('work_orders', $workOrderId);
                    $service->audit->record('work_order', $workOrderId, 'work_order.created', $actor, array(), $workOrder, array('leadId' => $current['id']));
                    $service->outbox->enqueue('work_order', $workOrderId, 'work_order.created', $service->integrationWorkOrderPayload($workOrder));
                }

                if ((int)$workOrder['dealer_id'] !== (int)$actor['dealer_id']) {
                    throw new SwLeadApiException(409, 'work_order_owner_conflict', 'Заказ уже закреплён за другим дилером');
                }
                if (in_array($workOrder['status'], array('done', 'cancelled'), true)) {
                    throw new SwLeadApiException(409, 'work_order_status_conflict', 'Связанная работа уже завершена или отменена');
                }
                if (swLeadIso($visitAt) !== (isset($workOrder['planned_at']) ? $workOrder['planned_at'] : null)
                    || (string)$timeWindow !== (string)(isset($workOrder['time_window']) ? $workOrder['time_window'] : '')) {
                    // The earlier B24 API creates the work when taking a lead.
                    // Reuse that record and fill its planned date instead of
                    // leaving an undated job or creating a duplicate.
                    $beforeWorkOrder = $workOrder;
                    $service->repository->update('work_orders', $workOrder['id'], array(
                        'planned_at' => $visitAt,
                        'time_window' => $timeWindow,
                        'reminder_at' => $visitAt->modify('-' . (int)swLeadConfig('work_order.reminder_seconds', 7200) . ' seconds'),
                        'reminder_sent_at' => null,
                        'version' => max(1, (int)$workOrder['version']) + 1,
                        'updated_at' => $now,
                    ));
                    $workOrder = $service->repository->get('work_orders', $workOrder['id']);
                    $service->audit->record('work_order', $workOrder['id'], 'work_order.planned', $actor, $beforeWorkOrder, $workOrder, array('leadId' => $current['id']));
                    $service->outbox->enqueue('work_order', $workOrder['id'], 'work_order.planned', $service->integrationWorkOrderPayload($workOrder));
                }
                $changes['status'] = 'converted';
                $changes['converted_at'] = $now;
                $changes['work_order_id'] = (string)$workOrder['id'];
            }

            $service->repository->update('leads', $current['id'], $changes);
            $updated = $service->repository->get('leads', $current['id']);
            $service->audit->record('lead', $current['id'], 'lead.scheduled', $actor, $current, $updated, array(
                'workOrderId' => $workOrder ? $workOrder['id'] : null,
            ));
            $service->outbox->enqueue('lead', $current['id'], 'lead.scheduled', $service->integrationLeadPayload($updated));

            if ($workOrder) {
                $service->notifications->create(
                    $actor['dealer_id'],
                    'work_order',
                    'Назначен заказ ' . $service->workOrderDisplayId($workOrder),
                    'Дата сохранена. Заказ добавлен в список работ.',
                    array('notificationType' => 'work_order_assigned', 'leadId' => (string)$current['id'], 'workOrderId' => (string)$workOrder['id']),
                    'work_order_assigned_' . $workOrder['id']
                );
            }

            return $service->presentLead($updated, $actor, true);
        });
    }

    public function convertLead($identifier, array $input, array $actor, $measurementOnly = false)
    {
        $lead = $this->findLead($identifier);
        $leadId = (int)$lead['id'];
        $orderId = trim((string)(isset($input['orderId']) ? $input['orderId'] : (isset($input['order_id']) ? $input['order_id'] : '')));
        $workOrderId = trim((string)(isset($input['workOrderId']) ? $input['workOrderId'] : (isset($input['work_order_id']) ? $input['work_order_id'] : '')));
        if ($orderId === '' && $workOrderId === '') {
            throw new SwLeadApiException(422, 'validation_error', 'Укажите идентификатор созданного заказа');
        }
        $service = $this;

        return $this->repository->locked('leads', $leadId, function ($current) use ($input, $actor, $measurementOnly, $orderId, $workOrderId, $service) {
            if (!$current) {
                throw new SwLeadApiException(404, 'lead_not_found', 'Лид не найден');
            }
            $service->guardLeadOwner($current, $actor);
            if ($measurementOnly && $current['type'] !== 'measurement') {
                throw new SwLeadApiException(422, 'wrong_lead_type', 'Этот метод предназначен только для лидов на замер');
            }

            if ($current['status'] === 'converted') {
                $sameOrder = $orderId === '' || (string)(isset($current['order_id']) ? $current['order_id'] : '') === $orderId;
                $sameWorkOrder = $workOrderId === '' || (string)(isset($current['work_order_id']) ? $current['work_order_id'] : '') === $workOrderId;
                if ($sameOrder && $sameWorkOrder) {
                    return $service->presentLead($current, $actor, true);
                }
                throw new SwLeadApiException(409, 'lead_already_converted', 'Лид уже связан с другим заказом', array(
                    'orderId' => isset($current['order_id']) ? (string)$current['order_id'] : null,
                    'workOrderId' => isset($current['work_order_id']) ? (string)$current['work_order_id'] : null,
                ));
            }

            $service->assertVersion($current, $input);
            if (!in_array($current['status'], array('assigned', 'in_work'), true)) {
                throw new SwLeadApiException(409, 'lead_status_conflict', 'Лид нельзя конвертировать в текущем статусе', array('status' => $current['status']));
            }
            if ($current['type'] === 'measurement' && $service->scheduledDateForLead($current) === null) {
                throw new SwLeadApiException(409, 'visit_not_scheduled', 'Сначала назначьте дату замера');
            }

            $service->guardConversionTarget($current, $orderId, $workOrderId, $actor);

            $now = swLeadUtcNow();
            $changes = array(
                'status' => 'converted',
                'order_id' => $orderId !== '' ? $orderId : null,
                'work_order_id' => $workOrderId !== '' ? $workOrderId : null,
                'converted_at' => $now,
                'version' => max(1, (int)$current['version']) + 1,
                'updated_at' => $now,
            );
            $service->repository->update('leads', $current['id'], $changes);
            $updated = $service->repository->get('leads', $current['id']);
            $service->audit->record('lead', $current['id'], 'lead.converted', $actor, $current, $updated);
            $service->outbox->enqueue('lead', $current['id'], 'lead.converted', $service->integrationLeadPayload($updated));
            return $service->presentLead($updated, $actor, true);
        });
    }

    public function listWorkOrders(array $input, array $actor)
    {
        list($page, $pageSize) = swLeadNormalizePage($input);
        $scope = isset($input['scope']) ? (string)$input['scope'] : 'active';
        if (!in_array($scope, array('active', 'archive'), true)) {
            throw new SwLeadApiException(422, 'validation_error', 'Неизвестный раздел заказов', array('field' => 'scope'));
        }

        $filter = array('=dealer_id' => (int)$actor['dealer_id']);
        $filter['@status'] = $scope === 'archive' ? array('done', 'cancelled') : array('assigned', 'in_work');
        $type = isset($input['type']) ? trim((string)$input['type']) : '';
        if ($type !== '') {
            if (!in_array($type, array('delivery', 'installation'), true)) {
                throw new SwLeadApiException(422, 'validation_error', 'Неизвестный тип заказа', array('field' => 'type'));
            }
            $filter['=type'] = $type;
        }
        $search = isset($input['search']) ? trim((string)$input['search']) : '';
        if ($search !== '' && $this->repository->supports('work_orders', 'title')) {
            $filter['%title'] = substr($search, 0, 100);
        }

        $total = $this->repository->count('work_orders', $filter);
        $rows = $this->repository->find('work_orders', $filter, array('created_at' => 'DESC', 'ID' => 'DESC'), $pageSize, ($page - 1) * $pageSize);
        $items = array();
        foreach ($rows as $row) {
            $items[] = $this->presentWorkOrder($row, false);
        }

        return array($items, array('scope' => $scope, 'page' => $page, 'pageSize' => $pageSize, 'total' => $total));
    }

    public function getWorkOrder($identifier, array $actor)
    {
        $workOrder = $this->findWorkOrder($identifier);
        $this->guardWorkOrderOwner($workOrder, $actor);
        return $this->presentWorkOrder($workOrder, true);
    }

    public function updateWorkOrder($identifier, array $input, array $actor)
    {
        $workOrder = $this->findWorkOrder($identifier);
        $workOrderId = (int)$workOrder['id'];
        $service = $this;

        return $this->repository->locked('work_orders', $workOrderId, function ($current) use ($input, $actor, $service) {
            if (!$current) {
                throw new SwLeadApiException(404, 'work_order_not_found', 'Заказ не найден');
            }
            $service->guardWorkOrderOwner($current, $actor);
            $service->assertVersion($current, $input);
            if (in_array($current['status'], array('done', 'cancelled'), true)) {
                throw new SwLeadApiException(409, 'work_order_status_conflict', 'Завершённый или отменённый заказ нельзя изменить', array('status' => $current['status']));
            }

            $changes = array();
            if (isset($input['plannedVisit']) && is_array($input['plannedVisit'])) {
                list($plannedAt, $timeWindow) = $service->parseVisit($input['plannedVisit'], true);
                $changes['planned_at'] = $plannedAt;
                $changes['time_window'] = $timeWindow;
            } elseif (isset($input['date']) || isset($input['planned_at'])) {
                list($plannedAt, $timeWindow) = $service->parseVisit($input, true);
                $changes['planned_at'] = $plannedAt;
                $changes['time_window'] = $timeWindow;
            }

            if (isset($input['status'])) {
                $status = (string)$input['status'];
                if (!in_array($status, array('assigned', 'in_work'), true)) {
                    throw new SwLeadApiException(422, 'validation_error', 'Недопустимый статус заказа', array('field' => 'status'));
                }
                $changes['status'] = $status;
            }
            if (array_key_exists('comment', $input)) {
                $changes['comment'] = swLeadRequireString($input, 'comment', 4000, true);
            }
            if (array_key_exists('route', $input) && is_array($input['route'])) {
                $changes['route'] = $input['route'];
            }

            if (array_key_exists('reminder', $input)) {
                if ($input['reminder'] === null || $input['reminder'] === false) {
                    $changes['reminder'] = array();
                    $changes['reminder_at'] = null;
                    $changes['reminder_sent_at'] = null;
                } elseif (is_array($input['reminder'])) {
                    $minutes = (int)(isset($input['reminder']['minutesBefore']) ? $input['reminder']['minutesBefore'] : 0);
                    if ($minutes < 5 || $minutes > 10080) {
                        throw new SwLeadApiException(422, 'validation_error', 'Напоминание должно быть от 5 минут до 7 дней', array('field' => 'reminder.minutesBefore'));
                    }
                    $message = trim((string)(isset($input['reminder']['message']) ? $input['reminder']['message'] : 'Напоминание о заказе'));
                    $changes['reminder'] = array('message' => substr($message, 0, 500), 'minutesBefore' => $minutes);
                    $basePlannedAt = isset($changes['planned_at']) ? $changes['planned_at'] : (!empty($current['planned_at']) ? swLeadParseDateTime($current['planned_at'], 'plannedVisit', true) : null);
                    if (!$basePlannedAt) {
                        throw new SwLeadApiException(422, 'validation_error', 'Для напоминания сначала назначьте дату', array('field' => 'plannedVisit'));
                    }
                    $changes['reminder_at'] = $basePlannedAt->modify('-' . $minutes . ' minutes');
                    $changes['reminder_sent_at'] = null;
                } else {
                    throw new SwLeadApiException(422, 'validation_error', 'Некорректные настройки напоминания', array('field' => 'reminder'));
                }
            } elseif (isset($changes['planned_at']) && !empty($current['reminder'])) {
                $minutes = max(5, (int)(isset($current['reminder']['minutesBefore']) ? $current['reminder']['minutesBefore'] : 60));
                $changes['reminder_at'] = $changes['planned_at']->modify('-' . $minutes . ' minutes');
                $changes['reminder_sent_at'] = null;
            }

            if (!$changes) {
                return $service->presentWorkOrder($current, true);
            }
            $changes['version'] = max(1, (int)$current['version']) + 1;
            $changes['updated_at'] = swLeadUtcNow();
            $service->repository->update('work_orders', $current['id'], $changes);
            $updated = $service->repository->get('work_orders', $current['id']);
            $service->audit->record('work_order', $current['id'], 'work_order.updated', $actor, $current, $updated);
            $service->outbox->enqueue('work_order', $current['id'], 'work_order.updated', $service->integrationWorkOrderPayload($updated));
            return $service->presentWorkOrder($updated, true);
        });
    }

    public function completeWorkOrder($identifier, array $input, array $photoIds, array $actor)
    {
        $workOrder = $this->findWorkOrder($identifier);
        $workOrderId = (int)$workOrder['id'];
        $actualInput = isset($input['actualDate']) ? $input['actualDate'] : (isset($input['actual_date']) ? $input['actual_date'] : '');
        $actualDate = swLeadParseDateTime($actualInput, 'actualDate', true);
        $today = new DateTimeImmutable('today', new DateTimeZone(date_default_timezone_get()));
        if ($actualDate >= $today->modify('+1 day')) {
            throw new SwLeadApiException(422, 'validation_error', 'Фактическая дата не может быть в будущем', array('field' => 'actualDate'));
        }

        $service = $this;
        return $this->repository->locked('work_orders', $workOrderId, function ($current) use ($input, $photoIds, $actor, $service, $actualDate) {
            if (!$current) {
                throw new SwLeadApiException(404, 'work_order_not_found', 'Заказ не найден');
            }
            $service->guardWorkOrderOwner($current, $actor);

            if ($current['status'] === 'done') {
                $sameDate = $service->localDate($current['fact_date']) === $service->localDate($actualDate);
                if ($sameDate) {
                    return $service->presentWorkOrder($current, true);
                }
                throw new SwLeadApiException(409, 'work_order_already_completed', 'Заказ уже завершён с другой фактической датой');
            }

            $service->assertVersion($current, $input);
            if (!in_array($current['status'], array('assigned', 'in_work'), true)) {
                throw new SwLeadApiException(409, 'work_order_status_conflict', 'Заказ нельзя завершить в текущем статусе', array('status' => $current['status']));
            }

            $requiredTypes = (array)swLeadConfig('work_order.required_photo_types', array('delivery', 'installation'));
            $minimum = (int)swLeadConfig('work_order.min_photos', 1);
            if (in_array($current['type'], $requiredTypes, true) && count($photoIds) < $minimum) {
                throw new SwLeadApiException(422, 'photos_required', 'Для завершения заказа приложите фотоотчёт', array('minPhotos' => $minimum));
            }

            $now = swLeadUtcNow();
            $changes = array(
                'status' => 'done',
                'fact_date' => $actualDate,
                'photo_ids' => array_values($photoIds),
                'completed_at' => $now,
                'version' => max(1, (int)$current['version']) + 1,
                'updated_at' => $now,
            );
            $service->repository->update('work_orders', $current['id'], $changes);
            $updated = $service->repository->get('work_orders', $current['id']);
            $persistedPhotoIds = array_map('intval', (array)(isset($updated['photo_ids']) ? $updated['photo_ids'] : array()));
            if (array_diff(array_map('intval', $photoIds), $persistedPhotoIds)) {
                throw new SwLeadApiException(503, 'photo_persistence_failed', 'Не удалось прикрепить фотоотчёт. Завершение работы отменено.');
            }
            $service->audit->record('work_order', $current['id'], 'work_order.completed', $actor, $current, $updated);
            $service->outbox->enqueue('work_order', $current['id'], 'work_order.completed', $service->integrationWorkOrderPayload($updated));
            $service->notifications->create(
                $actor['dealer_id'],
                'work_order',
                'Заказ ' . $service->workOrderDisplayId($updated) . ' завершён',
                'Фотоотчёт сохранён, статус заказа обновлён.',
                array('notificationType' => 'work_order_completed', 'leadId' => isset($current['lead_id']) ? (string)$current['lead_id'] : null, 'workOrderId' => (string)$current['id']),
                'work_order_completed_' . $current['id']
            );
            return $service->presentWorkOrder($updated, true);
        });
    }

    public function importLeads(array $input, $idempotencyKey)
    {
        $items = isset($input['leads']) && is_array($input['leads']) ? $input['leads'] : array($input);
        if (!$items || count($items) > 100) {
            throw new SwLeadApiException(422, 'validation_error', 'За один запрос можно импортировать от 1 до 100 лидов');
        }

        $results = array();
        foreach ($items as $index => $item) {
            if (!is_array($item)) {
                throw new SwLeadApiException(422, 'validation_error', 'Элемент импорта должен быть объектом', array('index' => $index));
            }
            $itemKey = isset($item['idempotencyKey']) ? (string)$item['idempotencyKey'] : (string)$idempotencyKey;
            if (count($items) > 1 && $itemKey !== '') {
                $itemKey .= ':' . $index;
            }
            $results[] = $this->upsertImportedLead($item, $itemKey);
        }

        return $results;
    }

    /** Automatic discovery may create a new lead, but must never refresh an existing workflow. */
    public function importDiscoveredLead(array $item, $idempotencyKey)
    {
        return $this->upsertImportedLead($item, $idempotencyKey, true);
    }

    /** Shared validation for discovery previews; never writes or sends notifications. */
    public function validateDiscoveredLead(array $item)
    {
        $externalId = trim((string)$this->pick($item, array('externalId', 'b24EntityId', 'b24_id', 'UF_B24_ENTITY_ID'), ''));
        if ($externalId === '' || strlen($externalId) > 100) {
            throw new SwLeadApiException(422, 'validation_error', 'Не указан корректный ID сущности Битрикс24', array('field' => 'b24EntityId'));
        }
        $this->normalizeImportedLead($item, $externalId);
    }

    private function upsertImportedLead(array $item, $idempotencyKey, $createOnly = false)
    {
        $externalId = trim((string)$this->pick($item, array('externalId', 'b24EntityId', 'b24_id', 'UF_B24_ENTITY_ID'), ''));
        if ($externalId === '' || strlen($externalId) > 100) {
            throw new SwLeadApiException(422, 'validation_error', 'Не указан корректный ID сущности Битрикс24', array('field' => 'b24EntityId'));
        }
        if ($idempotencyKey !== '' && strlen($idempotencyKey) > 180) {
            throw new SwLeadApiException(422, 'validation_error', 'Слишком длинный ключ идемпотентности', array('field' => 'Idempotency-Key'));
        }

        $service = $this;
        $result = $this->repository->withImportLock($externalId, function () use ($item, $idempotencyKey, $externalId, $service, $createOnly) {
            return $service->repository->transaction(function () use ($item, $idempotencyKey, $externalId, $service, $createOnly) {
                $existing = $service->repository->findOne('leads', array('=b24_id' => $externalId), array('ID' => 'ASC'));
                if ($existing) {
                    $existing = $service->repository->getForUpdate('leads', (int)$existing['id']);
                }
                if ($existing && $createOnly) {
                    return array('created' => false, 'skipped' => true, 'reason' => 'existing', 'idempotent' => true, 'lead' => array('id' => (string)$existing['id']));
                }
                $now = swLeadUtcNow();
                $actor = array('user_id' => 0, 'dealer_id' => 0, 'is_admin' => true);
                if ($existing && $idempotencyKey !== '' && (string)(isset($existing['import_key']) ? $existing['import_key'] : '') === $idempotencyKey) {
                    if ($existing['status'] === 'cancelled') {
                        $cancelledWorkOrder = $service->cancelLinkedWorkOrderFromImport($existing, $actor, $now);
                        $service->notifyImportedCancellation($existing, $cancelledWorkOrder);
                    }
                    return array('created' => false, 'idempotent' => true, 'lead' => $service->presentLead($existing, array('dealer_id' => 0, 'user_id' => 0, 'is_admin' => true), true));
                }

                $values = $service->normalizeImportedLead($item, $externalId);
                if ($existing) {
                    $before = $existing;
                    $values['import_key'] = $idempotencyKey;
                    $values['version'] = max(1, (int)$existing['version']) + 1;
                    $values['updated_at'] = $now;

                    // Inbound data cannot steal a lead or silently reset dealer workflow.
                    unset($values['dealer_id'], $values['taken_at'], $values['schedule_deadline'], $values['required_date_filled_at'], $values['order_id'], $values['work_order_id'], $values['converted_at']);
                    if (!empty($existing['dealer_id'])) {
                        unset($values['type'], $values['scheduled_at'], $values['measure_date'], $values['install_date'], $values['delivery_date']);
                    }
                    if (!isset($values['status']) || $values['status'] !== 'cancelled') {
                        unset($values['status']);
                    }
                    foreach (array('expire_at', 'published_at') as $dateField) {
                        if (empty($values[$dateField])) {
                            unset($values[$dateField]);
                        }
                    }

                    $service->repository->update('leads', $existing['id'], $values);
                    $updated = $service->repository->get('leads', $existing['id']);
                    $service->audit->record('lead', $existing['id'], 'lead.imported_updated', $actor, $before, $updated, array('source' => 'b24'));
                    if ($updated['status'] === 'cancelled') {
                        $cancelledWorkOrder = $service->cancelLinkedWorkOrderFromImport($updated, $actor, $now);
                        $service->notifyImportedCancellation($updated, $cancelledWorkOrder);
                    }
                    return array('created' => false, 'idempotent' => false, 'lead' => $service->presentLead($updated, $actor, true));
                }

                $values['status'] = isset($values['status']) && $values['status'] === 'cancelled' ? 'cancelled' : 'available';
                $values['dealer_id'] = null;
                $values['import_key'] = $idempotencyKey;
                $values['version'] = 1;
                $values['published_at'] = isset($values['published_at']) ? $values['published_at'] : $now;
                $values['created_at'] = $now;
                $values['updated_at'] = $now;
                if (empty($values['expire_at'])) {
                    $values['expire_at'] = $now->modify('+' . (int)swLeadConfig('lead.default_ttl_seconds', 604800) . ' seconds');
                }
                $id = $service->repository->add('leads', $values);
                $created = $service->repository->get('leads', $id);
                $service->audit->record('lead', $id, 'lead.imported_created', $actor, array(), $created, array('source' => 'b24'));
                return array('created' => true, 'idempotent' => false, 'lead' => $service->presentLead($created, $actor, true));
            });
        });

        if (!empty($result['created']) && isset($result['lead']) && is_array($result['lead']) && $result['lead']['status'] === 'available') {
            $result['notifiedDealers'] = $this->notifications->broadcastNewLead($result['lead']);
        }
        return $result;
    }

    private function cancelLinkedWorkOrderFromImport(array $lead, array $actor, DateTimeImmutable $now)
    {
        $workOrder = null;
        if (!empty($lead['work_order_id'])) {
            $workOrder = $this->repository->getForUpdate('work_orders', (int)$lead['work_order_id']);
        }
        if (!$workOrder) {
            $candidate = $this->repository->findOne('work_orders', array('=lead_id' => (int)$lead['id']), array('ID' => 'ASC'));
            if ($candidate) {
                $workOrder = $this->repository->getForUpdate('work_orders', (int)$candidate['id']);
            }
        }
        if (!$workOrder) {
            return null;
        }
        if (!empty($lead['dealer_id']) && (int)$workOrder['dealer_id'] !== (int)$lead['dealer_id']) {
            throw new SwLeadApiException(409, 'work_order_owner_conflict', 'Связанный заказ закреплён за другим дилером');
        }
        if ($workOrder['status'] === 'cancelled') {
            return $workOrder;
        }
        if (!in_array($workOrder['status'], array('assigned', 'in_work'), true)) {
            return null;
        }

        $reason = trim((string)(isset($lead['cancellation_reason']) ? $lead['cancellation_reason'] : ''));
        if ($reason === '') {
            $reason = 'Отменено источником лида';
        }
        $this->repository->update('work_orders', $workOrder['id'], array(
            'status' => 'cancelled',
            'cancellation_reason' => substr($reason, 0, 2000),
            'version' => max(1, (int)$workOrder['version']) + 1,
            'updated_at' => $now,
        ));
        $updated = $this->repository->get('work_orders', $workOrder['id']);
        $this->audit->record('work_order', $workOrder['id'], 'work_order.cancelled_by_source', $actor, $workOrder, $updated, array(
            'source' => 'b24',
            'leadId' => (int)$lead['id'],
            'affectedDealerId' => (int)$workOrder['dealer_id'],
        ));
        $this->outbox->enqueue('work_order', $workOrder['id'], 'work_order.cancelled', $this->integrationWorkOrderPayload($updated));
        return $updated;
    }

    private function notifyImportedCancellation(array $lead, $workOrder)
    {
        if (empty($lead['dealer_id'])) {
            return;
        }
        if (is_array($workOrder) && $workOrder['status'] === 'cancelled') {
            $this->notifications->create(
                $lead['dealer_id'],
                'cancelled',
                'Заказ ' . $this->workOrderDisplayId($workOrder) . ' отменён',
                'Источник отменил связанный лид и заказ.',
                array('notificationType' => 'work_order_cancelled', 'leadId' => (string)$lead['id'], 'workOrderId' => (string)$workOrder['id']),
                'work_order_cancelled_' . $workOrder['id']
            );
            return;
        }
        $this->notifications->create(
            $lead['dealer_id'],
            'cancelled',
            'Лид отменён',
            'Лид ' . $lead['id'] . ' отменён источником.',
            array('notificationType' => 'work_order_cancelled', 'leadId' => (string)$lead['id']),
            'lead_cancelled_' . $lead['id']
        );
    }

    public function presentNotification(array $row)
    {
        $payload = isset($row['payload']) && is_array($row['payload']) ? $row['payload'] : array();
        $type = isset($payload['notificationType']) ? (string)$payload['notificationType'] : $this->notificationTypeForEvent($row['event']);
        $deliveries = array();
        $deliveryState = isset($row['delivery']) && is_array($row['delivery']) ? $row['delivery'] : array();
        foreach ((array)(isset($row['channels']) ? $row['channels'] : array()) as $channel) {
            $state = isset($deliveryState[$channel]['status']) ? (string)$deliveryState[$channel]['status'] : 'queued';
            $status = in_array($state, array('sent', 'available'), true) ? 'sent' : ($state === 'failed' ? 'failed' : 'pending');
            $delivery = array('channel' => (string)$channel, 'status' => $status);
            if ($status === 'sent') {
                $delivery['sentAt'] = isset($deliveryState[$channel]['sentAt']) ? $deliveryState[$channel]['sentAt'] : $row['created_at'];
            }
            $deliveries[] = $delivery;
        }

        $result = array(
            'id' => (string)$row['id'],
            'type' => $type,
            'title' => (string)$row['title'],
            'message' => (string)(isset($row['message']) ? $row['message'] : ''),
            'createdAt' => (string)$row['created_at'],
            'deliveries' => $deliveries,
        );
        if (!empty($row['read_at'])) {
            $result['readAt'] = $row['read_at'];
        }
        if (!empty($payload['leadId'])) {
            $result['leadId'] = (string)$payload['leadId'];
        }
        if (!empty($payload['workOrderId'])) {
            $result['workOrderId'] = (string)$payload['workOrderId'];
        }
        return $result;
    }

    public function integrationLeadPayload(array $lead)
    {
        $measureDate = $this->leadDateForType($lead, 'measurement');
        $installDate = $this->leadDateForType($lead, 'installation');
        $deliveryDate = $this->leadDateForType($lead, 'delivery');
        return array(
            'leadId' => (int)$lead['id'],
            'b24EntityId' => isset($lead['b24_id']) ? (string)$lead['b24_id'] : '',
            'type' => isset($lead['type']) ? (string)$lead['type'] : '',
            'status' => isset($lead['status']) ? (string)$lead['status'] : '',
            'dealerId' => !empty($lead['dealer_id']) ? (int)$lead['dealer_id'] : null,
            'takenAt' => isset($lead['taken_at']) ? $lead['taken_at'] : null,
            'scheduledAt' => $this->scheduledDateForLead($lead),
            'measureDate' => $measureDate,
            'installDate' => $installDate,
            'deliveryDate' => $deliveryDate,
            'orderId' => isset($lead['order_id']) ? $lead['order_id'] : null,
            'workOrderId' => isset($lead['work_order_id']) ? $lead['work_order_id'] : null,
            'version' => isset($lead['version']) ? (int)$lead['version'] : 0,
        );
    }

    public function integrationWorkOrderPayload(array $workOrder)
    {
        return array(
            'workOrderId' => (int)$workOrder['id'],
            'leadId' => isset($workOrder['lead_id']) ? (int)$workOrder['lead_id'] : null,
            'b24EntityId' => isset($workOrder['b24_id']) ? (string)$workOrder['b24_id'] : '',
            'type' => isset($workOrder['type']) ? (string)$workOrder['type'] : '',
            'status' => isset($workOrder['status']) ? (string)$workOrder['status'] : '',
            'dealerId' => isset($workOrder['dealer_id']) ? (int)$workOrder['dealer_id'] : null,
            'plannedAt' => isset($workOrder['planned_at']) ? $workOrder['planned_at'] : null,
            'actualDate' => isset($workOrder['fact_date']) ? $workOrder['fact_date'] : null,
            'photoIds' => isset($workOrder['photo_ids']) ? $workOrder['photo_ids'] : array(),
            'version' => isset($workOrder['version']) ? (int)$workOrder['version'] : 0,
        );
    }

    private function normalizeImportedLead(array $item, $externalId)
    {
        $customer = isset($item['customer']) && is_array($item['customer']) ? $item['customer'] : array();
        $project = isset($item['project']) && is_array($item['project']) ? $item['project'] : array();
        $location = isset($item['location']) && is_array($item['location']) ? $item['location'] : array();
        $type = $this->normalizeLeadType($this->pick($item, array('serviceType', 'leadType', 'type', 'UF_LEAD_TYPE'), ''));
        $productType = trim((string)$this->pick($item, array('productType', 'product_type', 'UF_PRODUCT_TYPE'), isset($project['product']) ? $project['product'] : ''));
        $title = trim((string)$this->pick($item, array('title', 'UF_TITLE'), $productType !== '' ? $productType : 'Лид ' . $externalId));
        if ($title === '' || (function_exists('mb_strlen') ? mb_strlen($title, 'UTF-8') : strlen($title)) > 255) {
            throw new SwLeadApiException(422, 'validation_error', 'Некорректное название лида', array('field' => 'title'));
        }

        $budgetInput = $this->pick($item, array('budget', 'UF_BUDGET'), isset($project['budget']) ? $project['budget'] : null);
        $budget = null;
        if (is_array($budgetInput)) {
            $budget = isset($budgetInput['max']) ? (float)$budgetInput['max'] : (isset($budgetInput['amount']) ? (float)$budgetInput['amount'] : null);
        } elseif ($budgetInput !== null && $budgetInput !== '') {
            $budget = (float)$budgetInput;
        }
        $rewardInput = $this->pick($item, array('reward', 'UF_REWARD'), null);
        $reward = is_array($rewardInput) ? (isset($rewardInput['amount']) ? (float)$rewardInput['amount'] : null) : ($rewardInput === null || $rewardInput === '' ? null : (float)$rewardInput);

        $coordinates = $this->pick($item, array('coordinates'), null);
        if ($coordinates === null && (isset($location['latitude']) || isset($location['longitude']))) {
            $coordinates = array('latitude' => isset($location['latitude']) ? (float)$location['latitude'] : null, 'longitude' => isset($location['longitude']) ? (float)$location['longitude'] : null);
        }
        if (is_string($coordinates)) {
            $parts = array_map('trim', explode(',', $coordinates));
            $coordinates = count($parts) >= 2 ? array('latitude' => (float)$parts[0], 'longitude' => (float)$parts[1]) : array();
        }

        $attachments = $this->pick($item, array('attachments', 'files'), array());
        $attachments = $this->normalizeAttachments(is_array($attachments) ? $attachments : array());
        $statusInput = strtolower(trim((string)$this->pick($item, array('status', 'UF_STATUS'), 'available')));
        $status = in_array($statusInput, array('cancelled', 'canceled', 'отменен', 'отменён'), true) ? 'cancelled' : 'available';

        $source = $item;
        unset($source['api_key'], $source['apiKey'], $source['token'], $source['auth']);
        $encodedSource = swLeadJsonEncode($source);
        if (strlen($encodedSource) > 45000) {
            $source = array('externalId' => $externalId, 'truncated' => true);
        }

        $published = $this->pick($item, array('publishedAt', 'published_at', 'createdTime'), null);
        $expires = $this->pick($item, array('expiresAt', 'expireAt', 'dateExpire', 'UF_DATE_EXPIRE'), null);
        $measureRaw = $this->pick($item, array('measureDate', 'measurementDate', 'measure_date', 'UF_MEASURE_DATE'), null);
        $installRaw = $this->pick($item, array('installDate', 'installationDate', 'install_date', 'UF_INSTALL_DATE'), null);
        $deliveryRaw = $this->pick($item, array('deliveryDate', 'delivery_date', 'UF_DELIVERY_DATE'), null);
        $scheduledRaw = $this->pick($item, array('scheduledAt', 'scheduled_at'), null);
        $measureDate = $measureRaw === null || trim((string)$measureRaw) === '' ? null : swLeadParseDateTime($measureRaw, 'measureDate', true);
        $installDate = $installRaw === null || trim((string)$installRaw) === '' ? null : swLeadParseDateTime($installRaw, 'installDate', true);
        $deliveryDate = $deliveryRaw === null || trim((string)$deliveryRaw) === '' ? null : swLeadParseDateTime($deliveryRaw, 'deliveryDate', true);
        $scheduledAt = $scheduledRaw === null || trim((string)$scheduledRaw) === '' ? null : swLeadParseDateTime($scheduledRaw, 'scheduledAt', true);
        $typeDateField = $this->leadServiceDateField($type);
        $datesByField = array(
            'measure_date' => $measureDate,
            'install_date' => $installDate,
            'delivery_date' => $deliveryDate,
        );
        if ($scheduledAt !== null && $typeDateField !== null && $datesByField[$typeDateField] === null) {
            $datesByField[$typeDateField] = $scheduledAt;
        }
        if ($typeDateField !== null && $datesByField[$typeDateField] !== null) {
            $scheduledAt = $datesByField[$typeDateField];
        }

        return array(
            'b24_id' => $externalId,
            'type' => $type,
            'product_type' => substr($productType, 0, 255),
            'status' => $status,
            'title' => $title,
            'customer_name' => substr(trim((string)$this->pick($item, array('clientName', 'customerName', 'UF_CLIENT_NAME'), isset($customer['name']) ? $customer['name'] : '')), 0, 255),
            'phone' => substr(trim((string)$this->pick($item, array('phone', 'UF_PHONE'), isset($customer['phone']) ? $customer['phone'] : '')), 0, 60),
            'email' => substr(trim((string)$this->pick($item, array('email', 'UF_EMAIL'), '')), 0, 255),
            'region' => substr(trim((string)$this->pick($item, array('region', 'UF_REGION'), isset($location['region']) ? $location['region'] : '')), 0, 255),
            'city' => substr(trim((string)$this->pick($item, array('city', 'UF_CITY'), isset($location['city']) ? $location['city'] : '')), 0, 255),
            'address' => substr(trim((string)$this->pick($item, array('address', 'UF_ADDRESS'), isset($location['address']) ? $location['address'] : '')), 0, 1000),
            'coordinates' => is_array($coordinates) ? $coordinates : array(),
            'map_image_url' => substr(trim((string)$this->pick($item, array('mapImageUrl'), isset($location['mapImageUrl']) ? $location['mapImageUrl'] : '')), 0, 2000),
            'volume' => substr(trim((string)$this->pick($item, array('volume'), isset($project['volume']) ? $project['volume'] : '')), 0, 255),
            'budget' => $budget,
            'reward' => $reward,
            'comment' => substr(trim((string)$this->pick($item, array('comment', 'factoryNotes', 'UF_COMMENT'), '')), 0, 10000),
            'files' => $attachments,
            'warehouse_address' => substr(trim((string)$this->pick($item, array('warehouseAddress'), '')), 0, 1000),
            'route' => is_array($this->pick($item, array('route'), array())) ? $this->pick($item, array('route'), array()) : array(),
            'time_window' => substr(trim((string)$this->pick($item, array('timeWindow'), '')), 0, 100),
            'scheduled_at' => $scheduledAt,
            'measure_date' => $datesByField['measure_date'],
            'install_date' => $datesByField['install_date'],
            'delivery_date' => $datesByField['delivery_date'],
            'expire_at' => $expires ? swLeadParseDateTime($expires, 'expiresAt', true) : null,
            'published_at' => $published ? swLeadParseDateTime($published, 'publishedAt', true) : null,
            'cancellation_reason' => substr(trim((string)$this->pick($item, array('cancellationReason'), '')), 0, 2000),
            'source_data' => $source,
        );
    }

    private function normalizeAttachments(array $attachments)
    {
        if (count($attachments) > 30) {
            throw new SwLeadApiException(422, 'validation_error', 'Слишком много файлов лида', array('maxFiles' => 30));
        }
        $normalized = array();
        foreach ($attachments as $index => $attachment) {
            if (!is_array($attachment)) {
                continue;
            }
            $url = trim((string)(isset($attachment['url']) ? $attachment['url'] : ''));
            if ($url !== '' && !preg_match('#^(https://|/)#i', $url)) {
                throw new SwLeadApiException(422, 'validation_error', 'Недопустимый адрес файла', array('index' => $index));
            }
            $normalized[] = array(
                'id' => substr((string)(isset($attachment['id']) ? $attachment['id'] : $index + 1), 0, 100),
                'name' => substr(trim((string)(isset($attachment['name']) ? $attachment['name'] : 'Файл')), 0, 255),
                'url' => substr($url, 0, 2000),
                'kind' => isset($attachment['kind']) && $attachment['kind'] === 'image' ? 'image' : 'document',
                'mimeType' => substr(trim((string)(isset($attachment['mimeType']) ? $attachment['mimeType'] : '')), 0, 150),
                'size' => max(0, (int)(isset($attachment['size']) ? $attachment['size'] : 0)),
                'thumbnailUrl' => substr(trim((string)(isset($attachment['thumbnailUrl']) ? $attachment['thumbnailUrl'] : '')), 0, 2000),
            );
        }
        if (strlen(swLeadJsonEncode($normalized)) > (int)swLeadConfig('storage.max_json_bytes', 56000)) {
            throw new SwLeadApiException(422, 'attachments_too_large', 'Описание файлов лида превышает допустимый размер');
        }
        return $normalized;
    }

    private function findLead($identifier)
    {
        $identifier = trim((string)$identifier);
        if ($identifier === '') {
            throw new SwLeadApiException(422, 'validation_error', 'Не указан идентификатор лида', array('field' => 'lead_id'));
        }
        $lead = ctype_digit($identifier) ? $this->repository->get('leads', (int)$identifier) : null;
        if (!$lead) {
            $lead = $this->repository->findOne('leads', array('=b24_id' => $identifier), array('ID' => 'ASC'));
        }
        if (!$lead) {
            throw new SwLeadApiException(404, 'lead_not_found', 'Лид не найден');
        }
        return $lead;
    }

    private function findWorkOrder($identifier)
    {
        $identifier = trim((string)$identifier);
        if ($identifier === '') {
            throw new SwLeadApiException(422, 'validation_error', 'Не указан идентификатор заказа', array('field' => 'work_order_id'));
        }
        $workOrder = ctype_digit($identifier) ? $this->repository->get('work_orders', (int)$identifier) : null;
        if (!$workOrder && $this->repository->supports('work_orders', 'display_id')) {
            $workOrder = $this->repository->findOne('work_orders', array('=display_id' => $identifier), array('ID' => 'ASC'));
        }
        if (!$workOrder) {
            throw new SwLeadApiException(404, 'work_order_not_found', 'Заказ не найден');
        }
        return $workOrder;
    }

    private function guardLeadRead(array $lead, array $actor)
    {
        if (!empty($actor['is_admin']) || $lead['status'] === 'available' || (int)$lead['dealer_id'] === (int)$actor['dealer_id']) {
            return;
        }
        throw new SwLeadApiException(403, 'lead_forbidden', 'Нет доступа к этому лиду');
    }

    private function guardLeadOwner(array $lead, array $actor)
    {
        if (!empty($actor['is_admin']) || ((int)$lead['dealer_id'] > 0 && (int)$lead['dealer_id'] === (int)$actor['dealer_id'])) {
            return;
        }
        throw new SwLeadApiException(403, 'lead_forbidden', 'Лид закреплён за другим дилером');
    }

    private function guardWorkOrderOwner(array $workOrder, array $actor)
    {
        if (!empty($actor['is_admin']) || (int)$workOrder['dealer_id'] === (int)$actor['dealer_id']) {
            return;
        }
        throw new SwLeadApiException(403, 'work_order_forbidden', 'Заказ закреплён за другим дилером');
    }

    private function guardConversionTarget(array $lead, $orderId, $workOrderId, array $actor)
    {
        if ($lead['type'] === 'measurement') {
            if (!ctype_digit((string)$orderId) || (int)$orderId <= 0 || $workOrderId !== '') {
                throw new SwLeadApiException(422, 'invalid_conversion_target', 'Для замера требуется идентификатор стандартного заказа');
            }
            if (!\Bitrix\Main\Loader::includeModule('sale')) {
                throw new SwLeadApiException(503, 'sale_module_unavailable', 'Модуль sale недоступен');
            }
            $order = \Bitrix\Sale\Order::load((int)$orderId);
            if (!$order || (int)$order->getField('RESPONSIBLE_ID') !== (int)$actor['user_id']) {
                throw new SwLeadApiException(403, 'conversion_order_forbidden', 'Заказ не найден или принадлежит другому дилеру');
            }
            $code = (string)swLeadConfig('sale_order.property_codes.lead_id', 'SOURCE_LEAD_ID');
            foreach ($order->getPropertyCollection() as $property) {
                if ((string)$property->getField('CODE') === $code && (string)$property->getValue() === (string)$lead['id']) {
                    return;
                }
            }
            throw new SwLeadApiException(409, 'conversion_order_source_mismatch', 'Заказ не создан из этого лида');
        }

        if (!ctype_digit((string)$workOrderId) || (int)$workOrderId <= 0 || $orderId !== '') {
            throw new SwLeadApiException(422, 'invalid_conversion_target', 'Для монтажа или доставки требуется идентификатор рабочей заявки');
        }
        $workOrder = $this->repository->get('work_orders', (int)$workOrderId);
        if (!$workOrder || (int)$workOrder['lead_id'] !== (int)$lead['id'] || (int)$workOrder['dealer_id'] !== (int)$lead['dealer_id'] || $workOrder['type'] !== $lead['type']) {
            throw new SwLeadApiException(403, 'conversion_work_order_forbidden', 'Рабочая заявка не связана с этим лидом и дилером');
        }
    }

    private function assertVersion(array $row, array $input)
    {
        $expected = array_key_exists('expectedVersion', $input) ? $input['expectedVersion'] : (array_key_exists('expected_version', $input) ? $input['expected_version'] : null);
        if ($expected !== null && $expected !== '' && (int)$expected !== (int)$row['version']) {
            throw new SwLeadApiException(409, 'version_conflict', 'Данные уже изменились. Обновите страницу и повторите действие.', array(
                'expectedVersion' => (int)$expected,
                'actualVersion' => (int)$row['version'],
            ));
        }
    }

    private function parseVisit(array $input, $required)
    {
        $dateValue = isset($input['date']) ? trim((string)$input['date']) : '';
        $plannedRaw = isset($input['scheduled_at']) ? $input['scheduled_at'] : (isset($input['planned_at']) ? $input['planned_at'] : '');
        $timeFrom = isset($input['timeFrom']) ? trim((string)$input['timeFrom']) : (isset($input['time_from']) ? trim((string)$input['time_from']) : '');
        $timeTo = isset($input['timeTo']) ? trim((string)$input['timeTo']) : (isset($input['time_to']) ? trim((string)$input['time_to']) : '');
        if ($dateValue === '' && $plannedRaw !== '') {
            $date = swLeadParseDateTime($plannedRaw, 'date', $required);
            $dateValue = $date->setTimezone(new DateTimeZone(date_default_timezone_get()))->format('Y-m-d');
            if ($timeFrom === '') {
                $timeFrom = $date->setTimezone(new DateTimeZone(date_default_timezone_get()))->format('H:i');
            }
        }
        if ($dateValue === '') {
            if ($required) {
                throw new SwLeadApiException(422, 'validation_error', 'Укажите дату визита', array('field' => 'date'));
            }
            return array(null, '');
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateValue)) {
            throw new SwLeadApiException(422, 'validation_error', 'Дата должна быть в формате YYYY-MM-DD', array('field' => 'date'));
        }
        $parts = array_map('intval', explode('-', $dateValue));
        if (!checkdate($parts[1], $parts[2], $parts[0])) {
            throw new SwLeadApiException(422, 'validation_error', 'Указана несуществующая дата', array('field' => 'date'));
        }
        foreach (array('timeFrom' => $timeFrom, 'timeTo' => $timeTo) as $field => $time) {
            if ($time !== '' && !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $time)) {
                throw new SwLeadApiException(422, 'validation_error', 'Время должно быть в формате HH:MM', array('field' => $field));
            }
        }
        if ($timeFrom !== '' && $timeTo !== '' && strcmp($timeFrom, $timeTo) >= 0) {
            throw new SwLeadApiException(422, 'validation_error', 'Начало интервала должно быть раньше окончания');
        }

        $timezone = new DateTimeZone(date_default_timezone_get());
        $visitAt = new DateTimeImmutable($dateValue . ' ' . ($timeFrom !== '' ? $timeFrom : '00:00') . ':00', $timezone);
        $today = new DateTimeImmutable('today', $timezone);
        if ($visitAt < $today) {
            throw new SwLeadApiException(422, 'validation_error', 'Дата визита не может быть в прошлом', array('field' => 'date'));
        }

        return array($visitAt, $timeFrom . '|' . $timeTo);
    }

    private function leadServiceDateField($type)
    {
        $map = array(
            'measurement' => 'measure_date',
            'installation' => 'install_date',
            'delivery' => 'delivery_date',
        );
        $type = (string)$type;
        return isset($map[$type]) ? $map[$type] : null;
    }

    private function leadDateForType(array $lead, $type)
    {
        $field = $this->leadServiceDateField($type);
        if ($field !== null && !empty($lead[$field])) {
            return $lead[$field];
        }
        if ((string)(isset($lead['type']) ? $lead['type'] : '') === (string)$type && !empty($lead['scheduled_at'])) {
            return $lead['scheduled_at'];
        }
        return null;
    }

    private function scheduledDateForLead(array $lead)
    {
        $type = (string)(isset($lead['type']) ? $lead['type'] : '');
        return $this->leadDateForType($lead, $type);
    }

    private function normalizeLeadType($value)
    {
        $value = trim((string)$value);
        $lower = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
        $map = array(
            'measurement' => 'measurement', 'measure' => 'measurement', 'замер' => 'measurement',
            'installation' => 'installation', 'install' => 'installation', 'монтаж' => 'installation',
            'delivery' => 'delivery', 'доставка' => 'delivery',
        );
        if (!isset($map[$lower])) {
            throw new SwLeadApiException(422, 'validation_error', 'Неизвестный тип лида', array('field' => 'serviceType', 'value' => $value));
        }
        return $map[$lower];
    }

    private function presentLead(array $lead, array $actor, $details)
    {
        $isOwner = (int)(isset($lead['dealer_id']) ? $lead['dealer_id'] : 0) > 0
            && (int)$lead['dealer_id'] === (int)(isset($actor['dealer_id']) ? $actor['dealer_id'] : 0);
        $canSeePrivate = !empty($actor['is_admin']) || $isOwner;
        $source = isset($lead['source_data']) && is_array($lead['source_data']) ? $lead['source_data'] : array();
        $budget = isset($source['budget']) && is_array($source['budget']) ? $source['budget'] : null;
        if (!$budget && isset($source['project']['budget']) && is_array($source['project']['budget'])) {
            $budget = $source['project']['budget'];
        }
        if (!$budget && isset($lead['budget']) && $lead['budget'] !== null) {
            $budget = array('min' => (float)$lead['budget'], 'max' => (float)$lead['budget'], 'currency' => 'RUB');
        }
        if ($budget) {
            $budget = array('min' => (float)(isset($budget['min']) ? $budget['min'] : $budget['max']), 'max' => (float)(isset($budget['max']) ? $budget['max'] : $budget['min']), 'currency' => 'RUB');
        }
        $reward = isset($lead['reward']) && $lead['reward'] !== null ? array('amount' => (float)$lead['reward'], 'currency' => 'RUB') : null;
        $customerName = $canSeePrivate ? (string)(isset($lead['customer_name']) ? $lead['customer_name'] : '') : $this->maskName(isset($lead['customer_name']) ? $lead['customer_name'] : '');
        $phone = $canSeePrivate ? (string)(isset($lead['phone']) ? $lead['phone'] : '') : $this->maskPhone(isset($lead['phone']) ? $lead['phone'] : '');
        $measureDate = $this->leadDateForType($lead, 'measurement');
        $installDate = $this->leadDateForType($lead, 'installation');
        $deliveryDate = $this->leadDateForType($lead, 'delivery');
        $scheduledVisit = $this->visitForPresentation($this->scheduledDateForLead($lead), isset($lead['time_window']) ? $lead['time_window'] : '');

        $result = array(
            'id' => (string)$lead['id'],
            'externalId' => isset($lead['b24_id']) && $lead['b24_id'] !== '' ? (string)$lead['b24_id'] : null,
            'version' => max(1, (int)(isset($lead['version']) ? $lead['version'] : 1)),
            'status' => (string)$lead['status'],
            'serviceType' => (string)$lead['type'],
            'title' => (string)(isset($lead['title']) ? $lead['title'] : ''),
            'region' => (string)(isset($lead['region']) ? $lead['region'] : ''),
            'city' => (string)(isset($lead['city']) ? $lead['city'] : ''),
            'product' => (string)(!empty($lead['product_type']) ? $lead['product_type'] : (isset($lead['title']) ? $lead['title'] : '')),
            'publishedAt' => (string)(!empty($lead['published_at']) ? $lead['published_at'] : $lead['created_at']),
            'expiresAt' => (string)(isset($lead['expire_at']) ? $lead['expire_at'] : ''),
            'customer' => array('name' => $customerName, 'phone' => $phone, 'isMasked' => !$canSeePrivate),
        );
        if ($budget) {
            $result['budget'] = $budget;
        }
        if ($reward) {
            $result['reward'] = $reward;
        }
        if ($scheduledVisit) {
            $result['scheduledVisit'] = $scheduledVisit;
        }
        if ($measureDate !== null) {
            $result['measureDate'] = $measureDate;
        }
        if ($installDate !== null) {
            $result['installDate'] = $installDate;
        }
        if ($deliveryDate !== null) {
            $result['deliveryDate'] = $deliveryDate;
        }

        if (!$details) {
            return $result;
        }

        $coordinates = $canSeePrivate ? $this->normalizeCoordinates(isset($lead['coordinates']) ? $lead['coordinates'] : array()) : array();
        $location = array(
            'region' => (string)(isset($lead['region']) ? $lead['region'] : ''),
            'city' => (string)(isset($lead['city']) ? $lead['city'] : ''),
        );
        if ($canSeePrivate) {
            if (!empty($lead['address'])) {
                $location['address'] = (string)$lead['address'];
            }
            if (isset($coordinates['latitude'])) {
                $location['latitude'] = $coordinates['latitude'];
            }
            if (isset($coordinates['longitude'])) {
                $location['longitude'] = $coordinates['longitude'];
            }
            if (!empty($lead['map_image_url'])) {
                $location['mapImageUrl'] = (string)$lead['map_image_url'];
            }
        }

        $result['project'] = array(
            'product' => (string)(!empty($lead['product_type']) ? $lead['product_type'] : $lead['title']),
        );
        if (!empty($lead['volume'])) {
            $result['project']['volume'] = (string)$lead['volume'];
        }
        if ($budget) {
            $result['project']['budget'] = $budget;
        }
        $result['location'] = $location;
        if ($canSeePrivate && !empty($lead['comment'])) {
            $result['factoryNotes'] = (string)$lead['comment'];
        }
        $result['attachments'] = $canSeePrivate ? array_values((array)(isset($lead['files']) ? $lead['files'] : array())) : array();
        if ($isOwner || !empty($actor['is_admin'])) {
            if (!empty($lead['dealer_id'])) {
                $result['dealerId'] = (string)$lead['dealer_id'];
            }
            if (!empty($lead['taken_at'])) {
                $result['takenAt'] = $lead['taken_at'];
            }
            if (!empty($lead['schedule_deadline'])) {
                $result['scheduleDueAt'] = $lead['schedule_deadline'];
            }
            if (!empty($lead['converted_at'])) {
                $result['convertedAt'] = $lead['converted_at'];
            }
            if (!empty($lead['order_id'])) {
                $result['convertedOrderId'] = (string)$lead['order_id'];
            }
            if (!empty($lead['work_order_id'])) {
                $result['convertedWorkOrderId'] = (string)$lead['work_order_id'];
            }
            if (!empty($lead['cancellation_reason'])) {
                $result['cancellationReason'] = (string)$lead['cancellation_reason'];
            }
        }
        $result['createdAt'] = (string)$lead['created_at'];
        $result['updatedAt'] = (string)$lead['updated_at'];
        return $result;
    }

    private function presentWorkOrder(array $workOrder, $details)
    {
        $destination = array(
            'region' => (string)(isset($workOrder['region']) ? $workOrder['region'] : ''),
            'city' => (string)(isset($workOrder['city']) ? $workOrder['city'] : ''),
        );
        if (!empty($workOrder['address'])) {
            $destination['address'] = (string)$workOrder['address'];
        }
        $coordinates = $this->normalizeCoordinates(isset($workOrder['coordinates']) ? $workOrder['coordinates'] : array());
        if (isset($coordinates['latitude'])) {
            $destination['latitude'] = $coordinates['latitude'];
        }
        if (isset($coordinates['longitude'])) {
            $destination['longitude'] = $coordinates['longitude'];
        }
        if (!empty($workOrder['map_image_url'])) {
            $destination['mapImageUrl'] = (string)$workOrder['map_image_url'];
        }

        $result = array(
            'id' => (string)$workOrder['id'],
            'version' => max(1, (int)(isset($workOrder['version']) ? $workOrder['version'] : 1)),
            'type' => (string)$workOrder['type'],
            'status' => (string)$workOrder['status'],
            'displayId' => $this->workOrderDisplayId($workOrder),
            'customer' => array(
                'name' => (string)(isset($workOrder['customer_name']) ? $workOrder['customer_name'] : ''),
                'phone' => (string)(isset($workOrder['phone']) ? $workOrder['phone'] : ''),
                'isMasked' => false,
            ),
            'product' => (string)(!empty($workOrder['product_type']) ? $workOrder['product_type'] : (isset($workOrder['title']) ? $workOrder['title'] : '')),
            'createdAt' => (string)$workOrder['created_at'],
            'destination' => $destination,
        );
        if (isset($workOrder['reward']) && $workOrder['reward'] !== null) {
            $result['reward'] = array('amount' => (float)$workOrder['reward'], 'currency' => 'RUB');
        }
        $planned = $this->visitForPresentation(isset($workOrder['planned_at']) ? $workOrder['planned_at'] : null, isset($workOrder['time_window']) ? $workOrder['time_window'] : '');
        if ($planned) {
            $result['plannedVisit'] = $planned;
        }
        if (!empty($workOrder['fact_date'])) {
            $result['actualDate'] = $this->localDate($workOrder['fact_date']);
        }
        if (!$details) {
            return $result;
        }

        if (!empty($workOrder['lead_id'])) {
            $result['leadId'] = (string)$workOrder['lead_id'];
        }
        $result['dealerId'] = (string)$workOrder['dealer_id'];
        if (!empty($workOrder['comment']) || !empty($workOrder['result_comment'])) {
            $result['comment'] = (string)(!empty($workOrder['comment']) ? $workOrder['comment'] : $workOrder['result_comment']);
        }
        $warehouse = isset($workOrder['warehouse']) && is_array($workOrder['warehouse']) ? $workOrder['warehouse'] : array();
        if (!$warehouse && !empty($workOrder['warehouse_address'])) {
            $warehouse = array('region' => '', 'city' => '', 'address' => (string)$workOrder['warehouse_address']);
        }
        if ($warehouse) {
            $result['warehouse'] = $warehouse;
        }
        if (!empty($workOrder['route']) && is_array($workOrder['route'])) {
            $result['route'] = $workOrder['route'];
        }
        if (!empty($workOrder['reminder']) && is_array($workOrder['reminder'])) {
            $result['reminder'] = $workOrder['reminder'];
        }
        $result['photos'] = $this->presentPhotos((array)(isset($workOrder['photo_ids']) ? $workOrder['photo_ids'] : array()), $workOrder);
        if (!empty($workOrder['completed_at'])) {
            $result['completedAt'] = $workOrder['completed_at'];
        }
        if (!empty($workOrder['cancellation_reason'])) {
            $result['cancellationReason'] = (string)$workOrder['cancellation_reason'];
        }
        $result['updatedAt'] = (string)$workOrder['updated_at'];
        return $result;
    }

    private function presentPhotos(array $photoIds, array $workOrder)
    {
        $photos = array();
        foreach ($photoIds as $index => $stored) {
            $metadata = is_array($stored) ? $stored : array('id' => $stored);
            $id = isset($metadata['id']) ? (int)$metadata['id'] : 0;
            $file = $id > 0 && class_exists('CFile') ? CFile::GetFileArray($id) : null;
            if (!$file && empty($metadata['url'])) {
                continue;
            }
            $photos[] = array(
                'id' => (string)($id > 0 ? $id : (isset($metadata['id']) ? $metadata['id'] : $index + 1)),
                'name' => (string)($file ? $file['ORIGINAL_NAME'] : (isset($metadata['name']) ? $metadata['name'] : 'Фото')),
                'url' => (string)($file ? $file['SRC'] : $metadata['url']),
                'thumbnailUrl' => (string)($file ? $file['SRC'] : (isset($metadata['thumbnailUrl']) ? $metadata['thumbnailUrl'] : $metadata['url'])),
                'mimeType' => (string)($file ? $file['CONTENT_TYPE'] : (isset($metadata['mimeType']) ? $metadata['mimeType'] : 'image/jpeg')),
                'size' => (int)($file ? $file['FILE_SIZE'] : (isset($metadata['size']) ? $metadata['size'] : 0)),
                'createdAt' => (string)(!empty($workOrder['completed_at']) ? $workOrder['completed_at'] : $workOrder['updated_at']),
            );
        }
        return $photos;
    }

    private function visitForPresentation($dateValue, $timeWindow)
    {
        if (empty($dateValue)) {
            return null;
        }
        $visit = array('date' => $this->localDate($dateValue));
        $parts = explode('|', (string)$timeWindow, 2);
        if (!empty($parts[0])) {
            $visit['timeFrom'] = $parts[0];
        }
        if (!empty($parts[1])) {
            $visit['timeTo'] = $parts[1];
        }
        return $visit;
    }

    private function localDate($value)
    {
        $date = swLeadParseDateTime($value, 'date', true);
        return $date->setTimezone(new DateTimeZone(date_default_timezone_get()))->format('Y-m-d');
    }

    private function normalizeCoordinates($value)
    {
        if (is_string($value)) {
            $parts = array_map('trim', explode(',', $value));
            $value = count($parts) >= 2 ? array('latitude' => $parts[0], 'longitude' => $parts[1]) : array();
        }
        if (!is_array($value)) {
            return array();
        }
        $result = array();
        if (isset($value['latitude']) && is_numeric($value['latitude'])) {
            $result['latitude'] = (float)$value['latitude'];
        }
        if (isset($value['longitude']) && is_numeric($value['longitude'])) {
            $result['longitude'] = (float)$value['longitude'];
        }
        return $result;
    }

    private function workOrderDisplayId(array $workOrder)
    {
        if (!empty($workOrder['display_id'])) {
            return (string)$workOrder['display_id'];
        }
        return ($workOrder['type'] === 'delivery' ? 'Д-' : 'М-') . (int)$workOrder['id'];
    }

    private function maskPhone($phone)
    {
        $digits = preg_replace('/\D+/', '', (string)$phone);
        $suffix = strlen($digits) >= 2 ? substr($digits, -2) : '**';
        return '+7 (9**) ***-**-' . $suffix;
    }

    private function maskName($name)
    {
        $name = trim((string)$name);
        if ($name === '') {
            return 'Клиент';
        }
        $first = function_exists('mb_substr') ? mb_substr($name, 0, 1, 'UTF-8') : substr($name, 0, 1);
        return 'Клиент ' . $first . '.';
    }

    private function notificationTypeForEvent($event)
    {
        $map = array(
            'new_lead' => 'lead_available',
            'deadline_reminder' => 'lead_schedule_due',
            'lead_returned' => 'lead_returned',
            'work_order' => 'work_order_due',
            'cancelled' => 'work_order_cancelled',
        );
        return isset($map[$event]) ? $map[$event] : 'work_order_due';
    }

    private function pick(array $input, array $keys, $default = null)
    {
        foreach ($keys as $key) {
            if (array_key_exists($key, $input)) {
                return $input[$key];
            }
        }
        return $default;
    }
}
