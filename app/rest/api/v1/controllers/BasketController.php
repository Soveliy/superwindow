<?
use Bitrix\Main\Loader;
use Bitrix\Main\Data\Cache;
use Bitrix\Sale;
use Bitrix\Catalog\ProductTable;

function readRequestJsonBody()
{
    static $body = null;
    static $isLoaded = false;

    if (!$isLoaded) {
        $decoded = json_decode(file_get_contents('php://input'), true);
        $body = is_array($decoded) ? $decoded : [];
        $isLoaded = true;
    }

    return $body;
}

function getNestedArrayValue($source, array $path, $default = null)
{
    $current = $source;

    foreach ($path as $key) {
        if (!is_array($current) || !array_key_exists($key, $current)) {
            return $default;
        }

        $current = $current[$key];
    }

    return $current;
}

function getBasketItemPropertyValue($item, $code)
{
    foreach ($item->getPropertyCollection() as $prop) {
        if ($prop->getField('CODE') === $code) {
            return $prop->getField('VALUE');
        }
    }

    return null;
}

// ПОЛУЧИТЬ КОРЗИНУ ПОЛЬЗОВАТЕЛЯ []
function getBasket()
{
    // Защита
    // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    //     return ['error' => 'Only POST'];
    // }

    if (!\Bitrix\Main\Loader::includeModule('sale')) {
        return ['error' => 'Module sale not installed'];
    }

    global $USER;

    // Получаем идентификатор пользователя корзины (для гостей = FUSER_ID)
    $fuserId = CSaleBasket::GetBasketUserID();

    $arBasket = [];
    $dbBasket = CSaleBasket::GetList(
        ["NAME" => "ASC"],
        ["FUSER_ID" => $fuserId, "ORDER_ID" => "NULL", "LID" => SITE_ID],
        false,
        false,
        ["*"]
    );


    $basket = \Bitrix\Sale\Basket::loadItemsForFUser(
        \Bitrix\Sale\Fuser::getId(),
        SITE_ID
    );

    $props = [];
    foreach ($basket as $item) {
        $props = $item->getPropertyCollection()->getPropertyValues();

        $arBasket[] = [
            'basket_id' => $item->getId(),
            'product_id' => $item->getProductId(),
            'name' => $item->getField('NAME'),
            'price' => $item->getPrice(),
            // 'base_price' => $item->getBasePrice(),
            'quantity' => $item->getQuantity(),
            'xml_id' => $item->getField('XML_ID'),
            'lid' => $item->getField('LID'),
            'can_buy' => $item->canBuy(),
            'props' => $props
        ];
    }


    // while ($item = $dbBasket->Fetch()) {
    //     $arBasket[] = [
    //         'product_id' => (int)$item['PRODUCT_ID'],
    //         'xml' => $item['XML_ID'],
    //         'name' => $item['NAME'],
    //         'quantity' => (float)$item['QUANTITY'],
    //         'price' => (float)$item['PRICE'],
    //         'currency' => $item['CURRENCY'],
    //         'base_price' => (float)$item['BASE_PRICE'],
    //         'delay' => $item['DELAY'],
    //         'can_buy' => $item['CAN_BUY'],
    //         'price_type_id' => $item['PRICE_TYPE_ID'],
    //         'reserved' => $item['RESERVED'],
    //         'wight' => $item['WEIGHT'],
    //         'url' => $item['DETAIL_PAGE_URL'],
    //         'props' => $arProps
    //     ];
    // }

    return [
        'count' => count($arBasket),
        'items' => $arBasket
    ];
}

