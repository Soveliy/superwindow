<?php
use Bitrix\Main\Loader;
use Bitrix\Main\Data\Cache;
use Bitrix\Sale;
use Bitrix\Sale\Fuser;
use Bitrix\Sale\Order;
use Bitrix\Sale\Payment;

function normalizePaymentText($value)
{
    $value = trim((string)$value);

    if (function_exists('mb_strtolower')) {
        return mb_strtolower($value, 'UTF-8');
    }

    return strtolower($value);
}

function inferPaymentProvider($method)
{
    $method = normalizePaymentText($method);

    if (strpos($method, 'yandex') !== false || strpos($method, 'яндекс') !== false) {
        return 'yandex_pay';
    }

    if (strpos($method, 'sber') !== false || strpos($method, 'сбер') !== false) {
        return 'sber';
    }

    if (strpos($method, 'sbp') !== false || strpos($method, 'сбп') !== false || strpos($method, 'спб') !== false) {
        return 'sbp';
    }

    return 'cash';
}

function inferPaymentVariant($provider, $method)
{
    $method = normalizePaymentText($method);

    if ($provider === 'cash') {
        return 'cash';
    }

    if ($provider === 'sbp') {
        return 'qr';
    }

    if (strpos($method, 'installment') !== false || strpos($method, 'расср') !== false || strpos($method, 'част') !== false) {
        return 'installment';
    }

    return 'card';
}

function extractOrderPaymentPayload($data)
{
    $payment = [];

    if (isset($data['payment']) && is_array($data['payment'])) {
        $payment = array_merge($payment, $data['payment']);
    }

    if (isset($data['values']['payment']) && is_array($data['values']['payment'])) {
        $payment = array_merge($payment, $data['values']['payment']);
    }

    if (isset($data['order']['payment']) && is_array($data['order']['payment'])) {
        $payment = array_merge($payment, $data['order']['payment']);
    }

    $method = $payment['method']
        ?? $payment['payment_method']
        ?? $payment['paymentMethod']
        ?? $payment['pay_system_code']
        ?? $payment['paySystemCode']
        ?? 'cash';

    $provider = $payment['provider']
        ?? $payment['payment_provider']
        ?? $payment['paymentProvider']
        ?? inferPaymentProvider($method);

    $variant = $payment['variant']
        ?? $payment['payment_variant']
        ?? $payment['paymentVariant']
        ?? inferPaymentVariant($provider, $method);

    return [
        'provider' => $provider,
        'variant' => $variant,
        'method' => $method,
        'label' => $payment['label'] ?? $payment['payment_label'] ?? $payment['paymentLabel'] ?? '',
    ];
}

function hasOrderPaymentPayload($data)
{
    return (
        isset($data['payment']) ||
        isset($data['values']['payment']) ||
        isset($data['order']['payment'])
    );
}

function getPaymentProviderKeywords($provider)
{
    switch ($provider) {
        case 'yandex_pay':
            return ['яндекс', 'yandex', 'ya pay', 'yapay'];
        case 'sber':
            return ['сбер', 'sber'];
        case 'sbp':
            return ['сбп', 'спб', 'sbp'];
        case 'cash':
        default:
            return ['налич', 'cash'];
    }
}

function getPaymentVariantKeywords($variant)
{
    if ($variant === 'installment') {
        return ['расср', 'част', 'installment', 'split'];
    }

    if ($variant === 'card') {
        return ['карт', 'card'];
    }

    if ($variant === 'qr') {
        return ['qr', 'сбп', 'sbp'];
    }

    return [];
}

function paymentTextHasKeyword($text, $keywords)
{
    foreach ($keywords as $keyword) {
        if ($keyword !== '' && strpos($text, normalizePaymentText($keyword)) !== false) {
            return true;
        }
    }

    return false;
}

