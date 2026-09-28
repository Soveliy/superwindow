<?php

require_once __DIR__ . '/LeadController.php';

/** Legacy route names retained for the existing Bitrix24 robots and admin UI. */
function bitrix24ImportLead($query)
{
    return swLeadHandle(function () use ($query) {
        $query = swLeadRequestData((array)$query);
        swB24RequireSyncPermission($query);
        $externalId = swLeadPositiveInt($query, array('b24_id'));
        $container = swLeadServiceContainer();
        $adapter = new SwLeadExistingB24Adapter($container['repository']);
        $adapter->loadTransport();
        if (!function_exists('bitrix24GetLead')) {
            throw new SwLeadApiException(503, 'b24_transport_unavailable', 'Транспорт импорта Битрикс24 недоступен');
        }
        $response = bitrix24GetLead($externalId);
        if (!is_array($response) || empty($response['success'])) {
            // No webhook URLs, raw responses or credentials in HTTP errors.
            throw new SwLeadApiException(502, 'b24_import_failed', 'Не удалось получить лид из Битрикс24');
        }
        $item = isset($response['data']['item']) && is_array($response['data']['item']) ? $response['data']['item'] : array();
        if (!$item || (int)(isset($item['id']) ? $item['id'] : 0) !== $externalId) {
            throw new SwLeadApiException(502, 'b24_invalid_response', 'Битрикс24 не подтвердил запрошенный лид');
        }

        $normalized = swB24NormalizeImportedItem($item, $externalId);
        $idempotencyKey = swLeadHeader('Idempotency-Key');
        if ($idempotencyKey === '' && isset($query['idempotencyKey'])) {
            $idempotencyKey = trim((string)$query['idempotencyKey']);
        }
        $results = $container['leads']->importLeads(array('leads' => array($normalized)), $idempotencyKey);
        $result = $results[0];
        return array(
            'success' => true,
            'portal_id' => (int)$result['lead']['id'],
            'b24_id' => $externalId,
            'created' => !empty($result['created']),
            'idempotent' => !empty($result['idempotent']),
        );
    });
}

function syncB24LeadHL($query)
{
    return swLeadHandle(function () use ($query) {
        $query = swLeadRequestData((array)$query);
        swB24RequireSyncPermission($query);
        $id = swLeadPositiveInt($query, array('id'));
        $container = swLeadServiceContainer();
        $lead = $container['repository']->get('leads', $id);
        if (!$lead) {
            throw new SwLeadApiException(404, 'lead_not_found', 'Лид HL не найден');
        }
        if (empty($lead['b24_id']) || !ctype_digit((string)$lead['b24_id'])) {
            throw new SwLeadApiException(422, 'b24_entity_id_missing', 'У лида не указан ID Битрикс24');
        }
        $eventId = $container['outbox']->enqueue('lead', $id, 'lead.sync_requested', $container['leads']->integrationLeadPayload($lead));
        // Durable acknowledgement only: the worker confirms external delivery.
        // No false synced_at timestamp and no write to absent UF_SYNCED_AT.
        return array(
            'success' => true,
            'hl_id' => $id,
            'b24_id' => (int)$lead['b24_id'],
            'outbox_id' => (int)$eventId,
            'queued' => true,
            'synced' => false,
            'status' => 'pending',
        );
    });
}

function swB24RequireSyncPermission(array $query)
{
    if (PHP_SAPI === 'cli') {
        return;
    }
    swLeadRequireMethod('POST');
    if (swLeadHeader('X-API-Key') !== '' || !empty($query['api_key'])) {
        swLeadRequireImportKey($query);
        return;
    }
    $actor = swLeadRequireActor();
    if (empty($actor['is_admin'])) {
        throw new SwLeadApiException(403, 'admin_required', 'Синхронизация доступна администратору');
    }
    swLeadRequireCsrf($query);
}

