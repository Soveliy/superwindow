<?
use Bitrix\Main\Loader;
use Bitrix\Main\Data\Cache;
use Bitrix\Sale;
use Bitrix\Sale\Fuser;
use Bitrix\Sale\Order;
use Bitrix\Sale\Payment;

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
            'order_props' => $arOrderProps
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

    // Подтверждаем что заказ принадлежит текущему дилеру
    $order = CSaleOrder::GetByID($orderId);
    if (!$order || (int)$order['RESPONSIBLE_ID'] != $USER->GetID()) {
        return ['error' => 'Order not found or access denied'];
    }

    $orderId = (int)$query["order_id"];

    if ($orderId <= 0) {
        return [
            'status' => 'error',
            'message' => 'Invalid order ID'
        ];
    }

    $order = Order::load($orderId);

    if (!$order) {
        return [
            'status' => 'error',
            'message' => 'Order not found'
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
// function createOrder($query) {

//     // НАДО СОЗДАВАТЬ ПОЛЬЗОВАТЕЛЯ КАК ПОКУПАТЕЛЯ ЧТОБЫ ОН ТОЖЕ МОГ АВТОРИЗОВАТЬСЯ И СМОТРЕТЬ СВОИ ЗАКАЗЫ!!!!!

//     // Защита
//     // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
//     //     return ['error' => 'Only POST'];
//     // }

//     $raw = file_get_contents('php://input');
//     $data = json_decode($raw, true);

//     global $USER;
//     $siteId = SITE_ID;
//     $userId = 2; // системный пользователь 
//     $responseId = Fuser::getId(); // Получаем ID текущего пользователя КАК ОТВЕТСТВЕННОГО

//     // Загружаем корзину
//     $basket = Sale\Basket::loadItemsForFUser($responseId, $siteId);
//     if ($basket->isEmpty()) {
//         return ['error' => 'Корзина пустая'];
//     }

//     // Создаем заказ
//     $order = \Bitrix\Sale\Order::create($siteId, $userId);
//     $order->setPersonTypeId(1);

//     // Устанавливаем корзину
//     $order->setBasket($basket);

//     $order->setField('USER_DESCRIPTION', $data['values']['comment']);

//     // Ответственный
//     $order->setField('RESPONSIBLE_ID', $USER->GetID());

        
//     // СВОЙСТВА ЗАКАЗА
//     $propertyCollection = $order->getPropertyCollection();
//     $propsMap = [
//         'ORDER_CODE' => $data['order']['code'],
//         'ORDER_ID' => $data['orderId'],

//         'FIO' => $data['values']['customer']['fullName'],
//         'PHONE' => $data['values']['customer']['phone'],
//         'ADDRESS' => $data['values']['customer']['address'],

//         'MEASUREMENT_DATE' => $data['values']['customer']['measurementDate'],
//         'PRODUCTION_DATE' => $data['values']['customer']['productionDate'],
//         'INSTALLATION_DATE' => $data['values']['customer']['installationDate'],
//     ];

//     foreach ($propertyCollection as $property) {
//         $code = $property->getField('CODE');

//         if (isset($propsMap[$code])) {
//             $property->setValue($propsMap[$code]);
//         }
//     }

//     // Доставка
//     $shipmentCollection = $order->getShipmentCollection();
//     foreach ($shipmentCollection as $shipment) {
//         if (!$shipment->isSystem()) {
//             $shipment->setFields(['DELIVERY_ID' => 3,]);
//         }
//     }

//     // Оплата
//     $paymentCollection = $order->getPaymentCollection();
//     $payment = $paymentCollection->createItem();

//     $payment->setFields([
//         'PAY_SYSTEM_ID' => 2,
//         'SUM' => $order->getPrice(),
//         'CURRENCY' => $order->getCurrency()
//     ]);

//     // Финализируем заказ
//     $order->doFinalAction(true);

//     $result = $order->save();

//     if ($result->isSuccess()) {
//         return ['success' => true, 'ORDER_ID' => $order->getId()];
//     } else {
//         return ['error' => $result->getErrors()];
//     }
// }
function createOrder($query)
{
    global $USER;
    $siteId = SITE_ID;

    $data = json_decode(file_get_contents('php://input'), true);

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
    $order->setPersonTypeId(1);

    // корзина
    $order->setBasket($basket);

    // описание
    $order->setField('USER_DESCRIPTION', $data['values']['comment'] ?? '');

    // ответственный (дилер)
    $order->setField('RESPONSIBLE_ID', $USER->GetID());

    // свойства заказа
    $propertyCollection = $order->getPropertyCollection();

    $map = [
        'FIO' => $data['values']['customer']['fullName'],
        'PHONE' => $data['values']['customer']['phone'],
        'ADDRESS' => $data['values']['customer']['address'],
        'ORDER_CODE' => $data['order']['code'] ?? null,
        'ORDER_ID' => $data['orderId'] ?? null,
        'MEASUREMENT_DATE' => $data['values']['customer']['measurementDate'],
        'PRODUCTION_DATE' => $data['values']['customer']['productionDate'],
        'INSTALLATION_DATE' => $data['values']['customer']['installationDate'],
    ];

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
    $paymentCollection = $order->getPaymentCollection();
    $payment = $paymentCollection->createItem();

    $payment->setField('PAY_SYSTEM_ID', 2);
    $payment->setField('SUM', $order->getPrice());
    $payment->setField('CURRENCY', $order->getCurrency());

    // финализация
    $order->doFinalAction(true);
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

    $orderId = (int)$query["order_id"];

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
                    if ($k !== 'positionId') {
                        $currentProps[$k] = $v;
                    }
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

    // Перерасчет заказа
    $order->doFinalAction(true);
    // Сохраняем заказ зново
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