function resolveOrderPaySystem($payment)
{
    $provider = $payment['provider'] ?? 'cash';
    $variant = $payment['variant'] ?? 'cash';
    $providerKeywords = getPaymentProviderKeywords($provider);
    $variantKeywords = getPaymentVariantKeywords($variant);
    $bestPaySystem = null;
    $bestScore = 0;

    $dbPaySystems = CSalePaySystem::GetList(['SORT' => 'ASC'], ['ACTIVE' => 'Y']);
    while ($paySystem = $dbPaySystems->Fetch()) {
        $text = normalizePaymentText(
            ($paySystem['NAME'] ?? '') . ' ' .
            ($paySystem['PSA_NAME'] ?? '') . ' ' .
            ($paySystem['DESCRIPTION'] ?? '') . ' ' .
            ($paySystem['CODE'] ?? '')
        );
        $score = 0;

        if (paymentTextHasKeyword($text, $providerKeywords)) {
            $score += 10;
        }

        if (!empty($variantKeywords) && paymentTextHasKeyword($text, $variantKeywords)) {
            $score += 3;
        }

        if (!empty($payment['label']) && strpos($text, normalizePaymentText($payment['label'])) !== false) {
            $score += 2;
        }

        if ($score > $bestScore) {
            $bestScore = $score;
            $bestPaySystem = $paySystem;
        }
    }

    if ($bestPaySystem && $bestScore >= 10) {
        return [
            'id' => (int)$bestPaySystem['ID'],
            'name' => $bestPaySystem['NAME'],
        ];
    }

    $fallbackIds = [
        'cash' => 1,
        'yandex_pay' => 2,
        'sber' => 3,
        'sbp' => 4,
    ];
    $fallbackId = $fallbackIds[$provider] ?? 1;
    $fallbackPaySystem = CSalePaySystem::GetByID($fallbackId);

    if ($fallbackPaySystem) {
        return [
            'id' => (int)$fallbackPaySystem['ID'],
            'name' => $fallbackPaySystem['NAME'],
        ];
    }

    return null;
}

function applyOrderPayment($order, $data)
{
    $paymentPayload = extractOrderPaymentPayload(is_array($data) ? $data : []);
    $paySystem = resolveOrderPaySystem($paymentPayload);

    if (!$paySystem) {
        return [
            'success' => false,
            'message' => 'Payment system not found',
            'payment' => $paymentPayload,
        ];
    }

    $paymentCollection = $order->getPaymentCollection();

    if ($paymentCollection->isEmpty()) {
        $payment = $paymentCollection->createItem();
    } else {
        $payment = $paymentCollection[0];
    }

    $payment->setField('PAY_SYSTEM_ID', $paySystem['id']);
    $payment->setField('PAY_SYSTEM_NAME', $paySystem['name']);
    $payment->setField('SUM', $order->getPrice());
    $payment->setField('CURRENCY', $order->getCurrency());

    return [
        'success' => true,
        'payment' => $paymentPayload,
        'pay_system_id' => $paySystem['id'],
        'pay_system_name' => $paySystem['name'],
    ];
}

// ПОЛУЧИТЬ ЗАКАЗЫ ДИЛЕРА [status, from, to, limit, page]
function getOrders($query) {

    // Защита
    // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    //     return ['error' => 'Only POST'];
    // }

    if (!\Bitrix\Main\Loader::includeModule('sale')) {
        return ['error' => 'Module sale not installed'];
    }

    global $USER;

    if (!$USER->IsAuthorized()) {
        return ['error' => 'Unauthorized'];
    }

    $userId = $USER->GetID();

    // фильтры
    $filter = ['RESPONSIBLE_ID' => $userId];
    if (!empty($query['status'])) {
        $filter['STATUS_ID'] = $query['status'];
    }
    if (!empty($query['from'])) {
        $filter['>=DATE_INSERT'] = $query['from']; // формат "DD-MM-YYYY"
    }
    if (!empty($query['to'])) {
        $filter['<=DATE_INSERT'] = $query['to'];
    }

    $totalOrders = CSaleOrder::GetList([], $filter, []);

    $orders = [];
    $dbOrders = CSaleOrder::GetList(
        ['DATE_INSERT' => 'DESC'],
        $filter,
        false,
        ['nPageSize' => $query['limit'] ?? 20, 'iNumPage' => $query['page'] ?? 1],
        ['ID', "USER_ID", "PERSON_TYPE_ID", 'DATE_INSERT', 'PRICE', 'CURRENCY', 'STATUS_ID', 'PAYED', 'DELIVERY_ID', 'ORDER_ID', 'ORDER_CODE']
    );

    while ($order = $dbOrders->Fetch()) {

        // Получаем свойства заказа
        $dbProps = CSaleOrderPropsValue::GetList(
            array("SORT" => "ASC"),
            array("ORDER_ID" => $order["ID"])
        );

        $arOrderProps = array();
        while ($arProp = $dbProps->Fetch()) {
            $arOrderProps[$arProp["CODE"]] = $arProp["VALUE"];
        }

        $basket = [];
        $dbBasket = CSaleBasket::GetList(
            ["NAME" => "ASC"],
            ["ORDER_ID" => (int)$order['ID']],
            false,
            false,
            ["*"]
        );

        while ($item = $dbBasket->Fetch()) {
            $basketProps = [];
            $dbProp = CSaleBasket::GetPropsList([], ['BASKET_ID' => $item['ID']]);

            while ($prop = $dbProp->Fetch()) {
                $basketProps[$prop['CODE']] = $prop['VALUE'];
            }

            $basket[] = [
                'id' => (int)$item['PRODUCT_ID'],
                'basket_id' => (int)$item['ID'],
                'name' => $item['NAME'],
                'price' => (float)$item['PRICE'],
                'quantity' => (float)$item['QUANTITY'],
                'currency' => $item['CURRENCY'],
                'props' => $basketProps,
            ];
        }

        $orders[] = [
            // 'debug' => $order,
            'id' => (int)$order['ID'],
            'date' => $order['DATE_INSERT'],
            'price' => (float)$order['PRICE'],
            'currency' => $order['CURRENCY'],
            'status' => $order['STATUS_ID'],
            'payed' => $order['PAYED'] === 'Y',
            'delivery_id' => $order['DELIVERY_ID'],
            'tracking_number' => $order['TRACKING_NUMBER'],
            'order_props' => $arOrderProps,
            'items' => $basket,
            'basket' => $basket
        ];
    }

    return [
        'total' => $totalOrders,
        'count' => count($orders),
        'items' => $orders
    ];
}

