<?php

/**
 * Compatibility envelopes for the existing hl_* clients. Business mutations
 * go through SwLeadService; no legacy controller or unguarded HL write is used.
 * LeadController.php must be loaded before this bridge.
 */
function swLegacyLeadAction($action, array $query)
{
    $response = swLeadHandle(function () use ($action, $query) {
        $mutations = array('hl_lead_take', 'hl_lead_set_date', 'hl_work_date', 'hl_work_complete', 'hl_work_photo_add');
        $mutation = in_array($action, $mutations, true);
        swLeadRequireMethod($mutation ? 'POST' : 'GET');
        $actor = swLeadRequireActor();
        $input = swLeadRequestData($query);
        if ($mutation) {
            swLeadRequireCsrf($input);
        }
        $container = swLeadServiceContainer();
        $service = $container['leads'];
        $repository = $container['repository'];

        switch ($action) {
            case 'hl_leads':
            case 'hl_leads_my':
                $filter = $action === 'hl_leads'
                    ? array('=status' => 'available')
                    : array('=dealer_id' => (int)$actor['dealer_id']);
                $rows = $repository->find('leads', $filter, array('ID' => 'DESC'));
                $items = array();
                foreach ($rows as $row) {
                    $lead = $service->getLead((string)$row['id'], $actor);
                    $items[] = swLegacyLeadItem($lead, $row);
                }
                return array('success' => true, 'items' => $items);

            case 'hl_lead_get':
                $lead = $service->getLead(swLeadIdentifier($input, array('id', 'lead_id', 'leadId')), $actor);
                $row = $repository->get('leads', (int)$lead['id']);
                return array('success' => true, 'item' => swLegacyLeadItem($lead, (array)$row));

            case 'hl_lead_take':
                $lead = $service->takeLead(swLeadIdentifier($input, array('id', 'lead_id', 'leadId')), $input, $actor);
                $workType = swLegacyWorkType(isset($lead['serviceType']) ? $lead['serviceType'] : '');
                return array('success' => true, 'item' => array(
                    'id' => (int)$lead['id'],
                    'status' => $lead['status'],
                    'dilerId' => isset($lead['dealerId']) ? (int)$lead['dealerId'] : (int)$actor['dealer_id'],
                    'takenAt' => swLegacyDateTime(isset($lead['takenAt']) ? $lead['takenAt'] : null),
                    'phone' => isset($lead['customer']['phone']) ? $lead['customer']['phone'] : '',
                    'workId' => !empty($lead['convertedWorkOrderId']) ? (int)$lead['convertedWorkOrderId'] : null,
                    'workType' => $workType !== '' ? $workType : null,
                ));

            case 'hl_lead_set_date':
                $date = swLegacyParseDate(isset($input['date']) ? $input['date'] : '', 'date');
                $schedule = array_merge($input, swLegacyVisit($date, $input));
                $lead = $service->scheduleLead(swLeadIdentifier($input, array('id', 'lead_id', 'leadId')), $schedule, $actor);
                return array('success' => true, 'id' => (int)$lead['id'], 'status' => $lead['status'], 'date' => swLegacyDateTime($date));

            case 'hl_works':
            case 'hl_works_my':
                // Even the old general list is now scoped to the signed-in owner.
                $filter = array('=dealer_id' => (int)$actor['dealer_id']);
                $status = isset($input['status']) ? trim((string)$input['status']) : ($action === 'hl_works' ? 'assigned' : '');
                if ($status !== '') {
                    if (!in_array($status, array('assigned', 'in_work', 'done', 'cancelled'), true)) {
                        throw new SwLeadApiException(422, 'validation_error', 'Неизвестный статус работы', array('field' => 'status'));
                    }
                    $filter['=status'] = $status;
                }
                if (!empty($input['type'])) {
                    $filter['=type'] = swLegacyNormalizeWorkType($input['type']);
                }
                $limit = isset($input['limit']) ? max(1, min(100, (int)$input['limit'])) : 50;
                $offset = isset($input['offset']) ? max(0, (int)$input['offset']) : 0;
                $rows = $repository->find('work_orders', $filter, array('planned_at' => 'ASC', 'ID' => 'DESC'), $action === 'hl_works_my' ? $limit : 0, $action === 'hl_works_my' ? $offset : 0);
                $items = array();
                foreach ($rows as $row) {
                    $work = $service->getWorkOrder((string)$row['id'], $actor);
                    $items[] = $action === 'hl_works_my' ? swLegacyWorkFields($work, $row) : swLegacyWorkItem($work, $row);
                }
                return $action === 'hl_works_my'
                    ? array('success' => true, 'data' => array('items' => $items, 'limit' => $limit, 'offset' => $offset))
                    : array('success' => true, 'items' => $items);

            case 'hl_work_get':
                $work = $service->getWorkOrder(swLeadIdentifier($input, array('id', 'work_id', 'work_order_id', 'workOrderId')), $actor);
                return array('success' => true, 'data' => swLegacyWorkFields($work, (array)$repository->get('work_orders', (int)$work['id'])));

            case 'hl_work_date':
                $rawDate = isset($input['planned_date']) ? $input['planned_date'] : (isset($input['date']) ? $input['date'] : '');
                $date = swLegacyParseDate($rawDate, 'planned_date');
                $changes = array('plannedVisit' => swLegacyVisit($date, $input));
                swLegacyCopyVersion($input, $changes);
                $work = $service->updateWorkOrder(swLeadIdentifier($input, array('id', 'work_id', 'work_order_id', 'workOrderId')), $changes, $actor);
                return array('success' => true, 'data' => array('id' => (int)$work['id'], 'planned_date' => swLegacyDateTime($date, true)));

            case 'hl_work_photo_add':
                return array('success' => true, 'data' => swLegacyAppendWorkPhotos($input, $actor, $container));

            case 'hl_work_complete':
                $work = swLegacyCompleteWork($input, $actor, $container);
                $row = $repository->get('work_orders', (int)$work['id']);
                return array('success' => true, 'data' => array(
                    'id' => (int)$work['id'],
                    'status' => $work['status'],
                    'fact_date' => swLegacyDateTime(isset($row['fact_date']) ? $row['fact_date'] : $work['actualDate'], true),
                    'b24' => array('success' => true, 'queued' => true),
                ));
        }
        throw new SwLeadApiException(404, 'method_not_found', 'Метод не найден');
    });

    // Old clients expect a string error and httpCode, not the new error object.
    if (empty($response['success']) && isset($response['error']) && is_array($response['error'])) {
        $error = $response['error'];
        $response['error'] = isset($error['message']) ? $error['message'] : 'Ошибка запроса';
        $response['code'] = isset($error['code']) ? $error['code'] : 'internal_error';
        $response['httpCode'] = http_response_code() ?: 500;
        if (isset($error['details'])) {
            $response['details'] = $error['details'];
        }
    }
    return $response;
}

