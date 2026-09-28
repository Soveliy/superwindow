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

function getOrderIdFromRequest($query, $data)
{
    return (int)(
        ($query['order_id'] ?? null) ??
        ($query['orderId'] ?? null) ??
        getNestedArrayValue($data, ['order_id']) ??
        getNestedArrayValue($data, ['orderId']) ??
        getNestedArrayValue($data, ['values', 'order_id']) ??
        getNestedArrayValue($data, ['values', 'orderId']) ??
        0
    );
}

function isOrderLockedForEditing($orderId)
{
    $orderId = (int)$orderId;

    if ($orderId <= 0 || !Loader::includeModule('sale')) {
        return false;
    }

    $order = Sale\Order::load($orderId);

    if (!$order) {
        return false;
    }

    $orderCodeProperty = $order->getPropertyCollection()->getItemByOrderPropertyCode('ORDER_CODE');

    return $orderCodeProperty && trim((string)$orderCodeProperty->getValue()) !== '';
}

function getOrderEditingLockedResponse()
{
    http_response_code(409);

    return [
        'success' => false,
        'status' => 'error',
        'message' => 'КП уже сформировано. Изменение заказа запрещено.',
    ];
}

// ПОЛУЧИТЬ КОРЗИНУ ПОЛЬЗОВАТЕЛЯ []
function getInvitecraftApiKey()
{
    $apiKey = getenv('INVITECRAFT_API_KEY');

    if (!empty($apiKey)) {
        return $apiKey;
    }

    return '1e72be3b888edebb9a761b45a574e76aed2839a723f0c4a5fc461d1951979b25';
}

function normalizeInvitecraftPriceValue($value)
{
    if (is_string($value)) {
        $value = str_replace([' ', ','], ['', '.'], $value);
    }

    if (!is_numeric($value)) {
        return null;
    }

    $price = (float)$value;

    return $price > 0 ? $price : null;
}

function getInvitecraftAmountFromResponse($response)
{
    if (!is_array($response)) {
        return null;
    }

    foreach (['amount', 'price', 'total', 'total_price', 'totalPrice', 'sum'] as $key) {
        if (!array_key_exists($key, $response)) {
            continue;
        }

        $price = normalizeInvitecraftPriceValue($response[$key]);

        if ($price !== null) {
            return $price;
        }
    }

    foreach (['data', 'result', 'invoice'] as $key) {
        if (!isset($response[$key]) || !is_array($response[$key])) {
            continue;
        }

        $price = getInvitecraftAmountFromResponse($response[$key]);

        if ($price !== null) {
            return $price;
        }
    }

    return null;
}

function normalizeInvitecraftProduct($product, $fallbackId = 1)
{
    if (!is_array($product)) {
        return null;
    }

    $typeId = (int)($product['type_id'] ?? $product['typeId'] ?? 0);
    $width = (int)($product['width'] ?? 0);
    $height = (int)($product['height'] ?? 0);

    if ($typeId <= 0 || $width <= 0 || $height <= 0) {
        return null;
    }

    $normalized = $product;
    $normalized['id'] = (int)($normalized['id'] ?? $fallbackId);

    if ($normalized['id'] <= 0) {
        $normalized['id'] = $fallbackId;
    }

    $normalized['type_id'] = $typeId;
    $normalized['width'] = $width;
    $normalized['height'] = $height;

    if (isset($normalized['mullionOffset']) && !isset($normalized['mullions'])) {
        $normalized['mullions'] = $normalized['mullionOffset'];
    }

    return $normalized;
}

function getInvitecraftProductFromRequestData($data)
{
    if (!is_array($data)) {
        return null;
    }

    foreach (['productionQuery', 'production_query', 'query'] as $key) {
        if (!array_key_exists($key, $data)) {
            continue;
        }

        $value = $data[$key];

        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_array($decoded) ? $decoded : null;
        }

        if (is_array($value)) {
            return $value;
        }
    }

    if (isset($data['values']) && is_array($data['values'])) {
        $product = getInvitecraftProductFromRequestData($data['values']);

        if ($product !== null) {
            return $product;
        }
    }

    if (isset($data['type_id']) || isset($data['typeId'])) {
        return $data;
    }

    return null;
}