// ПОЛУЧИТЬ ДЕТАЛЬНЫЙ ЗАКАЗ [order_id]
function getOrder($query) {

    // Защита
    // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    //     return ['error' => 'Only POST'];
    // }

    global $USER;
    if (!$USER->IsAuthorized()) {
        return ['error' => 'Unauthorized'];
    }

    $orderId = (int)($query['order_id'] ?? 0);
    if (!$orderId) {
        return ['error' => 'Empty order_id'];
    }

    // Подтверждаем что заказ принадлежит текущему дилеру
    $order = CSaleOrder::GetByID($orderId);
    if (!$order || (int)$order['RESPONSIBLE_ID'] != $USER->GetID()) {
        return ['error' => 'Order not found or access denied'];
    }

    // Получаем элементы заказа
    $basket = [];
    $dbBasket = CSaleBasket::GetList(
        ["NAME" => "ASC"],
        ["ORDER_ID" => $orderId],
        false,
        false,
        ["*"]
    );

    while ($item = $dbBasket->Fetch()) {

        $basketProps = [];
        $dbProp = CSaleBasket::GetPropsList([], ['BASKET_ID' => $item['ID']]);
        while ($prop = $dbProp->Fetch()) {
            $basketProps[$prop['CODE']] = $prop['VALUE'];
        }

        $basket[] = [
            'id' => (int)$item['PRODUCT_ID'],
            'name' => $item['NAME'],
            'price' => (float)$item['PRICE'],
            'quantity' => (float)$item['QUANTITY'],
            'currency' => $item['CURRENCY'],
            'props' => $basketProps,
        ];
    }

    // Опции доставки и оплаты
    $payment = CSalePaySystem::GetByID($order['PAY_SYSTEM_ID']);

    // Получаем свойства заказа
    $dbProps = CSaleOrderPropsValue::GetList(
        array("SORT" => "ASC"),
        array("ORDER_ID" => $order["ID"])
    );

    $arOrderProps = array();
    while ($arProp = $dbProps->Fetch()) {
        $arOrderProps[$arProp["CODE"]] = $arProp["VALUE"];
    }

    return [
        'id' => (int)$order['ID'],
        'date' => $order['DATE_INSERT'],
        'status' => $order['STATUS_ID'],
        'price' => (float)$order['PRICE'],
        'paid' => (float)$order['SUM_PAID'],
        'payment' => [
            'id' => $payment['ID'] ?? null,
            'name' => $payment['NAME'] ?? '',
        ],
        'props' => $arOrderProps,
        'items' => $basket
    ];
}