function swLegacyLeadItem(array $lead, array $row)
{
    $canSeePrivate = empty($lead['customer']['isMasked']);
    $types = array('measurement' => 'measure', 'installation' => 'install', 'delivery' => 'delivery');
    $type = isset($lead['serviceType']) ? $lead['serviceType'] : '';
    $item = array(
        'id' => (int)$lead['id'],
        'b24EntityId' => (int)(isset($lead['externalId']) ? $lead['externalId'] : 0),
        'title' => isset($lead['title']) ? $lead['title'] : '',
        'clientName' => isset($lead['customer']['name']) ? $lead['customer']['name'] : '',
        'address' => $canSeePrivate && isset($lead['location']['address']) ? $lead['location']['address'] : '',
        'productType' => isset($lead['product']) ? $lead['product'] : '',
        'leadType' => isset($types[$type]) ? $types[$type] : $type,
        'budget' => isset($row['budget']) ? $row['budget'] : null,
        'reward' => isset($row['reward']) ? $row['reward'] : null,
        'comment' => $canSeePrivate && isset($lead['factoryNotes']) ? $lead['factoryNotes'] : '',
        'expireDate' => swLegacyDateTime(isset($lead['expiresAt']) ? $lead['expiresAt'] : null),
        'status' => $lead['status'],
    );
    if ($canSeePrivate) {
        $item['phone'] = isset($lead['customer']['phone']) ? $lead['customer']['phone'] : '';
        $item['dilerId'] = isset($lead['dealerId']) ? (int)$lead['dealerId'] : null;
        $item['takenAt'] = swLegacyDateTime(isset($lead['takenAt']) ? $lead['takenAt'] : null);
        $item['requiredDateFilledAt'] = swLegacyDateTime(isset($row['required_date_filled_at']) ? $row['required_date_filled_at'] : null);
        $item['measureDate'] = swLegacyDateTime(isset($lead['measureDate']) ? $lead['measureDate'] : null);
        $item['installDate'] = swLegacyDateTime(isset($lead['installDate']) ? $lead['installDate'] : null);
        $item['deliveryDate'] = swLegacyDateTime(isset($lead['deliveryDate']) ? $lead['deliveryDate'] : null);
    }
    return $item;
}