function requestInvitecraftInvoice($product, $customerName = 'Test')
{
    $normalizedProduct = normalizeInvitecraftProduct($product);

    if ($normalizedProduct === null) {
        return [
            'success' => false,
            'httpCode' => 400,
            'message' => 'Invalid InviteCraft product data',
        ];
    }

    if (!function_exists('curl_init')) {
        return [
            'success' => false,
            'httpCode' => 500,
            'message' => 'PHP cURL extension is not available',
        ];
    }

    $apiKey = getInvitecraftApiKey();

    if (empty($apiKey)) {
        return [
            'success' => false,
            'httpCode' => 500,
            'message' => 'InviteCraft API key is not configured',
        ];
    }

    $payload = [
        'command' => 'invoice',
        'customer_name' => $customerName ?: 'Test',
        'products' => [$normalizedProduct],
    ];

    $headers = [
        'Content-Type: application/json',
        'X-API-Key: ' . $apiKey,
    ];

    $ch = curl_init('https://api.invitecraft.ru/');

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
    ]);

    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

    curl_close($ch);

    if ($response === false) {
        return [
            'success' => false,
            'httpCode' => 502,
            'message' => 'InviteCraft connection error',
            'error' => $curlError,
            'request' => $payload,
        ];
    }

    $decoded = json_decode($response, true);

    if (!is_array($decoded)) {
        return [
            'success' => false,
            'httpCode' => 502,
            'message' => 'InviteCraft returned invalid JSON',
            'response' => $response,
            'request' => $payload,
        ];
    }

    if ($httpCode >= 400) {
        return [
            'success' => false,
            'httpCode' => $httpCode,
            'message' => 'InviteCraft HTTP error',
            'response' => $decoded,
            'request' => $payload,
        ];
    }

    $amount = getInvitecraftAmountFromResponse($decoded);

    if ($amount === null) {
        return [
            'success' => false,
            'httpCode' => 502,
            'message' => 'InviteCraft response does not contain amount',
            'response' => $decoded,
            'request' => $payload,
        ];
    }

    return [
        'success' => true,
        'price' => $amount,
        'amount' => $amount,
        'invoiceNo' => $decoded['invoice_no'] ?? $decoded['invoiceNo'] ?? null,
        'customerId' => $decoded['customer_id'] ?? $decoded['customerId'] ?? null,
        'response' => $decoded,
        'request' => $payload,
        'httpCode' => $httpCode ?: 200,
    ];
}

function normalizeInvitecraftAccessories($accessories)
{
    if (!is_array($accessories) || empty($accessories)) {
        return [];
    }

    $isList = array_keys($accessories) === range(0, count($accessories) - 1);

    $normalizedAccessories = $isList ? $accessories : [$accessories];

    foreach ($normalizedAccessories as &$accessory) {
        if (!is_array($accessory)) {
            continue;
        }

        foreach (['length', 'width'] as $sizeKey) {
            if (!array_key_exists($sizeKey, $accessory)) {
                continue;
            }

            if (is_int($accessory[$sizeKey]) || is_float($accessory[$sizeKey])) {
                $accessory[$sizeKey] = (string)$accessory[$sizeKey];
            }

            if (is_string($accessory[$sizeKey])) {
                $accessory[$sizeKey] = str_replace('.', ',', trim($accessory[$sizeKey]));
            }
        }
    }
    unset($accessory);

    return $normalizedAccessories;
}

