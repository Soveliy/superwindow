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

    global $USER;

    if ($USER->IsAuthorized()) {
        return ['success' => true];
    }

    $login = trim($query['login'] ?? '');
    $password = trim($query['password'] ?? '');

    if (!$login || !$password) {
        return ['error' => 'Empty login or password'];
    }

    $result = $USER->Login($login, $password, "Y");

    if ($result !== true) {
        return ['error' => $result['MESSAGE']];
    }

    return ['success' => true];
}

// ВЫХОД ПОЛЬЗОВАТЕЛЯ
function getUserLogout()
{
    // Защита
    // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    //     return ['error' => 'Only POST'];
    // }

    global $USER;
    $USER->Logout();

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

function userRegisterOrGet($query)
{
    // Защита
    // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    //     return ['error' => 'Only POST'];
    // }

    $data = json_decode(file_get_contents('php://input'), true);

    $phone = normalPhone($data['phone']);
    $name = parseFio($data['customerName']);
    $rsUser = CUser::GetByLogin($phone);
    
    if ($user = $rsUser->Fetch()) {

        // SMS
        sendSms($phone, "Вы оформили заказ");

        return [
            'user_id' => $user['ID'],
            'exists' => true
        ];
    }

    $user = new CUser();
    $password = randString(10);

    $fields = [
        'LOGIN' => $phone,
        'PERSONAL_PHONE' => $phone,
        'NAME' => $name['NAME'],
        'LAST_NAME' => $name['LAST_NAME'],
        'SECOND_NAME' => $name['SECOND_NAME'],
        'ACTIVE' => 'Y',
        'PASSWORD' => $password,
        'CONFIRM_PASSWORD' => $password,
    ];

    $id = $user->Add($fields);

    if ($id > 0) {
        sendSms($phone, "Регистрация успешна. Ваш пароль: $password");

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

function sendSms($phone, $text)
{
    // заглушка для отправки смс
}