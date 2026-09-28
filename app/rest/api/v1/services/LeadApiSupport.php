<?php

use Bitrix\Main\Loader;
use Bitrix\Main\Type\DateTime as BitrixDateTime;

class SwLeadApiException extends RuntimeException
{
    private $httpStatus;
    private $errorCode;
    private $details;

    public function __construct($httpStatus, $errorCode, $message, array $details = array())
    {
        parent::__construct((string)$message);
        $this->httpStatus = (int)$httpStatus;
        $this->errorCode = (string)$errorCode;
        $this->details = $details;
    }

    public function getHttpStatus()
    {
        return $this->httpStatus;
    }

    public function getErrorCode()
    {
        return $this->errorCode;
    }

    public function getDetails()
    {
        return $this->details;
    }
}

function swLeadConfig($path = null, $default = null)
{
    static $config;

    if ($config === null) {
        $config = require __DIR__ . '/../config/leads.php';
    }

    if ($path === null || $path === '') {
        return $config;
    }

    $value = $config;
    foreach (explode('.', (string)$path) as $segment) {
        if (!is_array($value) || !array_key_exists($segment, $value)) {
            return $default;
        }
        $value = $value[$segment];
    }

    return $value;
}

function swLeadRequestId()
{
    static $requestId;

    if ($requestId === null) {
        $candidate = isset($_SERVER['HTTP_X_REQUEST_ID']) ? trim((string)$_SERVER['HTTP_X_REQUEST_ID']) : '';
        if ($candidate !== '' && preg_match('/^[A-Za-z0-9._:-]{1,80}$/', $candidate)) {
            $requestId = $candidate;
        } else {
            try {
                $requestId = bin2hex(random_bytes(12));
            } catch (Exception $exception) {
                $requestId = str_replace('.', '', uniqid('req_', true));
            }
        }
    }

    return $requestId;
}

function swLeadSuccess($data = null, array $meta = array())
{
    $response = array(
        'success' => true,
        'data' => $data,
        'requestId' => swLeadRequestId(),
    );

    if ($meta) {
        $response['meta'] = $meta;
    }

    return $response;
}

function swLeadErrorResponse(SwLeadApiException $exception)
{
    http_response_code($exception->getHttpStatus());

    $error = array(
        'code' => $exception->getErrorCode(),
        'message' => $exception->getMessage(),
    );
    if ($exception->getDetails()) {
        $error['details'] = $exception->getDetails();
    }

    return array(
        'success' => false,
        'error' => $error,
        'requestId' => swLeadRequestId(),
    );
}

function swLeadHandle($callback)
{
    try {
        return call_user_func($callback);
    } catch (SwLeadApiException $exception) {
        return swLeadErrorResponse($exception);
    } catch (Throwable $exception) {
        if (function_exists('AddMessage2Log')) {
            AddMessage2Log(
                'Lead API request ' . swLeadRequestId() . ': ' . $exception->getMessage() . "\n" . $exception->getTraceAsString(),
                'superwindow.leads'
            );
        }

        http_response_code(500);
        return array(
            'success' => false,
            'error' => array(
                'code' => 'internal_error',
                'message' => 'Внутренняя ошибка сервера',
            ),
            'requestId' => swLeadRequestId(),
        );
    }
}

function swLeadHeader($name)
{
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', (string)$name));
    if (isset($_SERVER[$serverKey])) {
        return trim((string)$_SERVER[$serverKey]);
    }

    if (strcasecmp($name, 'Content-Type') === 0 && isset($_SERVER['CONTENT_TYPE'])) {
        return trim((string)$_SERVER['CONTENT_TYPE']);
    }

    return '';
}

function swLeadRequestData(array $query = array())
{
    static $bodyWasRead = false;
    static $body = array();

    if (!$bodyWasRead) {
        $bodyWasRead = true;
        $body = is_array($_POST) ? $_POST : array();
        $contentType = strtolower(swLeadHeader('Content-Type'));

        if (strpos($contentType, 'application/json') !== false) {
            $raw = file_get_contents('php://input');
            if ($raw !== false && trim($raw) !== '') {
                $decoded = json_decode($raw, true);
                if (!is_array($decoded) || json_last_error() !== JSON_ERROR_NONE) {
                    throw new SwLeadApiException(400, 'invalid_json', 'Тело запроса содержит некорректный JSON');
                }
                $body = array_merge($body, $decoded);
            }
        }
    }

    return array_merge($query, $body);
}