function buildInvitecraftCalculationPayload($product)
{
    $normalizedProduct = normalizeInvitecraftProduct($product);

    if ($normalizedProduct === null) {
        return null;
    }

    $payload = [
        'command' => 'calculation',
        'type_id' => $normalizedProduct['type_id'],
        'width' => $normalizedProduct['width'],
        'height' => $normalizedProduct['height'],
    ];

    if (!empty($normalizedProduct['system_id'])) {
        $payload['system_id'] = $normalizedProduct['system_id'];
    }

    if (!empty($normalizedProduct['color'])) {
        $payload['color'] = $normalizedProduct['color'];
    }

    if (isset($normalizedProduct['discount']) && $normalizedProduct['discount'] !== '') {
        $payload['discount'] = $normalizedProduct['discount'];
    }

    if (!empty($normalizedProduct['mullions'])) {
        $payload['mullions'] = $normalizedProduct['mullions'];
    }

    if (!empty($normalizedProduct['parameters']) && is_array($normalizedProduct['parameters'])) {
        $parameters = [];

        if (!empty($normalizedProduct['parameters']['sealColor'])) {
            $parameters[] = ['Цвет уплотнения' => $normalizedProduct['parameters']['sealColor']];
        }

        if (!empty($normalizedProduct['parameters']['drainage'])) {
            $parameters[] = ['ДРЕНАЖ.ОТВЕРСТ. РАМА' => $normalizedProduct['parameters']['drainage']];
        }

        if (!empty($parameters)) {
            $payload['parameters'] = $parameters;
        }
    }

    if (!empty($normalizedProduct['contours']) && is_array($normalizedProduct['contours'])) {
        $payload['contours'] = $normalizedProduct['contours'];
    }

    $accessories = normalizeInvitecraftAccessories($normalizedProduct['accessories'] ?? null);

    if (!empty($accessories)) {
        $payload['accessories'] = $accessories;
    }

    return $payload;
}

function buildInvitecraftInvoiceProductPayload($product, $fallbackId = 1)
{
    $normalizedProduct = normalizeInvitecraftProduct($product, $fallbackId);
    $payload = buildInvitecraftCalculationPayload($product);

    if ($normalizedProduct === null || $payload === null) {
        return null;
    }

    unset($payload['command']);

    $payload = array_merge(['id' => $normalizedProduct['id']], $payload);

    if (isset($normalizedProduct['discount']) && $normalizedProduct['discount'] !== '') {
        $payload['discount'] = $normalizedProduct['discount'];
    }

    return $payload;
}

function normalizeInvitecraftWorks($works)
{
    if (!is_array($works) || empty($works)) {
        return [];
    }

    $isList = array_keys($works) === range(0, count($works) - 1);
    $workItems = $isList ? $works : [$works];
    $normalizedWorks = [];

    foreach ($workItems as $index => $work) {
        if (!is_array($work)) {
            continue;
        }

        $name = trim((string)($work['name'] ?? $work['title'] ?? ''));
        $quantity = (float)($work['quantity'] ?? 1);
        $price = (float)($work['price'] ?? $work['amount'] ?? 0);

        if ($name === '') {
            $name = 'Работа ' . ($index + 1);
        }

        $normalizedWorks[] = [
            'name' => $name,
            'quantity' => $quantity > 0 ? $quantity : 1,
            'price' => max(0, $price),
        ];
    }

    return $normalizedWorks;
}

function buildInvitecraftInvoicePayload($query)
{
    if (!is_array($query)) {
        return null;
    }

    $products = [];
    $sourceProducts = isset($query['products']) && is_array($query['products']) ? $query['products'] : [];

    foreach ($sourceProducts as $index => $product) {
        $normalizedProduct = buildInvitecraftInvoiceProductPayload($product, $index + 1);

        if ($normalizedProduct !== null) {
            $products[] = $normalizedProduct;
        }
    }

    if (empty($products)) {
        return null;
    }

    $payload = [
        'command' => 'invoice',
        'products' => $products,
    ];

    foreach (
        [
            'customer_id' => 'customer_id',
            'customer_name' => 'customer_name',
            'customer_phone' => 'customer_phone',
            'customer_address' => 'customer_address',
        ] as $sourceKey => $payloadKey
    ) {
        if (!empty($query[$sourceKey])) {
            $payload[$payloadKey] = $query[$sourceKey];
        }
    }

    $works = normalizeInvitecraftWorks($query['works'] ?? null);

    if (!empty($works)) {
        $payload['works'] = $works;
    }

    foreach (['discount-money', 'discount_money', 'window_discount', 'global_window_discount'] as $discountMoneyKey) {
        if (!isset($query[$discountMoneyKey]) || !is_numeric($query[$discountMoneyKey])) {
            continue;
        }

        $discountMoney = (float)$query[$discountMoneyKey];

        if ($discountMoney >= 0) {
            $payload['discount-money'] = $discountMoney;
            break;
        }
    }

    return $payload;
}