function swLegacyWorkFields(array $work, array $row)
{
    return array(
        'ID' => (int)$work['id'],
        'UF_B24_ENTITY_ID' => (int)(isset($row['b24_id']) ? $row['b24_id'] : 0),
        'UF_LEAD_ID' => (int)(isset($work['leadId']) ? $work['leadId'] : 0),
        'UF_CLIENT_NAME' => isset($work['customer']['name']) ? $work['customer']['name'] : '',
        'UF_PHONE' => isset($work['customer']['phone']) ? $work['customer']['phone'] : '',
        'UF_ADDRESS' => isset($work['destination']['address']) ? $work['destination']['address'] : '',
        'UF_PRODUCT_TYPE' => isset($work['product']) ? $work['product'] : '',
        'UF_TYPE' => swLegacyWorkType($work['type']),
        'UF_REWARD' => isset($work['reward']['amount']) ? $work['reward']['amount'] : null,
        'UF_PLANNED_DATE' => swLegacyDateTime(isset($row['planned_at']) ? $row['planned_at'] : null, true),
        'UF_FACT_DATE' => swLegacyDateTime(isset($row['fact_date']) ? $row['fact_date'] : null, true),
        'UF_STATUS' => $work['status'],
        'UF_DILER_ID' => (int)(isset($work['dealerId']) ? $work['dealerId'] : 0),
        'UF_COMMENT' => isset($work['comment']) ? $work['comment'] : '',
        'UF_PHOTOS' => array_values((array)(isset($row['photo_ids']) ? $row['photo_ids'] : array())),
    );
}

function swLegacyWorkItem(array $work, array $row)
{
    $fields = swLegacyWorkFields($work, $row);
    return array(
        'id' => $fields['ID'], 'b24EntityId' => $fields['UF_B24_ENTITY_ID'], 'leadId' => $fields['UF_LEAD_ID'],
        'clientName' => $fields['UF_CLIENT_NAME'], 'address' => $fields['UF_ADDRESS'], 'productType' => $fields['UF_PRODUCT_TYPE'],
        'leadType' => $work['type'] === 'installation' ? 'install' : 'delivery', 'budget' => null,
        'reward' => $fields['UF_REWARD'], 'comment' => $fields['UF_COMMENT'], 'expireDate' => null, 'status' => $fields['UF_STATUS'],
    );
}

function swLegacyWorkType($type)
{
    return $type === 'installation' ? 'монтаж' : ($type === 'delivery' ? 'доставка' : '');
}

function swLegacyNormalizeWorkType($type)
{
    $value = function_exists('mb_strtolower') ? mb_strtolower(trim((string)$type), 'UTF-8') : strtolower(trim((string)$type));
    $types = array('install' => 'installation', 'installation' => 'installation', 'монтаж' => 'installation', 'delivery' => 'delivery', 'доставка' => 'delivery');
    if (!isset($types[$value])) {
        throw new SwLeadApiException(422, 'validation_error', 'Неизвестный тип работы', array('field' => 'type'));
    }
    return $types[$value];
}

function swLegacyParseDate($value, $field)
{
    if (!is_scalar($value) || trim((string)$value) === '') {
        throw new SwLeadApiException(422, 'validation_error', 'Не указана дата', array('field' => $field));
    }
    $value = trim((string)$value);
    $formats = array('d-m-Y H:i:s', 'd-m-Y H:i', 'd-m-Y', 'd.m.Y H:i:s', 'd.m.Y H:i', 'd.m.Y', 'Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d', 'Y-m-d\TH:i:sP', 'Y-m-d\TH:i:s.uP', 'Y-m-d\TH:iP');
    foreach ($formats as $format) {
        $date = DateTimeImmutable::createFromFormat('!' . $format, $value, new DateTimeZone(date_default_timezone_get()));
        $errors = DateTimeImmutable::getLastErrors();
        if ($date && (!$errors || ($errors['warning_count'] === 0 && $errors['error_count'] === 0))) {
            return $date->setTimezone(new DateTimeZone(date_default_timezone_get()));
        }
    }
    throw new SwLeadApiException(422, 'validation_error', 'Некорректная дата. Используйте DD-MM-YYYY HH:MM:SS или YYYY-MM-DD', array('field' => $field));
}