function swLeadRequireMethod($allowed)
{
    $allowed = array_map('strtoupper', (array)$allowed);
    $method = strtoupper(isset($_SERVER['REQUEST_METHOD']) ? (string)$_SERVER['REQUEST_METHOD'] : 'GET');
    if (!in_array($method, $allowed, true)) {
        if (!headers_sent()) {
            header('Allow: ' . implode(', ', $allowed));
        }
        throw new SwLeadApiException(405, 'method_not_allowed', 'Метод запроса не поддерживается', array('allowed' => $allowed));
    }

    return $method;
}

function swLeadRequireString(array $data, $key, $maxLength = 255, $allowEmpty = false)
{
    $value = isset($data[$key]) ? trim((string)$data[$key]) : '';
    if (!$allowEmpty && $value === '') {
        throw new SwLeadApiException(422, 'validation_error', 'Не заполнено обязательное поле', array('field' => $key));
    }

    $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    if ($length > (int)$maxLength) {
        throw new SwLeadApiException(422, 'validation_error', 'Значение поля слишком длинное', array('field' => $key, 'maxLength' => (int)$maxLength));
    }

    return $value;
}

function swLeadPositiveInt(array $data, array $keys, $required = true)
{
    $value = 0;
    $matched = isset($keys[0]) ? $keys[0] : 'id';
    foreach ($keys as $key) {
        if (isset($data[$key]) && $data[$key] !== '') {
            $value = (int)$data[$key];
            $matched = $key;
            break;
        }
    }

    if ($required && $value <= 0) {
        throw new SwLeadApiException(422, 'validation_error', 'Укажите корректный идентификатор', array('field' => $matched));
    }

    return $value;
}

function swLeadJsonEncode($value)
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new SwLeadApiException(422, 'json_encode_failed', 'Не удалось сериализовать данные');
    }

    return $json;
}

function swLeadJsonDecode($value, $fallback = array())
{
    if (is_array($value)) {
        return $value;
    }
    if ($value === null || $value === '') {
        return $fallback;
    }

    $decoded = json_decode((string)$value, true);
    return is_array($decoded) ? $decoded : $fallback;
}

function swLeadParseDateTime($value, $field, $required = false)
{
    if ($value instanceof DateTimeImmutable) {
        return $value;
    }
    if ($value instanceof DateTimeInterface) {
        return new DateTimeImmutable($value->format('Y-m-d\TH:i:s.uP'));
    }
    if ($value instanceof BitrixDateTime) {
        return (new DateTimeImmutable('@' . $value->getTimestamp()))->setTimezone(new DateTimeZone(date_default_timezone_get()));
    }
    $value = trim((string)$value);
    if ($value === '') {
        if ($required) {
            throw new SwLeadApiException(422, 'validation_error', 'Не указаны дата и время', array('field' => $field));
        }
        return null;
    }

    try {
        $date = new DateTimeImmutable($value);
    } catch (Exception $exception) {
        throw new SwLeadApiException(422, 'validation_error', 'Некорректные дата и время', array('field' => $field));
    }

    return $date;
}

function swLeadUtcNow()
{
    return new DateTimeImmutable('now', new DateTimeZone('UTC'));
}

function swLeadIso($value)
{
    if ($value instanceof BitrixDateTime) {
        $value = new DateTimeImmutable($value->format('Y-m-d H:i:s'), new DateTimeZone(date_default_timezone_get()));
    } elseif ($value instanceof DateTime) {
        $value = DateTimeImmutable::createFromMutable($value);
    } elseif (!$value instanceof DateTimeImmutable) {
        if ($value === null || $value === '') {
            return null;
        }
        try {
            $value = new DateTimeImmutable((string)$value);
        } catch (Exception $exception) {
            return (string)$value;
        }
    }

    return $value->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
}