// ДОБАВЛЕНИЕ КАСТОМНОГО ТОВАРА В КОРЗИНУ [массив из калькулятора]
/*function addBasketProduct($query)
{
    Loader::includeModule('sale');
    Loader::includeModule('catalog');

    $productId = 3463; // тех. товар
    $price = (float)($query['price'] ?? 0);
    $name = $query['name'] ?? 'Товар';
    $serviceType = (string)(
        getNestedArrayValue($data, ['values', 'serviceType']) ??
        getNestedArrayValue($data, ['props', 'serviceType']) ??
        ''
    );
    $quantity = (int)($query['quantity'] ?? 1);

    if ($productId <= 0 || !in_array($serviceType, ['installation', 'delivery'], true) || $price < 0) {
        http_response_code(400);
        return [
            'success' => false,
            'message' => 'Ошибка данных'
        ];
    }

    $siteId = SITE_ID;
    $fUserId = Sale\Fuser::getId();
    $basket = Sale\Basket::loadItemsForFUser($fUserId, $siteId);

    $item = $basket->createItem('catalog', $productId);

    $item->setFields([
        'QUANTITY' => $quantity,
        'CURRENCY' => 'RUB',
        'LID' => $siteId,
        'PRICE' => $price,
        'BASE_PRICE' => $price,
        'CUSTOM_PRICE' => 'Y',
        'NAME' => $name,
        'PRODUCT_PROVIDER_CLASS' => '', // важно
    ]);

    
    // =========================
    // ПАРСИНГ СВОЙСТВ prop_N
    // =========================

    $properties = [];
    $properties[] = ['NAME' => 'serviceType', 'CODE' => 'serviceType', 'VALUE' => $serviceType];

    foreach ($query as $key => $value) {

        if (!preg_match('/^prop_(\d+)$/', $key, $m)) {
            continue;
        }

        if (empty($value)) {
            continue;
        }

        $decoded = json_decode($value, true);

        if (!is_array($decoded)) {
            continue; // невалидный JSON
        }

        $propName = trim($decoded['name'] ?? '');
        $propValue = $decoded['value'] ?? null;

        if ($propName === '' || $propValue === null || $propValue === '') {
            continue; // пустые значения игнорируем
        }

        // защита от мусора / длины
        if (mb_strlen($propName) > 255) {
            $propName = mb_substr($propName, 0, 255);
        }

        if (is_array($propValue) || is_object($propValue)) {
            $propValue = json_encode($propValue, JSON_UNESCAPED_UNICODE);
        }

        $properties[] = [
            'NAME'  => $propName,
            'CODE'  => 'PROP_' . $m[1],
            'VALUE' => $propValue
        ];
    }

    // применяем свойства только если есть
    if (!empty($properties)) {
        $item->getPropertyCollection()->setProperty($properties);
    }


    $basket->save();

    return [
        'success' => true,
        'message' => 'Добавлен'
    ];
}
*/
function addBasketProduct($query)
{
    Loader::includeModule('sale');
    Loader::includeModule('catalog');

    $data = readRequestJsonBody();
    $raw = json_encode($data, JSON_UNESCAPED_UNICODE);
    // лог для проверки
    file_put_contents(__DIR__."/log_add_product.txt", print_r([
        'GET' => $query,
        'JSON' => $data
    ], 1));

    $productId = 3463; // тех. товар
    $price = (float)($data['totalPrice'] ?? 0);
    $name = $data['labels']['openingTypeLabel'].
        " ".$data['labels']['profileLabel'].
        " ".$data['labels']['packageLabel'] 
        ?? 'Товар';
    $quantity = (int)($query['quantity'] ?? 1);
    
    if ($productId <= 0 || $price <= 0) {
        http_response_code(400);
        return [
            'success' => false,
            'message' => 'Ошибка данных'
        ];
    }

    $siteId = SITE_ID;
    $fUserId = Sale\Fuser::getId();
    $basket = Sale\Basket::loadItemsForFUser($fUserId, $siteId);

    // проверка и поиск товара в корзине для обновления
    $hash = md5($data['positionId'] . $fUserId); // статичные данные Для определения товара - номер позиции и id FUser
    $existingItem = null;
    foreach ($basket as $item) {
        if ($item->getField('XML_ID') === $hash) {
            $existingItem = $item;
            break;
        }
    }


    // Свойства
    $properties = [];

    $properties[] = ['NAME'  => 'Позиция', 'CODE'  => 'positionId', 'VALUE' => $data['positionId']];
    $properties[] = ['NAME'  => 'Размеры', 'CODE'  => 'dimensions', 'VALUE' => $data['dimensions']['label']];
    $properties[] = ['NAME'  => 'Типовая схема', 'CODE'  => 'openingTypeLabel', 'VALUE' => $data['labels']['openingTypeLabel']];
    $properties[] = ['NAME'  => 'Профильная система', 'CODE'  => 'profileLabel', 'VALUE' => $data['labels']['profileLabel']];
    $properties[] = ['NAME'  => 'Цвет уплотнителя', 'CODE'  => 'sealColorLabel', 'VALUE' => $data['labels']['sealColorLabel']];
    $properties[] = ['NAME'  => 'Дренажное отверстие', 'CODE'  => 'drainageLabel', 'VALUE' => $data['labels']['drainageLabel']];
    $properties[] = ['NAME'  => 'Сторона ламинации', 'CODE'  => 'windowColorSideLabel', 'VALUE' => $data['labels']['windowColorSideLabel']];
    $properties[] = ['NAME'  => 'Цвет окна', 'CODE'  => 'windowColorLabel', 'VALUE' => $data['labels']['windowColorLabel']];
    $properties[] = ['NAME'  => 'Тип ручки', 'CODE'  => 'handleTypeLabel', 'VALUE' => $data['labels']['handleTypeLabel']]; 
    $properties[] = ['NAME'  => 'Цвет ручки', 'CODE'  => 'handleColorLabel', 'VALUE' => $data['labels']['handleColorLabel']];

    if (!empty($data['labels']['mullionOffsetsLabel'])) {
        foreach ($data['labels']['mullionOffsetsLabel'] as $index => $offsetLabel) {
            $properties[] = ['NAME'  => 'Импост '.($index + 1), 'CODE'  => 'mullionOffset_'.($index + 1), 'VALUE' => $offsetLabel];
        }
    }

    if (!empty($data['labels']['additionalOptions'])) {

        foreach ($data['labels']['additionalOptions'] as $index => $option) {

            $text = $option['typeLabel'];
            if (!empty($option['length'])) {
                $text .= " {$option['length']} мм";
            }
            if (!empty($option['width'])) {
                $text .= " x {$option['width']} мм";
            }
            if (!empty($option['sillColorLabel'])) {
                $text .= " ({$option['sillColorLabel']})";
            }
            $properties[] = [
                'NAME'  => 'Доп. опция '.($index + 1),
                'CODE'  => 'additionalOption_'.($index + 1),
                'VALUE' => $text
            ];
        }

    }
    
    // Оригинальные значения
    $properties[] = ['NAME'  => 'Типовая схема (code)', 'CODE'  => 'openingType', 'VALUE' => $data['values']['openingType']];
    $properties[] = ['NAME'  => 'Профильная система (code)', 'CODE'  => 'profileId', 'VALUE' => $data['values']['profileId']];
    $properties[] = ['NAME'  => 'Цвет уплотнителя (code)', 'CODE'  => 'sealColor', 'VALUE' => $data['values']['sealColor']];
    $properties[] = ['NAME'  => 'Дренажное отверстие (code)', 'CODE'  => 'drainage', 'VALUE' => $data['values']['drainage']];
    $properties[] = ['NAME'  => 'Сторона ламинации (code)', 'CODE'  => 'windowColorSide', 'VALUE' => $data['values']['windowColorSide']];
    $properties[] = ['NAME'  => 'Цвет окна (code)', 'CODE'  => 'windowColor', 'VALUE' => $data['values']['windowColor']];
    $properties[] = ['NAME'  => 'Тип ручки (code)', 'CODE'  => 'handleType', 'VALUE' => $data['values']['handleType']]; 
    $properties[] = ['NAME'  => 'Цвет ручки (code)', 'CODE'  => 'handleColor', 'VALUE' => $data['values']['handleColor']];

    if (!empty($data['values']['additionalOptions'])) {

        foreach ($data['values']['additionalOptions'] as $index => $option) {
            $properties[] = [
                'NAME'  => 'Доп. опция '.($index + 1),
                'CODE'  => 'additionalOption_'.($index + 1)." (code)",
                'VALUE' => json_encode($option, JSON_UNESCAPED_UNICODE)
            ];
        }

    }


    // Если товар есть в корзине - обновляем
    if ($existingItem) {

        $existingItem->setFields([
            'PRICE' => $price,
            'NAME' => $name,
            'QUANTITY' => $quantity,
            'CUSTOM_PRICE' => 'Y'
        ]);

        $props = $existingItem->getPropertyCollection();
        $props->setProperty($properties);

    } else { // Или добавляем новый

        $item = $basket->createItem('catalog', $productId);

        $item->setFields([
            'QUANTITY' => $quantity,
            'CURRENCY' => 'RUB',
            'LID' => $siteId,
            'PRICE' => $price,
            'CUSTOM_PRICE' => 'Y',
            'NAME' => $name,
            'XML_ID' => $hash
        ]);

        // применяем свойства только если есть
        if (!empty($properties)) {
            $item->getPropertyCollection()->setProperty($properties);
        }
    }

    $basket->save();

    return [
        'success' => true,
        'message' => 'Добавлен'
    ];

}

