<?php

require_once __DIR__ . '/../services/LeadApiSupport.php';
require_once __DIR__ . '/../services/LeadRepository.php';
require_once __DIR__ . '/../services/LeadEvents.php';
require_once __DIR__ . '/../services/LeadService.php';
require_once __DIR__ . '/../services/LeadCronService.php';
require_once __DIR__ . '/../services/LeadB24ImportService.php';

function swLeadServiceContainer()
{
    static $container;
    if ($container === null) {
        $repository = new SwLeadRepository();
        $audit = new SwLeadAuditService($repository);
        $notifications = new SwLeadNotificationService($repository);
        $outbox = new SwLeadB24Outbox($repository);
        $leadService = new SwLeadService($repository, $audit, $notifications, $outbox);
        $importer = new SwLeadB24ImportService($repository, $leadService);
        $container = array(
            'repository' => $repository,
            'audit' => $audit,
            'notifications' => $notifications,
            'outbox' => $outbox,
            'leads' => $leadService,
            'b24Import' => $importer,
            'cron' => new SwLeadCronService($repository, $audit, $notifications, $outbox, $leadService, $importer),
        );
    }
    return $container;
}

function swLeadListAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod('GET');
        $actor = swLeadRequireActor();
        $container = swLeadServiceContainer();
        list($items, $meta) = $container['leads']->listLeads(swLeadRequestData($query), $actor);
        return swLeadSuccess($items, $meta);
    });
}

function swLeadGetAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod('GET');
        $actor = swLeadRequireActor();
        $data = swLeadRequestData($query);
        $id = swLeadIdentifier($data, array('lead_id', 'leadId', 'id'));
        $container = swLeadServiceContainer();
        return swLeadSuccess($container['leads']->getLead($id, $actor));
    });
}

function swLeadTakeAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod(array('POST', 'PATCH'));
        $data = swLeadRequestData($query);
        $actor = swLeadRequireActor();
        swLeadRequireCsrf($data);
        $id = swLeadIdentifier($data, array('lead_id', 'leadId', 'id'));
        $container = swLeadServiceContainer();
        return swLeadSuccess($container['leads']->takeLead($id, $data, $actor));
    });
}

function swLeadScheduleAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod(array('POST', 'PATCH'));
        $data = swLeadRequestData($query);
        $actor = swLeadRequireActor();
        swLeadRequireCsrf($data);
        $id = swLeadIdentifier($data, array('lead_id', 'leadId', 'id'));
        $container = swLeadServiceContainer();
        return swLeadSuccess($container['leads']->scheduleLead($id, $data, $actor));
    });
}

function swLeadConvertAction(array $query, $measurementOnly = false)
{
    return swLeadHandle(function () use ($query, $measurementOnly) {
        swLeadRequireMethod(array('POST', 'PATCH'));
        $data = swLeadRequestData($query);
        $actor = swLeadRequireActor();
        swLeadRequireCsrf($data);
        $id = swLeadIdentifier($data, array('lead_id', 'leadId', 'id'));
        $container = swLeadServiceContainer();
        return swLeadSuccess($container['leads']->convertLead($id, $data, $actor, (bool)$measurementOnly));
    });
}

function swLeadImportAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod('POST');
        $data = swLeadRequestData($query);
        swLeadRequireImportKey($data);
        $idempotencyKey = swLeadHeader('Idempotency-Key');
        if ($idempotencyKey === '' && isset($data['idempotencyKey'])) {
            $idempotencyKey = trim((string)$data['idempotencyKey']);
        }
        $container = swLeadServiceContainer();
        return swLeadSuccess($container['leads']->importLeads($data, $idempotencyKey), array('count' => isset($data['leads']) && is_array($data['leads']) ? count($data['leads']) : 1));
    });
}

function swWorkOrderListAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod('GET');
        $actor = swLeadRequireActor();
        $container = swLeadServiceContainer();
        list($items, $meta) = $container['leads']->listWorkOrders(swLeadRequestData($query), $actor);
        return swLeadSuccess($items, $meta);
    });
}

function swWorkOrderGetAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod('GET');
        $actor = swLeadRequireActor();
        $data = swLeadRequestData($query);
        $id = swLeadIdentifier($data, array('work_order_id', 'workOrderId', 'order_id', 'id'));
        $container = swLeadServiceContainer();
        return swLeadSuccess($container['leads']->getWorkOrder($id, $actor));
    });
}

function swWorkOrderUpdateAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod(array('POST', 'PATCH'));
        $data = swLeadRequestData($query);
        $actor = swLeadRequireActor();
        swLeadRequireCsrf($data);
        $id = swLeadIdentifier($data, array('work_order_id', 'workOrderId', 'order_id', 'id'));
        if (isset($data['planned_visit']) && is_array($data['planned_visit']) && !isset($data['plannedVisit'])) {
            $data['plannedVisit'] = $data['planned_visit'];
        }
        $container = swLeadServiceContainer();
        return swLeadSuccess($container['leads']->updateWorkOrder($id, $data, $actor));
    });
}

function swWorkOrderCompleteAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod(array('POST', 'PATCH'));
        $data = swLeadRequestData($query);
        $actor = swLeadRequireActor();
        swLeadRequireCsrf($data);
        $id = swLeadIdentifier($data, array('work_order_id', 'workOrderId', 'order_id', 'id'));
        $container = swLeadServiceContainer();

        $savedIds = array();
        try {
            $savedIds = swLeadSaveCompletionPhotos($data);
            $result = $container['leads']->completeWorkOrder($id, $data, $savedIds, $actor);

            // A concurrent idempotent completion may win after files were saved.
            $used = array();
            foreach ((array)(isset($result['photos']) ? $result['photos'] : array()) as $photo) {
                if (is_array($photo) && isset($photo['id'])) {
                    $used[] = (int)$photo['id'];
                }
            }
            foreach (array_diff($savedIds, $used) as $unusedId) {
                swLeadDeleteFile($unusedId);
            }

            return swLeadSuccess($result);
        } catch (Throwable $exception) {
            foreach ($savedIds as $savedId) {
                swLeadDeleteFile($savedId);
            }
            throw $exception;
        }
    });
}

function swNotificationListAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod('GET');
        $actor = swLeadRequireActor();
        $container = swLeadServiceContainer();
        list($rows, $meta) = $container['notifications']->listForDealer($actor['dealer_id'], swLeadRequestData($query));
        $items = array();
        foreach ($rows as $row) {
            $items[] = $container['leads']->presentNotification($row);
        }
        return swLeadSuccess($items, $meta);
    });
}

function swNotificationReadAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod(array('POST', 'PATCH'));
        $data = swLeadRequestData($query);
        $actor = swLeadRequireActor();
        swLeadRequireCsrf($data);
        $id = swLeadPositiveInt($data, array('notification_id', 'notificationId', 'id'));
        $container = swLeadServiceContainer();
        $row = $container['notifications']->markRead($actor['dealer_id'], $id);
        return swLeadSuccess($container['leads']->presentNotification($row));
    });
}

function swNotificationsReadAllAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod(array('POST', 'PATCH'));
        $data = swLeadRequestData($query);
        $actor = swLeadRequireActor();
        swLeadRequireCsrf($data);
        $container = swLeadServiceContainer();
        $container['notifications']->markAllRead($actor['dealer_id']);
        list($rows, $meta) = $container['notifications']->listForDealer($actor['dealer_id'], array('page_size' => 100));
        $items = array();
        foreach ($rows as $row) {
            $items[] = $container['leads']->presentNotification($row);
        }
        return swLeadSuccess($items, $meta);
    });
}

function swLeadNotificationPreferencesGetAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod('GET');
        $actor = swLeadRequireActor();
        $container = swLeadServiceContainer();
        return swLeadSuccess($container['notifications']->preferences($actor['dealer_id']));
    });
}

function swLeadNotificationPreferencesUpdateAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod(array('POST', 'PATCH'));
        $data = swLeadRequestData($query);
        $actor = swLeadRequireActor();
        swLeadRequireCsrf($data);
        $preferences = isset($data['preferences']) && is_array($data['preferences']) ? $data['preferences'] : $data;
        $container = swLeadServiceContainer();
        $before = $container['notifications']->preferences($actor['dealer_id']);
        $updated = $container['notifications']->updatePreferences($actor['dealer_id'], $preferences);
        $container['audit']->record('notification_preferences', $actor['dealer_id'], 'notification_preferences.updated', $actor, $before, $updated);
        return swLeadSuccess($updated);
    });
}

function swLeadOutboxFlushAction(array $query)
{
    return swLeadHandle(function () use ($query) {
        swLeadRequireMethod('POST');
        $data = swLeadRequestData($query);
        swLeadRequireCronKey($data);
        $container = swLeadServiceContainer();
        return swLeadSuccess($container['outbox']->flush());
    });
}

/**
 * Called from OrderController only after a standard measurement order was saved.
 * This helper deliberately does not read php://input and verifies the active dealer.
 */
function swLeadConvertMeasurementAfterOrder($leadId, $orderId, $dealerId, $expectedVersion = null)
{
    $actor = swLeadRequireActor();
    if (empty($actor['is_admin']) && (int)$actor['dealer_id'] !== (int)$dealerId) {
        throw new SwLeadApiException(403, 'dealer_mismatch', 'Нельзя связать заказ с лидом другого дилера');
    }
    $container = swLeadServiceContainer();
    return $container['leads']->convertLead((string)$leadId, array(
        'orderId' => (string)$orderId,
        'expectedVersion' => $expectedVersion,
    ), $actor, true);
}

function swLeadIdentifier(array $data, array $keys)
{
    foreach ($keys as $key) {
        if (isset($data[$key]) && trim((string)$data[$key]) !== '') {
            $value = trim((string)$data[$key]);
            if (strlen($value) > 100 || !preg_match('/^[A-Za-z0-9А-Яа-яЁё._:-]+$/u', $value)) {
                throw new SwLeadApiException(422, 'validation_error', 'Некорректный идентификатор', array('field' => $key));
            }
            return $value;
        }
    }
    throw new SwLeadApiException(422, 'validation_error', 'Не указан идентификатор');
}