// Ручная установка что заказ полностью оплачен [order_id]
function setOrderPaidFull($query)
{
    // Защита
    // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    //     return ['error' => 'Only POST'];
    // }

    global $USER;
    if (!$USER->IsAuthorized()) {
        return ['error' => 'Unauthorized'];
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $data = is_array($data) ? $data : [];
    $query = array_merge(is_array($query) ? $query : [], $data);
    $orderId = (int)($query["order_id"] ?? $query["orderId"] ?? 0);

    if ($orderId <= 0) {
        http_response_code(400);
        return [
            'status' => 'error',
            'message' => 'Invalid order ID'
        ];
    }

    // Подтверждаем что заказ принадлежит текущему дилеру
    $order = CSaleOrder::GetByID($orderId);
    if (!$order || (int)$order['RESPONSIBLE_ID'] != $USER->GetID()) {
        http_response_code(404);
        return ['error' => 'Order not found or access denied'];
    }

    $order = Order::load($orderId);

    if (!$order) {
        return [
            'status' => 'error',
            'message' => 'Order not found'
        ];
    }

    $paymentPayload = extractOrderPaymentPayload($data);

    if (($paymentPayload['provider'] ?? 'cash') !== 'cash') {
        http_response_code(400);
        return [
            'status' => 'error',
            'message' => 'Manual payment confirmation is available for cash only'
        ];
    }

    $price = $order->getPrice();
    $paymentCollection = $order->getPaymentCollection();

    // создаём оплату
    if ($paymentCollection->isEmpty()) {
        $payment = $paymentCollection->createItem();
        $payment->setField("PAY_SYSTEM_ID", 1); //Id наложки
        $payment->setField("SUM", $price);
        $payment->setField("CURRENCY", $order->getCurrency());
    } else {
        $payment = $paymentCollection[0];
        $payment->setField("SUM", $price);
    }

    // отмечаем как оплачено
    $payment->setField("PAY_SYSTEM_ID", 1);
    $payment->setField("SUM", $price);
    $payment->setField("CURRENCY", $order->getCurrency());
    $payment->setPaid("Y");

    // статус заказа
    $order->setField("STATUS_ID", "OP");

    $saveResult = $order->save();

    if (!$saveResult->isSuccess()) {
        return [
            'status' => 'error',
            'message' => implode(', ', $saveResult->getErrorMessages())
        ];
    }

    return [
        'status' => 'success',
        'order_id' => $orderId,
        'paid_sum' => $price
    ];
}

// СОЗДАТЬ НОВЫЙ ЗАКАЗ
function createOrder($query)
{
    $data = json_decode(file_get_contents('php://input'), true);
    $data = is_array($data) ? $data : [];
    $sourceLeadId = trim((string)(
        $data['sourceLeadId']
        ?? $data['source_lead_id']
        ?? ($data['values']['sourceLeadId'] ?? '')
    ));

    if ($sourceLeadId === '') {
        return createOrderInternal($query, $data, null);
    }

    if (!function_exists('swLeadServiceContainer')) {
        http_response_code(503);
        return [
            'success' => false,
            'error' => ['code' => 'lead_module_unavailable', 'message' => 'Модуль лидов недоступен'],
        ];
    }

    return swLeadHandle(function () use ($query, $data, $sourceLeadId) {
        swLeadRequireMethod('POST');
        $actor = swLeadRequireActor();
        swLeadRequireCsrf($data);
        $expectedVersion = $data['sourceLeadVersion'] ?? $data['source_lead_version'] ?? null;
        $container = swLeadServiceContainer();
        $initialContext = $container['leads']->getMeasurementOrderContext($sourceLeadId, [
            'expectedVersion' => $expectedVersion,
        ], $actor);

        return $container['repository']->withNamedLock('measurement_order', $initialContext['leadId'], function () use ($query, $data, $sourceLeadId, $expectedVersion, $actor, $container) {
            $context = $container['leads']->getMeasurementOrderContext($sourceLeadId, [
                'expectedVersion' => $expectedVersion,
            ], $actor);

            $linkedOrderId = !empty($context['orderId'])
                ? (int)$context['orderId']
                : swFindSaleOrderBySourceLead($context['leadId'], $actor['user_id']);

            if ($linkedOrderId > 0) {
                $orderRow = CSaleOrder::GetByID($linkedOrderId);
                if (!$orderRow || (int)$orderRow['RESPONSIBLE_ID'] !== (int)$actor['user_id']) {
                    throw new SwLeadApiException(409, 'linked_order_owner_conflict', 'Связанный заказ принадлежит другому дилеру');
                }
                if ($context['status'] !== 'converted') {
                    swLeadConvertMeasurementAfterOrder($context['leadId'], $linkedOrderId, $actor['dealer_id'], $context['version']);
                }
                return [
                    'success' => true,
                    'order_id' => $linkedOrderId,
                    'user_id' => (int)$orderRow['USER_ID'],
                    'source_lead_id' => (string)$context['leadId'],
                    'idempotent' => true,
                ];
            }

            swLeadAssertOrderPropertiesConfigured();
            $result = createOrderInternal($query, $data, $context);
            if (empty($result['success']) || empty($result['order_id'])) {
                return $result;
            }

            // The order already contains SOURCE_LEAD_ID, so a retry can recover
            // the link even if the following HL update is interrupted.
            swLeadConvertMeasurementAfterOrder(
                $context['leadId'],
                $result['order_id'],
                $actor['dealer_id'],
                $context['version']
            );
            $result['source_lead_id'] = (string)$context['leadId'];
            $result['sourceLeadId'] = (string)$context['leadId'];
            return $result;
        }, 'measurement_order_busy');
    });
}

function createOrderInternal($query, $data = null, $leadContext = null)
{
    global $USER;
    $siteId = SITE_ID;

    if (!is_array($data)) {
        $data = json_decode(file_get_contents('php://input'), true);
        $data = is_array($data) ? $data : [];
    }

    // получаем/создаём пользователя
    $userResult['user_id'] = $data['user_id'];

    if (!$userResult['user_id']) {
        return ['error' => 'User not found'];
    }

    $buyerId = $userResult['user_id'];

    // корзина текущего fuser
    $fUserId = \Bitrix\Sale\Fuser::getId();
    $basket = \Bitrix\Sale\Basket::loadItemsForFUser($fUserId, $siteId);

    if ($basket->isEmpty()) {
        return ['error' => 'Basket empty'];
    }

    // создаем заказ ОТ ПОКУПАТЕЛЯ
    $order = \Bitrix\Sale\Order::create($siteId, $buyerId);
    $order->setPersonTypeId(is_array($leadContext) ? (int)swLeadConfig('sale_order.person_type_id', 1) : 1);

    // корзина
    $order->setBasket($basket);

    // описание
    $order->setField('USER_DESCRIPTION', $data['values']['comment'] ?? '');

    // ответственный (дилер)
    $order->setField('RESPONSIBLE_ID', $USER->GetID());

    // СТАТУС
    $status = !empty($query['status']) ? $query['status'] : 'N';
    $order->setField('STATUS_ID', $status);

    // свойства заказа
    $propertyCollection = $order->getPropertyCollection();

    $map = [
        'FIO' => $data['values']['customer']['fullName'] ?? null,
        'PHONE' => $data['values']['customer']['phone'] ?? null,
        'ADDRESS' => $data['values']['customer']['address'] ?? null,
        'ORDER_CODE' => $data['order']['code'] ?? null,
        'ORDER_ID' => $data['orderId'] ?? null,
        'MEASUREMENT_DATE' => $data['values']['customer']['measurementDate'] ?? null,
        'PRODUCTION_DATE' => $data['values']['customer']['productionDate'] ?? null,
        'INSTALLATION_DATE' => $data['values']['customer']['installationDate'] ?? null,
    ];

    if (is_array($leadContext)) {
        // Lead-sourced identity and address are authoritative. Never accept
        // client-side overrides for an order converted from a measurement lead.
        $map['FIO'] = (string)$leadContext['customerName'];
        $map['PHONE'] = (string)$leadContext['phone'];
        $map['ADDRESS'] = (string)$leadContext['address'];
        $leadPropertyCodes = swLeadConfig('sale_order.property_codes', []);
        $map[$leadPropertyCodes['lead_id']] = (string)$leadContext['leadId'];
        $map[$leadPropertyCodes['product_type']] = (string)$leadContext['productType'];
        $map[$leadPropertyCodes['budget']] = $leadContext['budget'] === null ? '' : (string)$leadContext['budget'];
    }

    foreach ($propertyCollection as $prop) {
        $code = $prop->getField('CODE');
        if (isset($map[$code])) {
            $prop->setValue($map[$code]);
        }
    }

    // доставка
    $shipmentCollection = $order->getShipmentCollection();
    foreach ($shipmentCollection as $shipment) {
        if ($shipment->isSystem()) continue;

        $shipment->setField('DELIVERY_ID', 3);

        $shipmentItemCollection = $shipment->getShipmentItemCollection();

        foreach ($basket as $basketItem) {
            $item = $shipmentItemCollection->createItem($basketItem);
            $item->setQuantity($basketItem->getQuantity());
        }
    }

    // оплата
    // финализация
    $order->doFinalAction(true);
    $paymentResult = applyOrderPayment($order, $data);

    if (empty($paymentResult['success'])) {
        return [
            'status' => 'error',
            'message' => $paymentResult['message'] ?? 'Payment system not found',
            'payment' => $paymentResult['payment'] ?? null,
        ];
    }

    $result = $order->save();

    if (!$result->isSuccess()) {
        return ['error' => $result->getErrorMessages()];
    }

    return [
        'success' => true,
        'order_id' => $order->getId(),
        'user_id' => $buyerId
    ];
}

function swLeadAssertOrderPropertiesConfigured()
{
    if (!Loader::includeModule('sale')) {
        throw new SwLeadApiException(503, 'sale_module_unavailable', 'Модуль sale недоступен');
    }
    $personTypeId = (int)swLeadConfig('sale_order.person_type_id', 1);
    $codes = array_values((array)swLeadConfig('sale_order.property_codes', []));
    $missing = [];
    foreach ($codes as $code) {
        $property = CSaleOrderProps::GetList([], [
            'PERSON_TYPE_ID' => $personTypeId,
            'CODE' => $code,
            'ACTIVE' => 'Y',
        ])->Fetch();
        if (!$property) {
            $missing[] = $code;
        }
    }
    if ($missing) {
        throw new SwLeadApiException(503, 'lead_order_properties_missing', 'Не настроены свойства заказа для связи с лидом', [
            'missingCodes' => $missing,
        ]);
    }
}

function swFindSaleOrderBySourceLead($leadId, $responsibleId)
{
    $codes = (array)swLeadConfig('sale_order.property_codes', []);
    $code = $codes['lead_id'] ?? 'SOURCE_LEAD_ID';
    $values = CSaleOrderPropsValue::GetList(['ID' => 'DESC'], [
        'CODE' => $code,
        'VALUE' => (string)$leadId,
    ]);
    while ($value = $values->Fetch()) {
        $orderId = (int)($value['ORDER_ID'] ?? 0);
        $orderRow = $orderId > 0 ? CSaleOrder::GetByID($orderId) : null;
        if ($orderRow && (int)$orderRow['RESPONSIBLE_ID'] === (int)$responsibleId) {
            return $orderId;
        }
    }
    return 0;
}


// ОБНОВЛЕНИЕ ЗАКАЗА [order_id, $data]
function setOrderRefresh($query)
{
    // Защита
    // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    //     return ['error' => 'Only POST'];
    // }

    global $USER;
    if (!$USER->IsAuthorized()) {
        return ['error' => 'Unauthorized'];
    }

    $siteId = SITE_ID;
    $data = json_decode(file_get_contents('php://input'), true);
    $data = is_array($data) ? $data : [];

    $orderId = (int)($query["order_id"] ?? $query["orderId"] ?? $data["order_id"] ?? $data["orderId"] ?? 0);

    if ($orderId <= 0) {
        return [
            'status' => 'error',
            'message' => 'Invalid order ID'
        ];
    }

    // Подтверждаем что заказ принадлежит текущему дилеру
    $orderR = CSaleOrder::GetByID($orderId);
    if (!$orderR || (int)$orderR['RESPONSIBLE_ID'] != $USER->GetID()) {
        return ['error' => 'Order not found or access denied'];
    }

    $order = Order::load($orderId);

    if (!$order) {
        return [
            'status' => 'error',
            'message' => 'Order not found'
        ];
    }

    // Получаем массив свойств заказа
    if (isOrderLockedForEditing($orderId)) {
        return getOrderEditingLockedResponse();
    }

    $propertyCollection = $order->getPropertyCollection();
    $arProps = $propertyCollection->getArray();

    foreach ($propertyCollection as $property) {
        $code = $property->getField('CODE');

        // не меняем данные покупателя, т.к. он уже создан
        // if ($code === 'FIO')
        //     $property->setValue($data['values']['customer']['fullName']);
        // if ($code === 'PHONE')
        //     $property->setValue($data['values']['customer']['phone']);
        // if ($code === 'ADDRESS')
        //     $property->setValue($data['values']['customer']['address']);

        // if ($code === 'ORDER_CODE')
        //     $property->setValue($data['order']['code']);
        // if ($code === 'ORDER_ID')
        //     $property->setValue($data['orderId']);

        if ($code === 'MEASUREMENT_DATE')
            $property->setValue($data['values']['customer']['measurementDate']);
        if ($code === 'PRODUCTION_DATE')
            $property->setValue($data['values']['customer']['productionDate']);
        if ($code === 'INSTALLATION_DATE')
            $property->setValue($data['values']['customer']['installationDate']);
    }


    // позиции
    $positions = [];
    foreach ($data['values']['positions'] as $p) {
        $positions[$p['positionId']] = $p;
    }
    // raw позиции
    $rawPositions = [];
    foreach ($data['values']['rawPositions'] as $p) {
        $rawPositions[$p['id']] = $p;
    }
    // labels
    $labels = [];
    foreach ($data['labels']['positions'] as $l) {
        $labels[$l['positionId']] = $l;
    }

    // КОРЗИНА (товары в заказе)
    if ($order) {

        $basket = $order->getBasket();
        $existingItems = [];

        // перебираем товары
        foreach ($basket->getBasketItems() as $item) {

            $propCollection = $item->getPropertyCollection();
            $positionId = null;

            foreach ($propCollection as $prop) {

                if ($prop->getField('CODE') === 'positionId') {
                    $positionId = $prop->getField('VALUE');
                }
            }

            if ($positionId) {
                $existingItems[$positionId] = $item;
            }
        }


        // ОБНОВЛЕНИЕ/ДОБАВЛЕНИЕ
        foreach ($positions as $positionId => $pos) {

            $raw = $rawPositions[$positionId] ?? [];
            $label = $labels[$positionId] ?? [];

            if (isset($existingItems[$positionId])) {

                // ОБНОВЛЕНИЕ
                $item = $existingItems[$positionId];

                $item->setFields([
                    'PRICE' => (float)$pos['price'],
                    'CUSTOM_PRICE' => 'Y',
                    'QUANTITY' => 1,
                    'NAME' => 'Позиция ' . $pos['index']
                ]);

                $propCollection = $item->getPropertyCollection();

                // собрать текущие свойства
                $currentProps = [];
                foreach ($propCollection as $p) {
                    $currentProps[$p->getField('CODE')] = $p->getField('VALUE');
                }

                $currentProps['dimensions'] = $pos['widthMm'] . ' x ' . $pos['heightMm'] . ' мм';

                // raw данные
                foreach ($raw as $k => $v) {
                    if (is_array($v)) {
                        $currentProps[$k] = json_encode($v, JSON_UNESCAPED_UNICODE);
                    } else {
                        $currentProps[$k] = $v;
                    }
                }

                // labels
                foreach ($label as $k => $v) {
                    // if ($k !== 'positionId') {
                    //     $currentProps[$k] = $v;
                    // }

                    if ($k === 'positionId') {
                        continue;
                    }

                    if (is_array($v) && empty($v)) {
                        continue;
                    }

                    $currentProps[$k] = is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : $v;
                }

                // сохранить обратно
                $newProps = [];
                foreach ($currentProps as $code => $value) {
                    $newProps[] = [
                        'NAME' => $code,
                        'CODE' => $code,
                        'VALUE' => $value
                    ];
                }

                $propCollection->setProperty($newProps);

            } else {

                // ДОБАВЛЕНИЕ
                $item = $basket->createItem('catalog', 0);

                $item->setFields([
                    'NAME' => 'Позиция ' . $pos['index'],
                    'PRICE' => (float)$pos['price'],
                    'CUSTOM_PRICE' => 'Y',
                    'CURRENCY' => $order->getCurrency(),
                    'QUANTITY' => 1
                ]);

                $props = [
                    [
                        'NAME' => 'positionId',
                        'CODE' => 'positionId',
                        'VALUE' => $positionId
                    ],
                    [
                        'NAME' => 'dimensions',
                        'CODE' => 'dimensions',
                        'VALUE' => $pos['widthMm'] . ' x ' . $pos['heightMm'] .' мм'
                    ]
                ];

                $item->getPropertyCollection()->setProperty($props);
            }
        }

        // УДАЛЕНИЕ ЛИШНИХ
        foreach ($existingItems as $positionId => $item) {
            if (!isset($positions[$positionId])) {
                $item->delete();
            }
        }

        //удаляем старые услуги
        foreach ($basket->getBasketItems() as $item) {

            $props = $item->getPropertyCollection();
            // проверяем что это сервис по типу
            foreach ($props as $prop) {
                if ($prop->getField('CODE') === 'type' && $prop->getField('VALUE') === 'service') {
                    $item->delete();
                }
            }
        }


        // добавляем заново
        foreach ($data['values']['services'] as $service) {

            $price = $service['price'] ?? $service['finalPrice'] ?? 0;
            $serviceType = $service['type'] ?? '';
            $item = $basket->createItem('catalog', 0);

            $item->setFields([
                'NAME' => $serviceType ?: 'service',
                'PRICE' => (float)$price,
                'CUSTOM_PRICE' => 'Y',
                'CURRENCY' => $order->getCurrency(),
                'QUANTITY' => 1
            ]);

            $serviceProps = [
                [
                    'NAME' => 'type',
                    'CODE' => 'type',
                    'VALUE' => 'service'
                ],
                [
                    'NAME' => 'serviceType',
                    'CODE' => 'serviceType',
                    'VALUE' => $serviceType
                ],
                [
                    'NAME' => 'rawService',
                    'CODE' => 'rawService',
                    'VALUE' => json_encode($service, JSON_UNESCAPED_UNICODE)
                ]
            ];

            if (isset($service['deliveryMode'])) {
                $serviceProps[] = [
                    'NAME' => 'deliveryMode',
                    'CODE' => 'deliveryMode',
                    'VALUE' => $service['deliveryMode']
                ];
            }

            if (isset($service['discount'])) {
                $serviceProps[] = [
                    'NAME' => 'discount',
                    'CODE' => 'discount',
                    'VALUE' => $service['discount']
                ];
            }

            $item->getPropertyCollection()->setProperty($serviceProps);
        }

    }

    // СТАТУС
    if (!empty($query['status'])) {
        $order->setField('STATUS_ID', $query['status']);
    }

    // Перерасчет заказа
    $order->doFinalAction(true);
    // Сохраняем заказ зново
    if (hasOrderPaymentPayload($data)) {
        $paymentResult = applyOrderPayment($order, $data);

        if (empty($paymentResult['success'])) {
            return [
                'status' => 'error',
                'message' => $paymentResult['message'] ?? 'Payment system not found',
                'payment' => $paymentResult['payment'] ?? null,
            ];
        }
    }

    $result = $order->save();

    if (!$result->isSuccess()) {

        return [
            'status' => 'error',
            'errors' => $result->getErrorMessages()
        ];
    }

    return [
        'status' => 'success',
        'order_id' => $orderId,
        // 'debug' => print_r($basket->getBasketItems())
    ];

}



// ОБНОВЛЕНИЕ КОДА (ID) ЗАКАЗА [order_id, order_code]
function updateOrderPayment($query)
{
    global $USER;
    if (!$USER->IsAuthorized()) {
        http_response_code(401);
        return ['error' => 'Unauthorized'];
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $data = is_array($data) ? $data : [];
    $query = array_merge(is_array($query) ? $query : [], $data);

    $orderId = (int)($query["order_id"] ?? $query["orderId"] ?? 0);

    if ($orderId <= 0) {
        http_response_code(400);
        return [
            'status' => 'error',
            'message' => 'Invalid order ID'
        ];
    }

    $orderR = CSaleOrder::GetByID($orderId);
    if (!$orderR || (int)$orderR['RESPONSIBLE_ID'] != $USER->GetID()) {
        http_response_code(404);
        return ['error' => 'Order not found or access denied'];
    }

    $order = Order::load($orderId);

    if (!$order) {
        http_response_code(404);
        return [
            'status' => 'error',
            'message' => 'Order not found'
        ];
    }

    $order->doFinalAction(true);
    $paymentResult = applyOrderPayment($order, $query);

    if (empty($paymentResult['success'])) {
        http_response_code(400);
        return [
            'status' => 'error',
            'message' => $paymentResult['message'] ?? 'Payment system not found',
            'payment' => $paymentResult['payment'] ?? null,
        ];
    }

    $result = $order->save();

    if (!$result->isSuccess()) {
        http_response_code(400);
        return [
            'status' => 'error',
            'errors' => $result->getErrorMessages()
        ];
    }

    return [
        'status' => 'success',
        'order_id' => $orderId,
        'payment' => $paymentResult['payment'],
        'pay_system_id' => $paymentResult['pay_system_id'],
        'pay_system_name' => $paymentResult['pay_system_name'],
    ];
}

function updateOrderCode($query)
{
    // Защита
    // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    //     return ['error' => 'Only POST'];
    // }

    global $USER;
    if (!$USER->IsAuthorized()) {
        return ['error' => 'Unauthorized'];
    }

    $siteId = SITE_ID;
    $data = json_decode(file_get_contents('php://input'), true);
    $data = is_array($data) ? $data : [];
    $query = array_merge(is_array($query) ? $query : [], $data);

    $orderId = (int)($query["order_id"] ?? $query["orderId"] ?? 0);
    $orderCode = (string)($query["order_code"] ?? $query["orderCode"] ?? '');

    if ($orderId <= 0 || $orderCode === '') {
        return [
            'status' => 'error',
            'message' => 'Invalid order ID or order code'
        ];
    }

    $order = Order::load($orderId);

    if (!$order) {
        return [
            'success' => false,
            'error' => 'Order not found'
        ];
    }

    $property = $order->getPropertyCollection()->getItemByOrderPropertyCode('ORDER_CODE');

    if (!$property) {
        return [
            'success' => false,
            'error' => 'Property ORDER_CODE not found'
        ];
    }

    $property->setValue($orderCode);

    $result = $order->save();

    if (!$result->isSuccess()) {
        return [
            'success' => false,
            'errors' => $result->getErrorMessages()
        ];
    }

    return [
        'success' => true,
        'order_id' => $orderId,
        'order_code' => $orderCode
    ];
}