function requestInvitecraftPayload($payload)
{
    if (!is_array($payload) || empty($payload)) {
        return [
            'success' => false,
            'httpCode' => 400,
            'message' => 'Invalid InviteCraft payload',
        ];
    }

    if (!function_exists('curl_init')) {
        return [
            'success' => false,
            'httpCode' => 500,
            'message' => 'PHP cURL extension is not available',
        ];
    }

    $apiKey = getInvitecraftApiKey();

    if (empty($apiKey)) {
        return [
            'success' => false,
            'httpCode' => 500,
            'message' => 'InviteCraft API key is not configured',
        ];
    }

    $headers = [
        'Content-Type: application/json',
        'X-API-Key: ' . $apiKey,
    ];

    $ch = curl_init('https://api.invitecraft.ru/');

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
    ]);

    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

    curl_close($ch);

    if ($response === false) {
        return [
            'success' => false,
            'httpCode' => 502,
            'message' => 'InviteCraft connection error',
            'error' => $curlError,
            'request' => $payload,
        ];
    }

    $decoded = json_decode($response, true);

    if (!is_array($decoded)) {
        return [
            'success' => false,
            'httpCode' => 502,
            'message' => 'InviteCraft returned invalid JSON',
            'response' => $response,
            'request' => $payload,
        ];
    }

    if ($httpCode >= 400) {
        return [
            'success' => false,
            'httpCode' => $httpCode,
            'message' => 'InviteCraft HTTP error',
            'response' => $decoded,
            'request' => $payload,
        ];
    }

    return [
        'success' => true,
        'httpCode' => $httpCode ?: 200,
        'response' => $decoded,
        'request' => $payload,
    ];
}

function requestInvitecraftCalculation($product)
{
    $payload = buildInvitecraftCalculationPayload($product);

    if ($payload === null) {
        return [
            'success' => false,
            'httpCode' => 400,
            'message' => 'Invalid InviteCraft product data',
        ];
    }

    if (!function_exists('curl_init')) {
        return [
            'success' => false,
            'httpCode' => 500,
            'message' => 'PHP cURL extension is not available',
        ];
    }

    $apiKey = getInvitecraftApiKey();

    if (empty($apiKey)) {
        return [
            'success' => false,
            'httpCode' => 500,
            'message' => 'InviteCraft API key is not configured',
        ];
    }

    $headers = [
        'Content-Type: application/json',
        'X-API-Key: ' . $apiKey,
    ];

    $ch = curl_init('https://api.invitecraft.ru/');

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
    ]);

    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

    curl_close($ch);

    if ($response === false) {
        return [
            'success' => false,
            'httpCode' => 502,
            'message' => 'InviteCraft connection error',
            'error' => $curlError,
            'request' => $payload,
        ];
    }

    $decoded = json_decode($response, true);

    if (!is_array($decoded)) {
        return [
            'success' => false,
            'httpCode' => 502,
            'message' => 'InviteCraft returned invalid JSON',
            'response' => $response,
            'request' => $payload,
        ];
    }

    if ($httpCode >= 400) {
        return [
            'success' => false,
            'httpCode' => $httpCode,
            'message' => 'InviteCraft HTTP error',
            'response' => $decoded,
            'request' => $payload,
        ];
    }

    $amount = getInvitecraftAmountFromResponse($decoded);

    if ($amount === null) {
        return [
            'success' => false,
            'httpCode' => 502,
            'message' => 'InviteCraft response does not contain price',
            'response' => $decoded,
            'request' => $payload,
        ];
    }

    return [
        'success' => true,
        'price' => $amount,
        'amount' => $amount,
        'response' => $decoded,
        'request' => $payload,
        'httpCode' => $httpCode ?: 200,
    ];
}