function swLeadSaveCompletionPhotos(array $data)
{
    if (!class_exists('CFile')) {
        throw new SwLeadApiException(503, 'file_storage_unavailable', 'Файловое хранилище Битрикс недоступно');
    }
    $files = array();
    if (isset($data['photos']) && is_array($data['photos'])) {
        foreach ($data['photos'] as $index => $photo) {
            if (!is_array($photo)) {
                throw new SwLeadApiException(422, 'validation_error', 'Некорректное описание фотографии', array('index' => $index));
            }
            $dataUrl = isset($photo['dataUrl']) ? $photo['dataUrl'] : (isset($photo['data_url']) ? $photo['data_url'] : '');
            if ($dataUrl === '') {
                throw new SwLeadApiException(422, 'validation_error', 'Фотография не содержит данных', array('index' => $index));
            }
            $files[] = swLeadDataUrlToFile($photo, $index);
        }
    }
    if (isset($_FILES['photos'])) {
        $files = array_merge($files, swLeadFlattenUploadedFiles($_FILES['photos']));
    }

    $maxPhotos = (int)swLeadConfig('work_order.max_photos', 10);
    if (count($files) > $maxPhotos) {
        foreach ($files as $file) {
            if (!empty($file['_remove_tmp']) && !empty($file['tmp_name'])) {
                @unlink($file['tmp_name']);
            }
        }
        throw new SwLeadApiException(422, 'too_many_photos', 'Превышено допустимое число фотографий', array('maxPhotos' => $maxPhotos));
    }

    $ids = array();
    try {
        foreach ($files as $index => $file) {
            $actualMime = swLeadValidateImageFile($file, $index);
            $saveFile = $file;
            unset($saveFile['_remove_tmp']);
            $saveFile['type'] = $actualMime;
            $extension = $actualMime === 'image/png' ? 'png' : ($actualMime === 'image/webp' ? 'webp' : 'jpg');
            // Never let a client-controlled extension reach the public upload tree.
            $saveFile['name'] = 'work-order-photo-' . ($index + 1) . '.' . $extension;
            $id = (int)CFile::SaveFile($saveFile, (string)swLeadConfig('work_order.upload_dir', 'superwindow/work-orders'));
            if ($id <= 0) {
                throw new SwLeadApiException(503, 'file_save_failed', 'Не удалось сохранить фотографию', array('index' => $index));
            }
            $ids[] = $id;
            swLeadRegisterCompletionPhoto($id);
            if (!empty($file['_remove_tmp']) && !empty($file['tmp_name'])) {
                @unlink($file['tmp_name']);
            }
        }
    } catch (Throwable $exception) {
        foreach ($files as $file) {
            if (!empty($file['_remove_tmp']) && !empty($file['tmp_name'])) {
                @unlink($file['tmp_name']);
            }
        }
        foreach ($ids as $id) {
            swLeadDeleteFile($id);
        }
        throw $exception;
    }
    return $ids;
}

/**
 * Recent Bitrix versions reject a newly saved numeric CFile ID unless it was
 * registered for this user field. Register only the IDs produced immediately
 * above by our MIME-validated uploader, never IDs supplied in request JSON.
 */
function swLeadRegisterCompletionPhoto($id)
{
    if (!class_exists('Bitrix\\Main\\UserField\\File\\ManualUploadRegistry')) {
        return;
    }
    $repository = new SwLeadRepository();
    $meta = $repository->metadata('work_orders');
    $fieldName = $meta['config']['fields']['photo_ids'];
    $userField = CUserTypeEntity::GetList(array(), array(
        'ENTITY_ID' => 'HLBLOCK_' . (int)$meta['hlblock_id'],
        'FIELD_NAME' => $fieldName,
    ))->Fetch();
    if (!$userField || $userField['USER_TYPE_ID'] !== 'file' || $userField['MULTIPLE'] !== 'Y') {
        throw new SwLeadApiException(503, 'photo_field_unavailable', 'Поле фотоотчёта настроено некорректно');
    }
    \Bitrix\Main\UserField\File\ManualUploadRegistry::getInstance()->registerFile($userField, (int)$id);
}