function swLeadDateForStorage($value)
{
    if ($value === null || $value === '') {
        return null;
    }
    if ($value instanceof BitrixDateTime) {
        return $value;
    }
    if (!$value instanceof DateTimeInterface) {
        $value = swLeadParseDateTime($value, 'date', true);
    }

    $local = (new DateTimeImmutable('@' . $value->getTimestamp()))->setTimezone(new DateTimeZone(date_default_timezone_get()));
    return new BitrixDateTime($local->format('Y-m-d H:i:s'), 'Y-m-d H:i:s');
}

function swLeadConstantTimeEquals($expected, $provided)
{
    $expected = (string)$expected;
    $provided = (string)$provided;
    return $expected !== '' && $provided !== '' && hash_equals($expected, $provided);
}

function swLeadRequireImportKey(array $data = array())
{
    $expected = (string)swLeadConfig('auth.import_api_key', '');
    if ($expected === '') {
        throw new SwLeadApiException(503, 'import_not_configured', 'Импорт лидов не настроен');
    }

    $provided = swLeadHeader('X-API-Key');
    if ($provided === '' && isset($data['api_key'])) {
        $provided = (string)$data['api_key'];
    }
    if (!swLeadConstantTimeEquals($expected, $provided)) {
        throw new SwLeadApiException(401, 'invalid_api_key', 'Недействительный ключ импорта');
    }
}

function swLeadRequireCronKey(array $data = array())
{
    if (PHP_SAPI === 'cli') {
        return;
    }

    $expected = (string)swLeadConfig('auth.cron_api_key', '');
    $provided = swLeadHeader('X-Cron-Key');
    if ($provided === '' && isset($data['cron_key'])) {
        $provided = (string)$data['cron_key'];
    }
    if (!swLeadConstantTimeEquals($expected, $provided)) {
        throw new SwLeadApiException(401, 'invalid_cron_key', 'Недействительный ключ планировщика');
    }
}

function swLeadRequireActor()
{
    global $USER;

    if (!is_object($USER) || !method_exists($USER, 'IsAuthorized') || !$USER->IsAuthorized()) {
        throw new SwLeadApiException(401, 'authentication_required', 'Требуется авторизация');
    }

    $userId = (int)$USER->GetID();
    $dealerId = $userId;
    $dealerField = trim((string)swLeadConfig('auth.dealer_user_field', ''));
    if ($dealerField !== '' && class_exists('CUser')) {
        $row = CUser::GetByID($userId)->Fetch();
        if (is_array($row) && isset($row[$dealerField]) && (int)$row[$dealerField] > 0) {
            $dealerId = (int)$row[$dealerField];
        }
    }

    $isAdmin = method_exists($USER, 'IsAdmin') && $USER->IsAdmin();
    if (!$isAdmin && class_exists('CUser')) {
        $allowedGroups = array_filter((array)swLeadConfig('auth.admin_group_ids', array()));
        if ($allowedGroups) {
            $userGroups = array_map('intval', (array)CUser::GetUserGroup($userId));
            $isAdmin = (bool)array_intersect($allowedGroups, $userGroups);
        }
    }

    return array(
        'user_id' => $userId,
        'dealer_id' => $dealerId,
        'is_admin' => $isAdmin,
    );
}

function swLeadRequireCsrf(array $data = array())
{
    $provided = swLeadHeader('X-Bitrix-Csrf-Token');
    if ($provided === '') {
        $provided = swLeadHeader('X-CSRF-Token');
    }
    if ($provided === '' && isset($data['sessid'])) {
        $provided = (string)$data['sessid'];
    }

    $expected = function_exists('bitrix_sessid') ? (string)bitrix_sessid() : '';
    if (!swLeadConstantTimeEquals($expected, $provided)) {
        throw new SwLeadApiException(403, 'csrf_failed', 'Сессия устарела или CSRF-токен недействителен');
    }
}

function swLeadNormalizePage(array $data)
{
    $page = max(1, (int)(isset($data['page']) ? $data['page'] : 1));
    $max = (int)swLeadConfig('lead.max_page_size', 50);
    $pageSize = (int)(isset($data['page_size']) ? $data['page_size'] : (isset($data['pageSize']) ? $data['pageSize'] : 20));
    $pageSize = max(1, min($max, $pageSize));

    return array($page, $pageSize);
}