function calculateInvitecraftProductPrice($data)
{
    $product = getInvitecraftProductFromRequestData($data);

    if ($product === null) {
        return [
            'success' => false,
            'httpCode' => 400,
            'message' => 'productionQuery is required',
        ];
    }

    return requestInvitecraftCalculation($product);
}

function getBasketProductPrice($query)
{
    $data = readRequestJsonBody();

    if (empty($data) && is_array($query)) {
        $data = $query;
    }

    $result = calculateInvitecraftProductPrice($data);

    if (empty($result['success'])) {
        http_response_code((int)($result['httpCode'] ?? 502));
    }

    return $result;
}

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
    Loader::includeModule('iblock');
    Loader::includeModule('sale');
    Loader::includeModule('catalog');

    $data = readRequestJsonBody();

    if (isOrderLockedForEditing(getOrderIdFromRequest($query, $data))) {
        return getOrderEditingLockedResponse();
    }

    $raw = json_encode($data, JSON_UNESCAPED_UNICODE);
    $productionQuery = getInvitecraftProductFromRequestData($data);
    $invitecraftPriceResult = null;
    // лог для проверки
    file_put_contents(__DIR__."/log_add_product.txt", print_r([
        'GET' => $query,
        'JSON' => $data
    ], 1));


    // Создаем каждый раз новый элемент
    // $el = new CIBlockElement;
    // $arLoadProductArray = Array(
    //     "IBLOCK_ID"      => 156,
    //     "NAME"           => "Товар",
    //     "ACTIVE"         => "Y",
    // );
    // if(!$PRODUCT_ID = $el->Add($arLoadProductArray)) {
    //     return [
    //         'success' => false,
    //         'message' => 'Ошибка создания товара'
    //     ];
    // }


    $productId = 3463; // тех. товар
    $price = (float)($data['totalPrice'] ?? 0);
    if ($productionQuery) {
        $invitecraftPriceResult = calculateInvitecraftProductPrice($data);

        if (empty($invitecraftPriceResult['success'])) {
            http_response_code((int)($invitecraftPriceResult['httpCode'] ?? 502));

            return [
                'success' => false,
                'message' => $invitecraftPriceResult['message'] ?? 'InviteCraft API error',
                'error' => $invitecraftPriceResult['error'] ?? null,
                'response' => $invitecraftPriceResult['response'] ?? null,
            ];
        }

        $price = (float)$invitecraftPriceResult['price'];
        $data['totalPrice'] = $price;

        if (!isset($data['values']) || !is_array($data['values'])) {
            $data['values'] = [];
        }

        $data['values']['totalPrice'] = $price;
    }

    file_put_contents(__DIR__."/log_add_product.txt", print_r([
        'GET' => $query,
        'JSON' => $data,
        'PRODUCTION_QUERY' => $productionQuery,
        'INVITECRAFT_PRICE' => $invitecraftPriceResult,
    ], 1));
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

    $positionValues = isset($data['values']) && is_array($data['values']) ? $data['values'] : [];
    $positionValueProperties = [
        'serverPrice' => 'serverPrice',
        'customerPrice' => 'customerPrice',
        'dealerDiscountPercent' => 'dealerDiscountPercent',
        'dealerProfitAmount' => 'dealerProfitAmount',
        'dealerProfitCode' => 'dealerProfitCode',
        'packageType' => 'packageType',
        'mullionOrientation' => 'mullionOrientation',
    ];

    foreach ($positionValueProperties as $sourceKey => $propertyCode) {
        $value = $positionValues[$sourceKey] ?? $data[$sourceKey] ?? null;

        if ($value === null || $value === '') {
            continue;
        }

        $properties[] = [
            'NAME' => $propertyCode,
            'CODE' => $propertyCode,
            'VALUE' => (string)$value,
        ];
    }

    if (!empty($positionValues['rawPosition']) && is_array($positionValues['rawPosition'])) {
        $properties[] = [
            'NAME' => 'rawPosition',
            'CODE' => 'rawPosition',
            'VALUE' => json_encode($positionValues['rawPosition'], JSON_UNESCAPED_UNICODE),
        ];
    }

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
    if ($productionQuery) {
        $properties[] = [
            'NAME'  => 'productionQuery',
            'CODE'  => 'productionQuery',
            'VALUE' => json_encode($productionQuery, JSON_UNESCAPED_UNICODE),
        ];

        if (!empty($productionQuery['type_id'])) {
            $properties[] = [
                'NAME'  => 'productionTypeId',
                'CODE'  => 'productionTypeId',
                'VALUE' => (string)$productionQuery['type_id'],
            ];
        }
    }

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

    $response = [
        'success' => true,
        'message' => 'Добавлен',
        'price' => $price,
    ];

    if ($invitecraftPriceResult && !empty($invitecraftPriceResult['invoiceNo'])) {
        $response['invoiceNo'] = $invitecraftPriceResult['invoiceNo'];
    }

    if ($invitecraftPriceResult && !empty($invitecraftPriceResult['customerId'])) {
        $response['customerId'] = $invitecraftPriceResult['customerId'];
    }

    return $response;

}

