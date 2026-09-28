<?
use Bitrix\Main\Loader;
use Bitrix\Main\Data\Cache;


// АВТОРИЗАЦИЯ ПОЛЬЗОВАТЕЛЯ [login, password]
function getUserLogin($query)
{
    // Защита
    // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    //     return ['error' => 'Only POST'];
    // }

    $data = json_decode(file_get_contents('php://input'), true);
    $data = is_array($data) ? $data : [];
    $query = array_merge(is_array($query) ? $query : [], $data);

    global $USER;

    $login = trim($query['login'] ?? $query['emailOrDealerId'] ?? $query['email'] ?? '');
    $password = trim($query['password'] ?? '');
    $remember = filter_var($query['remember'] ?? $query['rememberMe'] ?? true, FILTER_VALIDATE_BOOLEAN);

    if (!$login || !$password) {
        http_response_code(400);
        return [
            'success' => false,
            'message' => 'Введите логин и пароль',
        ];
    }

    if (!Loader::includeModule('main')) {
        http_response_code(500);
        return [
            'success' => false,
            'message' => 'Не удалось подключить модуль пользователей',
        ];
    }

    $result = $USER->Login($login, $password, $remember ? 'Y' : 'N');

    if ($result !== true) {
        http_response_code(401);
        return [
            'success' => false,
            'message' => strip_tags($result['MESSAGE'] ?? 'Неверный логин или пароль'),
        ];
    }

    $userId = (int)$USER->GetID();
    $userData = [];

    if ($userId > 0) {
        $rsUser = CUser::GetByID($userId);
        $userData = $rsUser ? ($rsUser->Fetch() ?: []) : [];
    }

    $fullName = trim(implode(' ', array_filter([
        $userData['LAST_NAME'] ?? '',
        $userData['NAME'] ?? '',
        $userData['SECOND_NAME'] ?? '',
    ])));
    $userLogin = $userData['LOGIN'] ?? $login;
    $userEmail = $userData['EMAIL'] ?? '';
    $userName = $fullName ?: $userLogin;

    return [
        'success' => true,
        'token' => function_exists('bitrix_sessid') ? bitrix_sessid() : session_id(),
        'dealerId' => $userId ?: $login,
        'user_id' => $userId,
        'login' => $userLogin,
        'email' => $userEmail,
        'name' => $userName,
        'user' => [
            'id' => $userId,
            'login' => $userLogin,
            'email' => $userEmail,
            'name' => $userName,
        ],
    ];
}

// ВЫХОД ПОЛЬЗОВАТЕЛЯ
function getUserLogout()
{
    // Защита
    // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    //     return ['error' => 'Only POST'];
    // }

    global $USER;
    if ($USER && $USER->IsAuthorized()) {
        $USER->Logout();
    }

    return ['success' => true];
}


// РЕГИСТРАЦИЯ ПОЛЬЗОВАТЕЛЯ [name, phone]
// function userRegister($query)
// {
//     // Защита
//     // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
//     //     return ['error' => 'Only POST'];
//     // }

//     Loader::includeModule('main');
//     require_once($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/classes/general/captcha.php");

//     global $USER;

//     // РЕЖИМ - при новом заказе order
//     $type = 'order';

//     // Данные
//     $fio = parseFio($query['name']);
//     $phone = normalPhone($query['phone']);

//     $userType = 1; // физик по-умолчанию

//     // Проверка на существующего пользователя
//     $rsUser = CUser::GetByLogin($phone);
//     if ($userData = $rsUser->Fetch()) {

//         // при заказе не логиним!
//         if ($type === 'order') {

//             // не логиним без пароля
//             return [
//                 'success' => true,
//                 'user_id' => $userData['ID'],
//                 'exists' => true
//             ];
//         }

//         return ['error' => 'User already exists'];
//     }

//     // Поля
//     $user = new CUser();

//     $fields = [
//         'LOGIN' => $phone,
//         'NAME' => $fio['NAME'],
//         'LAST_NAME' => $fio['LAST_NAME'],
//         'SECOND_NAME' => $fio['SECOND_NAME'],
//         'ACTIVE' => 'Y',
//     ];

//     $userId = $user->Add($fields);