// ДОБАВЛЕНИЕ УСЛУГИ В КОРЗИНУ []
function addBasketService($query)
{
    Loader::includeModule('sale');
    Loader::includeModule('catalog');

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    // лог для проверки
    file_put_contents(__DIR__."/log_add_service.txt", print_r([
        'GET' => $query,
        'RAW' => $raw,
        'JSON' => $data
    ], 1));

    $productId = 3463; // тех. товар
    $price = (float)(
        getNestedArrayValue($data, ['pricing', 'finalPrice']) ??
        getNestedArrayValue($data, ['values', 'price']) ??
        getNestedArrayValue($data, ['values', 'finalPrice']) ??
        getNestedArrayValue($data, ['pricing', 'basePricePerSquare']) ??
        0
    );
    $name = $data['serviceTypeLabel'] ?? 'Услуга';
    $serviceType = (string)(
        getNestedArrayValue($data, ['values', 'serviceType']) ??
        getNestedArrayValue($data, ['props', 'serviceType']) ??
        ''
    );
    $quantity = (int)($query['quantity'] ?? 1);
    
    if ($productId <= 0 || !in_array($serviceType, ['installation', 'delivery'], true) || $price < 0) {
        http_response_code(400);
        return [
            'success' => false,
            'message' => 'Ошибка данных'
        ];
    }

    $siteId = SITE_ID;
    $fUserId = Sale\Fuser::getId();
    $basket = Sale\Basket::loadItemsForFUser($fUserId, $siteId);

    // проверка и поиск товара в корзине для обновления
    $hash = md5($data['positionId'] . $fUserId); // статичные данные Для определения товара - номер позиции и id FUser
    $hash = md5('service|' . $serviceType . '|' . (string)($data['orderId'] ?? '') . '|' . $fUserId);
    $existingItem = null;
    foreach ($basket as $item) {
        if ($item->getField('XML_ID') === $hash) {
            $existingItem = $item;
            break;
        }
    }

    // Свойства
    $properties = [];
    $properties[] = ['NAME' => 'serviceType', 'CODE' => 'serviceType', 'VALUE' => $serviceType];

    $properties[] = ['NAME' => 'Тип', 'CODE' => 'type', 'VALUE' => "service"];
    $properties[] = ['NAME' => 'Позиция', 'CODE' => 'positionId', 'VALUE' => $data['positionId']];
    $properties[] = ['NAME' => 'Цена услуги', 'CODE' => 'amountLabel', 'VALUE' => $data['values']['price']];
    $properties[] = ['NAME' => 'Код заказа', 'CODE' => 'code', 'VALUE' => $data['order']['code']];

    // Оригинальные значения
    // $properties[] = ['NAME' => 'Цена (code)', 'CODE' => 'orderAmount', 'VALUE' => !empty($data['values']['amount']) ?: $data['values']['orderAmount']];
    if (!empty($data['values']['deliveryMode']))
        $properties[] = ['NAME' => 'Способ доставки (code)', 'CODE' => 'deliveryMode', 'VALUE' => $data['values']['deliveryMode']];
    $properties[] = ['NAME' => 'Данные доставки (code)', 'CODE' => 'rawService', 'VALUE' => json_encode($data['values']['rawService'], JSON_UNESCAPED_UNICODE)];

    // Если товар есть в корзине - обновляем
    if ($existingItem) {

        $existingItem->setFields([
            'PRICE' => $price,
            'NAME' => $name,
            'QUANTITY' => $quantity,
            'CUSTOM_PRICE' => 'Y'
        ]);

        $props = $existingItem->getPropertyCollection();
        $props->setProperty($properties);

    } else { // Или добавляем новый

        $item = $basket->createItem('catalog', $productId);

        $item->setFields([
            'QUANTITY' => $quantity,
            'CURRENCY' => 'RUB',
            'LID' => $siteId,
            'PRICE' => $price,
            // 'BASE_PRICE' => $price,
            'CUSTOM_PRICE' => 'Y',
            'NAME' => $name,
            'XML_ID' => $hash
        ]);

        // применяем свойства только если есть
        if (!empty($properties)) {
            $item->getPropertyCollection()->setProperty($properties);
        }
    }

    $basket->save();

    return [
        'success' => true,
        'message' => 'Добавлен'
    ];

} 