function swLeadDataUrlToFile(array $photo, $index)
{
    $dataUrl = (string)(isset($photo['dataUrl']) ? $photo['dataUrl'] : (isset($photo['data_url']) ? $photo['data_url'] : ''));
    if (!preg_match('#^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$#i', $dataUrl, $matches)) {
        throw new SwLeadApiException(422, 'invalid_photo', 'Поддерживаются JPEG, PNG и WebP в формате data URL', array('index' => $index));
    }
    $bytes = base64_decode(preg_replace('/\s+/', '', $matches[2]), true);
    if ($bytes === false || $bytes === '') {
        throw new SwLeadApiException(422, 'invalid_photo', 'Не удалось декодировать фотографию', array('index' => $index));
    }
    $maxBytes = (int)swLeadConfig('work_order.max_photo_bytes', 10485760);
    if (strlen($bytes) > $maxBytes) {
        throw new SwLeadApiException(422, 'photo_too_large', 'Фотография превышает допустимый размер', array('index' => $index, 'maxBytes' => $maxBytes));
    }
    $declaredSize = (int)(isset($photo['size']) ? $photo['size'] : 0);
    if ($declaredSize > 0 && $declaredSize !== strlen($bytes)) {
        throw new SwLeadApiException(422, 'photo_size_mismatch', 'Размер фотографии не совпадает с переданными данными', array('index' => $index));
    }

    $tmp = tempnam(sys_get_temp_dir(), 'sw_lead_photo_');
    if ($tmp === false || file_put_contents($tmp, $bytes, LOCK_EX) !== strlen($bytes)) {
        throw new SwLeadApiException(503, 'temp_file_failed', 'Не удалось подготовить фотографию');
    }
    $mime = strtolower($matches[1]);
    $extension = $mime === 'image/png' ? 'png' : ($mime === 'image/webp' ? 'webp' : 'jpg');
    $name = isset($photo['name']) ? basename(str_replace('\\', '/', (string)$photo['name'])) : ('photo-' . ($index + 1) . '.' . $extension);
    if ($name === '' || $name === '.' || $name === '..') {
        $name = 'photo-' . ($index + 1) . '.' . $extension;
    }

    return array(
        'name' => substr($name, 0, 200),
        'type' => $mime,
        'tmp_name' => $tmp,
        'error' => UPLOAD_ERR_OK,
        'size' => strlen($bytes),
        '_remove_tmp' => true,
    );
}

function swLeadFlattenUploadedFiles(array $spec)
{
    $result = array();
    if (!is_array(isset($spec['name']) ? $spec['name'] : null)) {
        return array($spec);
    }
    foreach ($spec['name'] as $index => $name) {
        $result[] = array(
            'name' => $name,
            'type' => isset($spec['type'][$index]) ? $spec['type'][$index] : '',
            'tmp_name' => isset($spec['tmp_name'][$index]) ? $spec['tmp_name'][$index] : '',
            'error' => isset($spec['error'][$index]) ? $spec['error'][$index] : UPLOAD_ERR_NO_FILE,
            'size' => isset($spec['size'][$index]) ? $spec['size'][$index] : 0,
            '_remove_tmp' => false,
        );
    }
    return $result;
}

function swLeadValidateImageFile(array $file, $index)
{
    if ((int)(isset($file['error']) ? $file['error'] : UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || empty($file['tmp_name']) || !is_file($file['tmp_name'])) {
        throw new SwLeadApiException(422, 'invalid_photo_upload', 'Не удалось загрузить фотографию', array('index' => $index));
    }
    $size = (int)(isset($file['size']) ? $file['size'] : filesize($file['tmp_name']));
    $maxBytes = (int)swLeadConfig('work_order.max_photo_bytes', 10485760);
    if ($size <= 0 || $size > $maxBytes) {
        throw new SwLeadApiException(422, 'photo_too_large', 'Недопустимый размер фотографии', array('index' => $index, 'maxBytes' => $maxBytes));
    }

    $mime = '';
    if (function_exists('finfo_open')) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $mime = (string)finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);
        }
    }
    $imageInfo = function_exists('getimagesize') ? @getimagesize($file['tmp_name']) : false;
    if ($mime === '' && is_array($imageInfo) && isset($imageInfo['mime'])) {
        $mime = (string)$imageInfo['mime'];
    }
    if (!in_array(strtolower($mime), array('image/jpeg', 'image/png', 'image/webp'), true)) {
        throw new SwLeadApiException(422, 'invalid_photo_type', 'Файл не является JPEG, PNG или WebP', array('index' => $index));
    }
    if (!is_array($imageInfo) || empty($imageInfo[0]) || empty($imageInfo[1]) || ((int)$imageInfo[0] * (int)$imageInfo[1]) > 50000000) {
        throw new SwLeadApiException(422, 'invalid_photo_dimensions', 'Некорректные или слишком большие размеры изображения', array('index' => $index));
    }

    return strtolower($mime);
}

function swLeadDeleteFile($id)
{
    if ((int)$id > 0 && class_exists('CFile')) {
        CFile::Delete((int)$id);
    }
}