function swLegacyDateTime($value, $workFormat = false)
{
    if ($value === null || $value === '') {
        return null;
    }
    $date = $value instanceof DateTimeInterface ? $value : swLeadParseDateTime($value, 'date', true);
    $local = (new DateTimeImmutable('@' . $date->getTimestamp()))->setTimezone(new DateTimeZone(date_default_timezone_get()));
    return $workFormat && function_exists('ConvertTimeStamp')
        ? ConvertTimeStamp($local->getTimestamp(), 'FULL')
        : $local->format($workFormat ? 'd.m.Y H:i:s' : 'd-m-Y H:i:s');
}

function swLegacyVisit(DateTimeImmutable $date, array $input)
{
    return array(
        'date' => $date->format('Y-m-d'),
        'timeFrom' => isset($input['timeFrom']) ? $input['timeFrom'] : (isset($input['time_from']) ? $input['time_from'] : $date->format('H:i')),
        'timeTo' => isset($input['timeTo']) ? $input['timeTo'] : (isset($input['time_to']) ? $input['time_to'] : ''),
    );
}

function swLegacyCopyVersion(array $input, array &$target)
{
    if (isset($input['expectedVersion']) && $input['expectedVersion'] !== '') {
        $target['expectedVersion'] = $input['expectedVersion'];
    } elseif (isset($input['expected_version']) && $input['expected_version'] !== '') {
        $target['expectedVersion'] = $input['expected_version'];
    }
}

function swLegacySavePhotos(array $input)
{
    $hadPhotos = isset($_FILES['photos']);
    $photos = $hadPhotos ? $_FILES['photos'] : null;
    if (isset($_FILES['file'])) {
        if ($hadPhotos) {
            throw new SwLeadApiException(422, 'validation_error', 'Передайте файлы в поле file или photos, не в обоих полях');
        }
        $_FILES['photos'] = $_FILES['file'];
    }
    try {
        return swLeadSaveCompletionPhotos($input);
    } finally {
        if ($hadPhotos) {
            $_FILES['photos'] = $photos;
        } else {
            unset($_FILES['photos']);
        }
    }
}

function swLegacyGuardWork(array $work, array $actor, array $input)
{
    if (empty($actor['is_admin']) && (int)$work['dealer_id'] !== (int)$actor['dealer_id']) {
        throw new SwLeadApiException(403, 'work_order_forbidden', 'Заказ закреплён за другим дилером');
    }
    if (!in_array($work['status'], array('assigned', 'in_work'), true)) {
        throw new SwLeadApiException(409, 'work_order_status_conflict', 'В завершённую или отменённую работу нельзя добавлять фото');
    }
    $version = array();
    swLegacyCopyVersion($input, $version);
    if (isset($version['expectedVersion']) && $version['expectedVersion'] !== '' && (int)$version['expectedVersion'] !== (int)$work['version']) {
        throw new SwLeadApiException(409, 'version_conflict', 'Данные уже изменились. Обновите страницу и повторите действие.');
    }
}