//     if ($userId > 0) {
//         return [
//             'success' => true,
//             'user_id' => $userId,
//             'exists' => false
//         ];
//     }

//     return ['error' => $user->LAST_ERROR];
// }

function userRegisterOrGet($query, $isUpdate = false)
{
    // Защита
    // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    //     return ['error' => 'Only POST'];
    // }

    $data = json_decode(file_get_contents('php://input'), true);
    $data = is_array($data) ? $data : [];
    $query = array_merge(is_array($query) ? $query : [], $data);
    $isUpdate = $isUpdate || filter_var($query['is_update'] ?? $query['isUpdate'] ?? false, FILTER_VALIDATE_BOOLEAN);

    $phone = normalPhone($query['phone'] ?? '');
    $name = parseFio($query['customerName'] ?? $query['fio'] ?? '');
    $rsUser = CUser::GetByLogin($phone);

    // 1. Удаляем всё, кроме цифр и знака "+"
    $cleanPhone = preg_replace('/[^\d+]/', '', $phone);

    // 2. Нормализация (если номер начинается с 8 или 7 без плюса)
    if (preg_match('/^8\d{10}$/', $cleanPhone)) {
        $cleanPhone = '+7' . substr($cleanPhone, 1);
    } elseif (preg_match('/^7\d{10}$/', $cleanPhone)) {
        $cleanPhone = '+' . $cleanPhone;
    }
    
    if ($user = $rsUser->Fetch()) {

        // SMS
        // sendSms($phone, "Вы оформили заказ");
        $arrSms = [
            'phone' => $phone,
            'text' => "Вы оформили заказ"
        ];

        if (!$isUpdate) {
            sendSms($arrSms);
        }

        return [
            'user_id' => $user['ID'],
            'exists' => true
        ];
    }

    $user = new CUser();
    $password = randString(10);

    $fields = [
        'LOGIN' => $phone,
        'PERSONAL_PHONE' => $cleanPhone,
        'PHONE_NUMBER' => $cleanPhone,
        'NAME' => $name['NAME'],
        'LAST_NAME' => $name['LAST_NAME'],
        'SECOND_NAME' => $name['SECOND_NAME'],
        'ACTIVE' => 'Y',
        'PASSWORD' => $password,
        'CONFIRM_PASSWORD' => $password,
    ];

    $id = $user->Add($fields);

    if ($id > 0) {

        $arrSms = [
            'phone' => $phone,
            'text' => "Регистрация успешна. Для входа перейдите по ссылке https://aspro.galereyaokon.com/auth/"
        ];

        sendSms($arrSms);

        return [
            'user_id' => $id,
            'exists' => false
        ];
    }

    return [
        'error' => $user->LAST_ERROR
    ];
}

function normalPhone($phone) {
    // убираем всё кроме цифр
    $phone = preg_replace('/\D+/', '', $phone);

    // если начинается с 8 - меняем на 7
    if (strlen($phone) == 11 && $phone[0] == '8') {
        $phone[0] = '7';
    }

    // если 10 цифр - считаем РФ и добавляем 7
    if (strlen($phone) == 10) {
        $phone = '7' . $phone;
    }

    return $phone;
}

function parseFio($fio) {
    $parts = preg_split('/\s+/', trim($fio));

    return [
        'LAST_NAME' => $parts[0] ?? '',
        'NAME' => $parts[1] ?? '',
        'SECOND_NAME' => $parts[2] ?? ''
    ];
}

function sendSms($query)
{
    file_put_contents(__DIR__ . "/log_sms.txt", print_r($query,1));

    $phone = $query['phone'];
    $text  = $query['text'];

    // защита
    if (empty($phone) || empty($text)) {
        return ['success' => false, 'error' => 'Empty phone or text'];
    }

    // вызов оригинальной функции
    $result = send_sms($phone, $text, 0);

    // разбор ответа
    if ($result[1] > 0) {
        return [
            'success' => true,
            'id' => $result[0],
            'count' => $result[1],
            'cost' => $result[2] ?? null
        ];
    }

    return [
        'success' => false,
        'error_code' => $result[1],
        'error' => $result[0]
    ];
}