function swB24NormalizeImportedItem(array $item, $externalId)
{
    $normalized = array('b24EntityId' => (string)(int)$externalId);
    $map = array('title' => 'title', 'customer_name' => 'clientName', 'phone' => 'phone', 'address' => 'address', 'product_type' => 'productType', 'type' => 'leadType', 'budget' => 'budget', 'reward' => 'reward', 'comment' => 'comment', 'measure_date' => 'measureDate', 'install_date' => 'installDate', 'delivery_date' => 'deliveryDate', 'expire_at' => 'expiresAt');
    foreach ($map as $logical => $local) {
        $value = SwLeadExistingB24Adapter::readSourceField($item, $logical, $found);
        if (!$found) { continue; }
        if ($value !== null && !is_scalar($value)) {
            throw new SwLeadApiException(422, 'invalid_source_shape', 'Некорректное поле источника', array('field' => $local));
        }
        if ($logical === 'budget' || $logical === 'reward') {
            $normalized[$local] = SwLeadExistingB24Adapter::normalizeMoney($value);
        } elseif ($logical === 'product_type') {
            $normalized[$local] = SwLeadExistingB24Adapter::productLabel($value);
        } elseif ($logical === 'address') {
            $normalized = array_merge($normalized, swB24NormalizeAddress($value));
        } elseif (in_array($logical, array('measure_date', 'install_date', 'delivery_date', 'expire_at'), true)) {
            $normalized[$local] = $value === null || $value === false || $value === '' ? null : trim((string)$value);
        } else {
            $normalized[$local] = $value === null || $value === false ? '' : trim((string)$value);
        }
    }
    $files = SwLeadExistingB24Adapter::readSourceField($item, 'files', $filesFound);
    if ($filesFound) {
        $normalized['sourceAttachmentRefs'] = swB24SourceAttachmentRefs($files);
    }
    $normalized['leadType'] = SwLeadExistingB24Adapter::normalizeType(isset($normalized['leadType']) ? $normalized['leadType'] : '');
    // The remote dealer field is deliberately not an assignment command.
    // Ownership, dates and type of accepted leads are guarded by importLeads.
    $cancelStage = trim((string)swLeadConfig('b24.stages.cancelled', ''));
    if ($cancelStage !== '' && isset($item['stageId']) && (string)$item['stageId'] === $cancelStage) {
        $normalized['status'] = 'cancelled';
    }
    return $normalized;
}

/** Pure parsing of Bitrix's TEXT|LAT;LON|LOCATION_ID user-field representation. */
function swB24NormalizeAddress($value)
{
    if ($value !== null && !is_scalar($value)) {
        throw new SwLeadApiException(422, 'invalid_source_shape', 'Некорректный адрес источника');
    }
    $parts = explode('|', $value === null || $value === false ? '' : trim((string)$value), 3);
    $result = array('address' => trim($parts[0]));
    if (count($parts) > 1) {
        $meta = array('format' => 'bitrix_address');
        if (isset($parts[2]) && ctype_digit(trim($parts[2])) && (int)$parts[2] > 0) {
            $meta['locationId'] = (int)$parts[2];
        }
        $result['sourceAddress'] = $meta;
        $pair = explode(';', $parts[1]);
        if (count($pair) === 2 && is_numeric(trim($pair[0])) && is_numeric(trim($pair[1]))) {
            $latitude = (float)$pair[0];
            $longitude = (float)$pair[1];
            if (is_finite($latitude) && is_finite($longitude) && abs($latitude) <= 90 && abs($longitude) <= 180) {
                $result['coordinates'] = array('latitude' => $latitude, 'longitude' => $longitude);
            }
        }
    }
    // City and region cannot be inferred reliably from arbitrary address text.
    return $result;
}

/** Keep only safe file identities until authenticated download handling exists. */
function swB24SourceAttachmentRefs($value)
{
    if ($value === null || $value === false || $value === '') { return array(); }
    $items = is_array($value) && !isset($value['id']) && !isset($value['ID']) ? $value : array($value);
    $refs = array();
    foreach ($items as $item) {
        $id = is_array($item) ? (isset($item['id']) ? $item['id'] : (isset($item['ID']) ? $item['ID'] : null)) : $item;
        if (is_scalar($id) && ctype_digit((string)$id) && (int)$id > 0) {
            $refs[(string)$id] = array('id' => (string)(int)$id, 'field' => SwLeadExistingB24Adapter::remoteField('files'));
        }
    }
    // url/urlMachine may carry application auth; never store or expose them.
    return array_values($refs);
}