function swLegacyAppendWorkPhotos(array $input, array $actor, array $container)
{
    $work = $container['leads']->getWorkOrder(swLeadIdentifier($input, array('id', 'work_id', 'work_order_id', 'workOrderId')), $actor);
    $id = (int)$work['id'];
    $savedIds = array();
    try {
        $beforeUpload = $container['repository']->get('work_orders', $id);
        if (!$beforeUpload) {
            throw new SwLeadApiException(404, 'work_order_not_found', 'Работа не найдена');
        }
        swLegacyGuardWork($beforeUpload, $actor, $input);
        // Save outside the row transaction so a DB rollback cannot remove the
        // CFile record before cleanup deletes the physical uploaded file.
        $savedIds = swLegacySavePhotos($input);
        if (!$savedIds) {
            throw new SwLeadApiException(422, 'photos_required', 'Приложите хотя бы одну фотографию');
        }
        return $container['repository']->locked('work_orders', $id, function ($current) use ($input, $actor, $container, $id, $savedIds) {
            if (!$current) {
                throw new SwLeadApiException(404, 'work_order_not_found', 'Работа не найдена');
            }
            swLegacyGuardWork($current, $actor, $input);
            $photoIds = array_values(array_unique(array_merge((array)(isset($current['photo_ids']) ? $current['photo_ids'] : array()), $savedIds)));
            $maximum = (int)swLeadConfig('work_order.max_photos', 10);
            if (count($photoIds) > $maximum) {
                throw new SwLeadApiException(422, 'too_many_photos', 'Превышено допустимое число фотографий', array('maxPhotos' => $maximum));
            }
            $container['repository']->update('work_orders', $id, array(
                'photo_ids' => $photoIds,
                'version' => max(1, (int)$current['version']) + 1,
                'updated_at' => swLeadUtcNow(),
            ));
            $updated = $container['repository']->get('work_orders', $id);
            $container['audit']->record('work_order', $id, 'work_order.photos_added', $actor, $current, $updated, array('photoCount' => count($savedIds)));
            $container['outbox']->enqueue('work_order', $id, 'work_order.photos_added', $container['leads']->integrationWorkOrderPayload($updated));
            return array('work_id' => $id, 'file_id' => (int)$savedIds[0], 'file_ids' => $savedIds, 'photos' => $photoIds, 'version' => (int)$updated['version']);
        });
    } catch (Throwable $exception) {
        foreach ($savedIds as $savedId) {
            swLeadDeleteFile($savedId);
        }
        throw $exception;
    }
}

function swWorkOrderPhotoAddAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod('POST');
        $input = swLeadRequestData($query);
        $actor = swLeadRequireActor();
        swLeadRequireCsrf($input);
        return swLeadSuccess(swLegacyAppendWorkPhotos($input, $actor, swLeadServiceContainer()));
    });
}

function swLegacyCompleteWork(array $input, array $actor, array $container)
{
    $rawDate = isset($input['fact_date']) ? $input['fact_date'] : (isset($input['actualDate']) ? $input['actualDate'] : (isset($input['actual_date']) ? $input['actual_date'] : ''));
    $date = swLegacyParseDate($rawDate, 'fact_date');
    $work = $container['leads']->getWorkOrder(swLeadIdentifier($input, array('id', 'work_id', 'work_order_id', 'workOrderId')), $actor);
    $current = $container['repository']->get('work_orders', (int)$work['id']);
    if (!$current) {
        throw new SwLeadApiException(404, 'work_order_not_found', 'Работа не найдена');
    }
    $changes = array('actualDate' => $date->format(DateTimeInterface::ATOM), 'expectedVersion' => (int)$current['version']);
    swLegacyCopyVersion($input, $changes);
    $savedIds = array();
    try {
        // Only IDs already attached to this owned work are reusable. Caller-
        // supplied IDs/URLs are never accepted as proof of a uploaded report.
        $savedIds = swLegacySavePhotos($input);
        $existingIds = array_values(array_filter(array_map('intval', (array)(isset($current['photo_ids']) ? $current['photo_ids'] : array()))));
        $photoIds = array_values(array_unique(array_merge($existingIds, $savedIds)));
        if (count($photoIds) > (int)swLeadConfig('work_order.max_photos', 10)) {
            throw new SwLeadApiException(422, 'too_many_photos', 'Превышено допустимое число фотографий');
        }
        $result = $container['leads']->completeWorkOrder((string)$work['id'], $changes, $photoIds, $actor);
        $usedIds = array();
        foreach ((array)(isset($result['photos']) ? $result['photos'] : array()) as $photo) {
            if (is_array($photo) && isset($photo['id'])) {
                $usedIds[] = (int)$photo['id'];
            }
        }
        foreach (array_diff($savedIds, $usedIds) as $unusedId) {
            swLeadDeleteFile($unusedId);
        }
        return $result;
    } catch (Throwable $exception) {
        foreach ($savedIds as $savedId) {
            swLeadDeleteFile($savedId);
        }
        throw $exception;
    }
}