// ДОБАВЛЕНИЕ УСЛУГИ В КОРЗИНУ []
function addBasketService($query)
{
    Loader::includeModule('sale');
    Loader::includeModule('catalog');

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    $data = is_array($data) ? $data : [];

    if (isOrderLockedForEditing(getOrderIdFromRequest($query, $data))) {
        return getOrderEditingLockedResponse();
    }
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

    if (isOrderLockedForEditing(getOrderIdFromRequest($query, $data))) {
        return getOrderEditingLockedResponse();
    }

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


// ЗАПРОС НА СЕРВЕР - РАСЧЕТ ПРОДУКТА
function getDataServer_Product($query)
{
    $isTest = true;
    if ($isTest) {
        $query = [
            'type_id' => 346, // ID типовой схемы - из картинки
            'width' => 1900, // ширина
            'height' => 1400, // высота
            'system_id' => "/_СИСТЕМЫ/1 ОКОННЫЕ СИСТЕМЫ/СИСТЕМЫ 58 мм-60 мм/ RULA 58 мм", // название системы в программе
            'color' => "Белый", // основной цвет
            'mullionOffset' => [ // импосты - зависят от выбранной схемы, если двухсвторчатая - 1 импост, трехстворчатая - 2 импоста
                ["1" => 450], // отступ от левого края
                // ["2" => 1200],
            ],
            'parameters' => [ // параметры
                'sealColor' => "Черный", // Цвет уплотнителя
                'drainage' => "СНИЗУ", // Дренажное отверстие
            ],
            'contours' => [ // контуры
                [
                    'id' => 2, // 1 = одно целое окно, 2 = окно + 1 створка, 3 = окно + 2 створки
                    'parameters' => [
                        ['ТИП РУЧКИ' => "  ОКОННАЯ"], // пример
                    ],
                ]
            ],
            'accessories' => [ // доп. опции (пока только работает почему-то без массива)
                [
                    "id" => 1,
                    "article" => "Под 200 FineBer",
                    "color" => "Белый",
                    "quantity" => "1",
                    "length" => 1.3,
                    "width" => 0.1
                ],
                [
                    "id" => 2,
                    "article" => "ОТЛ. 180 (ш-0,23)",
                    "color" => "Белый",
                    "quantity" => "1",
                    "length" => (string)1000/1000,
                    "width" => (string)100/1000
                ],

            ]
        ];
    }

    // print_r($query);

    header('Content-Type: application/json; charset=utf-8');
    $apiUrl = 'https://api.invitecraft.ru/';
    $apiKey = '1e72be3b888edebb9a761b45a574e76aed2839a723f0c4a5fc461d1951979b25';

    $data = [
        'command' => 'calculation',
        'type_id' => $query['type_id'],
        'width' => $query['width'],
        'height' => $query['height'],
        'system_id' => $query['system_id'],
        'color' => $query['color'],
        'mullions' => $query['mullionOffset'], //массив импостов
        'parameters' => [
            ['Цвет уплотнения' => $query['parameters']['sealColor']],
            ['ДРЕНАЖ.ОТВЕРСТ. РАМА' => $query['parameters']['drainage']],
        ],
        'contours' => $query['contours'],
        'accessories' => $query['accessories'],
    ];

    // print_r(json_encode($data, JSON_UNESCAPED_UNICODE));

    $headers = [
        'Content-Type: application/json',
    ];

    if (!empty($apiKey)) {
        $headers[] = 'X-API-Key: ' . $apiKey;
    }

    $ch = curl_init($apiUrl);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($data, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
    ]);

    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response === false) {
        http_response_code(502);

        echo json_encode([
            'success' => false,
            'message' => 'Ошибка соединения с API',
            'error' => $curlError,
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

        exit;
    }

    http_response_code($httpCode ?: 200);

    echo $response;

}


// ЗАПРОС НА СЕРВЕР - ПОЛУЧЕНИЕ СЧЕТА + КП
function getDataServer_Invoice($query) {
    $body = readRequestJsonBody();

    if (!empty($body) && is_array($body)) {
        $query = array_merge(is_array($query) ? $query : [], $body);
    }

    $payload = buildInvitecraftInvoicePayload($query);

    if ($payload === null) {
        http_response_code(400);

        return [
            'success' => false,
            'message' => 'Invalid InviteCraft invoice data',
            'request' => $query,
        ];
    }

    $result = requestInvitecraftPayload($payload);

    if (empty($result['success'])) {
        http_response_code((int)($result['httpCode'] ?? 502));

        return $result;
    }

    $response = $result['response'];
    $response['request'] = $result['request'] ?? $payload;

    return $response;

    $isTest = true;
    if ($isTest) {

        // $query['customer_id'] = 16; //существующий покупатель В ИХ СИСТЕМЕ
        $query['customer_name'] = "Иванов Иван ТЕСТ"; //игнорируется, если задано customer_id
        $query['customer_phone'] =  "+79103122694"; // игнорируется, если задано customer_id
        $query['customer_address'] = "ул, Центральная, д. 10"; // игнорируется, если задано customer_id

        $query['products'] = [
            [
                "id" => 1, //Номер изделия (Обязательный параметр)
                'type_id' => 346, // ID типовой схемы - из картинки
                'width' => 1900, // ширина
                'height' => 1400, // высота
                'system_id' => "/_СИСТЕМЫ/1 ОКОННЫЕ СИСТЕМЫ/СИСТЕМЫ 58 мм-60 мм/ RULA 58 мм", // название системы в программе
                'color' => "Белый", // основной цвет
                "discount" => "10", // Скидка на изделие в процентах (берется от дилллера?)

                // импосты - зависят от выбранной схемы, если двухсвторчатая - 1 импост, трехстворчатая - 2 импоста
                // "imp1" => 450, // отступ от левого края (ЗДЕСЬ УЖЕ ИДУТ КАК ОТДЕЛЬНОЕ ЗНАЧЕНИЕ, ПРИЧЕМ С НАЗВАНИЕМ imp)
                // СИСТЕМА НЕ ВИДИТ ИМПОСТЫ!!! Пишет что неисзветный параметр imp1

                'parameters' => [ // параметры
                    ['Цвет уплотнения' => "Черный"], // Цвет уплотнителя
                    ['ДРЕНАЖ.ОТВЕРСТ. РАМА' => "СНИЗУ"], // Дренажное отверстие
                ],
                'contours' => [ // контуры
                    [
                        'id' => 2, // 1 = одно целое окно, 2 = окно + 1 створка, 3 = окно + 2 створки
                        'parameters' => [
                            ['ТИП РУЧКИ' => "  ОКОННАЯ"], // пример
                        ],
                    ]
                ],
                "accessories" => [ // доп. опции
                    [
                        "id" => 1,
                        "article" => "Под 200 FineBer",
                        "color" => "Белый",
                        "quantity" => "1",
                        "length" => 1.3,
                        "width" => 0.1
                    ],
                    [
                        "id" => 2,
                        "article" => "ОТЛ. 180 (ш-0,23)",
                        "color" => "Белый",
                        "quantity" => "1",
                        "length" => (string)1000/1000,
                        "width" => (string)100/1000
                    ],
                ],
            ]
        ];

        $query['works'] = [ // Услуги
            [
                "name" => "Доставка",
                "quantity" => 1,
                "price" => 2000
            ],
            [
                "name" => "Монтаж",
                "quantity" => 1,
                "price" => 1500
            ],
        ];
    }


    header('Content-Type: application/json; charset=utf-8');
    $apiUrl = 'https://api.invitecraft.ru/';
    $apiKey = '1e72be3b888edebb9a761b45a574e76aed2839a723f0c4a5fc461d1951979b25';

    $data = [
        'command' => 'invoice',
        'customer_id' => $query['customer_id'],
        'customer_name' => $query['customer_name'],
        'customer_phone' => $query['customer_phone'],
        'customer_address' => $query['customer_address'],
        'products' => $query['products'], // многомерный массив
        'works' => $query['works'],
    ];

    // print_r(json_encode($data, JSON_UNESCAPED_UNICODE));

    $headers = [
        'Content-Type: application/json',
    ];

    if (!empty($apiKey)) {
        $headers[] = 'X-API-Key: ' . $apiKey;
    }

    $ch = curl_init($apiUrl);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($data, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
    ]);

    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response === false) {
        http_response_code(502);

        echo json_encode([
            'success' => false,
            'message' => 'Ошибка соединения с API',
            'error' => $curlError,
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

        exit;
    }

    http_response_code($httpCode ?: 200);

    echo $response;
}



// ЗАПРОС НА СЕРВЕР - ПОЛУЧНИЕ ФАЙЛА PDF СЧЕТА
function getDataServer_PrintInvoice($query) {

    $body = readRequestJsonBody();

    if (!empty($body) && is_array($body)) {
        $query = array_merge(is_array($query) ? $query : [], $body);
    }

    $invoiceNo = (int)($query['invoice_no'] ?? $query['invoiceNo'] ?? 0);

    if ($invoiceNo <= 0) {
        http_response_code(400);

        return [
            'success' => false,
            'message' => 'InviteCraft invoice number is missing',
            'request' => $query,
        ];
    }

    $apiUrl = 'https://api.invitecraft.ru/';
    $apiKey = getInvitecraftApiKey();

    $data = [
        'command' => 'print_invoice',
        'invoice_no' => $invoiceNo, // номер существующего счета
        'document' => $query['document'] ?? "Коммерческое предложение +", // Название шаблона для этого счета
    ];

    // print_r(json_encode($data, JSON_UNESCAPED_UNICODE));

    $headers = [
        'Content-Type: application/json',
    ];

    if (!empty($apiKey)) {
        $headers[] = 'X-API-Key: ' . $apiKey;
    }

    $ch = curl_init($apiUrl);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($data, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
    ]);

    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

    curl_close($ch);

    if ($response === false) {
        http_response_code(502);

        echo json_encode([
            'success' => false,
            'message' => 'Ошибка соединения с API',
            'error' => $curlError,
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

        exit;
    }

    $responseSize = strlen((string)$response);
    $isPdfResponse = $responseSize >= 4 && strncmp($response, '%PDF', 4) === 0;
    $isSuccessfulResponse = $httpCode === 0 || ($httpCode >= 200 && $httpCode < 300);

    if (!$isSuccessfulResponse || !$isPdfResponse) {
        http_response_code($httpCode >= 400 ? $httpCode : 502);
        header('Content-Type: application/json; charset=utf-8');

        echo json_encode([
            'success' => false,
            'error' => [
                'code' => 'invalid_pdf_response',
                'message' => 'InviteCraft did not return a valid PDF',
                'upstreamStatus' => $httpCode,
                'contentType' => $contentType,
                'responseBytes' => $responseSize,
            ],
            'invoice_no' => $invoiceNo,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        exit;
    }

    http_response_code($httpCode ?: 200);
    header('Content-Type: application/pdf');
    header('Content-Length: ' . $responseSize);

    echo $response;
    exit;
}