// ОЧИСТИТЬ КОРЗИНУ
function clearBasket()
{
    Loader::includeModule('sale');

    $siteId = SITE_ID;
    $fUserId = \Bitrix\Sale\Fuser::getId();
    $basket = \Bitrix\Sale\Basket::loadItemsForFUser($fUserId, $siteId);

    foreach ($basket as $item) {
        $item->delete();
    }

    $basket->save();

    return [
        'success' => true,
        'message' => 'Корзина очищена'
    ];
}

// УДАЛЕНИЕ ТОВАРА ИЗ КОРЗИНЫ []
function removeBasketProduct($query)
{
    Loader::includeModule('sale');

    $data = readRequestJsonBody();
    $productId = (int)($query['product_id'] ?? getNestedArrayValue($data, ['product_id']) ?? getNestedArrayValue($data, ['productId']) ?? 0);
    $positionId = (string)(getNestedArrayValue($data, ['position_id']) ?? getNestedArrayValue($data, ['positionId']) ?? '');
    $serviceType = (string)(getNestedArrayValue($data, ['service_type']) ?? getNestedArrayValue($data, ['serviceType']) ?? '');

    if ($productId <= 0 && $positionId === '' && $serviceType === '') {
        return [
            'success' => false,
            'message' => 'Неверный ID товара'
        ];
    }

    $siteId = SITE_ID;
    $fUserId = Sale\Fuser::getId();
    $basket = Sale\Basket::loadItemsForFUser($fUserId, $siteId);
    $item = null;

    if ($productId > 0) {
        $item = $basket->getExistsItem('catalog', $productId);
    }

    if (!$item && $positionId !== '') {
        foreach ($basket as $candidate) {
            if (getBasketItemPropertyValue($candidate, 'type') === 'service') {
                continue;
            }

            if ((string)getBasketItemPropertyValue($candidate, 'positionId') === $positionId) {
                $item = $candidate;
                break;
            }
        }
    }

    if (!$item && $serviceType !== '') {
        foreach ($basket as $candidate) {
            if (getBasketItemPropertyValue($candidate, 'type') !== 'service') {
                continue;
            }

            $candidateServiceType = (string)(getBasketItemPropertyValue($candidate, 'serviceType') ?? '');

            if ($candidateServiceType === '') {
                $rawService = getBasketItemPropertyValue($candidate, 'rawService');
                $decodedService = json_decode((string)$rawService, true);
                if (is_array($decodedService)) {
                    $candidateServiceType = (string)($decodedService['type'] ?? '');
                }
            }

            if ($candidateServiceType === $serviceType) {
                $item = $candidate;
                break;
            }
        }
    }

    if (!$item) {
        return [
            'success' => false,
            'message' => 'Товар отсутствует в корзине'
        ];
    }

    $item->delete();
    $basket->save();

    return [
        'success' => true,
        'message' => 'Товар удален из корзины'
    ];
}
