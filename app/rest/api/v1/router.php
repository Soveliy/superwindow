<?php
require_once __DIR__ . '/controllers/BasketController.php';
require_once __DIR__ . '/controllers/OrderController.php';
require_once __DIR__ . '/controllers/UserController.php';
require_once __DIR__ . '/controllers/smsc_api.php';
require_once __DIR__ . '/controllers/LeadController.php';
require_once __DIR__ . '/controllers/LeadLegacyBridge.php';
// Existing production B24 transport stays outside source control (contains credentials).
if (is_file(__DIR__ . '/controllers/Bitrix24.php')) {
    require_once __DIR__ . '/controllers/Bitrix24.php';
}

// Обработка запросов

function route($query)
{
    if (!isset($query['action'])) {
        return ['error' => 'Ошибка'];
    }

    switch ($query['action']) {

        ### ПОЛЬЗОВАТЕЛЬ ###

            case 'user_login': // Авторизация пользователя
                return getUserLogin($query);

            case 'user_logout': // Выход пользователя
                return getUserLogout($query);

            case 'user_register_or_get': // Регистрация пользователя
                $isUpdate = filter_var($query['is_update'] ?? $query['isUpdate'] ?? false, FILTER_VALIDATE_BOOLEAN);
                return userRegisterOrGet($query, $isUpdate);


        // ### ЗАКАЗЫ И КОРЗИНА ###

            case 'basket': // Получить корзину пользователя
                return getBasket();

            case 'orders': // Получить список заказов (с фильтром)
                return getOrders($query);

            case 'order_get': // Получить детальный заказ
                return getOrder($query);

            case 'order_paid_full': // Полностью оплаченный заказ
                return setOrderPaidFull($query);

            case 'order_refresh': // Обновление данных заказа
                return setOrderRefresh($query);

            case 'order_payment_update':
                return updateOrderPayment($query);

            case 'order_code_update': // Обновление кода заказа из программы
                return updateOrderCode($query);

            case 'get_data_product': // запрашиваем данные о товаре с сервера
                return getDataServer_Product($query);

            case 'get_data_invoice': // выставление счета + КП
                return getDataServer_Invoice($query);

            case 'get_data_print_invoice': // печать счета как файл
                return getDataServer_PrintInvoice($query);



        // ### ДЕЙСТВИЯ ###

            case 'order_create': // Создать новый заказ
                return createOrder($query);

            case 'product_add': // Добавить товар в Корзину
                return addBasketProduct($query);

            case 'product_price':
                return getBasketProductPrice($query);

            case 'service_add': // Добавить услугу в Корзину
                return addBasketService($query);

            case 'basket_del': // Убрать товар из Корзины
                return removeBasketProduct($query);

            case 'basket_clear': // Очистить Корзину
                return clearBasket();

            case 'send_sms': // Отправить смс
                return sendSms($query); //из шаблона smsc_api


        // Existing integration routes use the same B24Leads/B24Works records.
            case 'b24_leads':
                return swExistingB24Action('bitrix24GetLeads', $query, false, true);
            case 'b24_lead':
                return swExistingB24Action('bitrix24GetLead', $query, false, true);
            case 'b24_lead_fields':
                return swExistingB24Action('bitrix24GetLeadFields', $query, false, true);
            case 'b24_lead_stages':
                return swExistingB24Action('bitrix24GetLeadStages', $query, false, true);
            case 'b24_lead_import':
                return swExistingB24Action('bitrix24ImportLead', $query, true, true);
            case 'hl_lead_sync':
                return swExistingB24Action('syncB24LeadHL', $query, true, true);
            case 'hl_leads':
            case 'hl_lead_get':
            case 'hl_lead_take':
            case 'hl_lead_set_date':
            case 'hl_leads_my':
            case 'hl_works':
            case 'hl_works_my':
            case 'hl_work_get':
            case 'hl_work_date':
            case 'hl_work_complete':
            case 'hl_work_photo_add':
                return swLegacyLeadAction($query['action'], $query);

        // ### ЛИДЫ И ЗАКАЗЫ НА МОНТАЖ/ДОСТАВКУ ###

            case 'leads_list':
            case 'leads':
                return swLeadListAction($query);

            case 'lead_get':
                return swLeadGetAction($query);

            case 'lead_take':
                return swLeadTakeAction($query);

            case 'lead_schedule':
                return swLeadScheduleAction($query);

            case 'lead_convert':
                return swLeadConvertAction($query, false);

            case 'lead_measurement_convert':
            case 'lead_convert_measurement':
                return swLeadConvertAction($query, true);

            case 'lead_import':
                return swLeadImportAction($query);

            case 'work_orders_list':
            case 'work_orders':
                return swWorkOrderListAction($query);

            case 'work_order_get':
                return swWorkOrderGetAction($query);

            case 'work_order_update':
            case 'work_order_plan':
                return swWorkOrderUpdateAction($query);

            case 'work_order_complete':
                return swWorkOrderCompleteAction($query);

            case 'notifications_list':
            case 'notifications':
                return swNotificationListAction($query);

            case 'notification_read':
                return swNotificationReadAction($query);

            case 'notifications_read_all':
                return swNotificationsReadAllAction($query);

            case 'lead_notification_preferences_get':
            case 'notification_preferences_get':
                return swLeadNotificationPreferencesGetAction($query);

            case 'lead_notification_preferences_update':
            case 'notification_preferences_update':
                return swLeadNotificationPreferencesUpdateAction($query);

            case 'lead_b24_outbox_flush':
                return swLeadOutboxFlushAction($query);


            default:
                http_response_code(404);
                return ['error' => 'Method not found'];
    }
}

function swExistingB24Action($callback, array $query, $mutation, $adminOnly)
{
    return swLeadHandle(function () use ($callback, $query, $mutation, $adminOnly) {
        swLeadRequireMethod($mutation ? 'POST' : 'GET');
        $data = swLeadRequestData($query);
        // Import/sync controllers validate the configured integration key or
        // an administrator session + CSRF themselves. Do not require a browser
        // session before a legitimate server-to-server request can reach them.
        if ($mutation && in_array($callback, array('bitrix24ImportLead', 'syncB24LeadHL'), true)) {
            if (!function_exists($callback)) {
                throw new SwLeadApiException(503, 'b24_not_configured', 'Интеграция Битрикс24 не настроена');
            }
            return call_user_func($callback, $data);
        }
        $actor = swLeadRequireActor();
        if ($adminOnly && empty($actor['is_admin'])) {
            throw new SwLeadApiException(403, 'forbidden', 'Доступно только администратору');
        }
        if ($mutation) { swLeadRequireCsrf($data); }
        if (!function_exists($callback)) {
            throw new SwLeadApiException(503, 'b24_not_configured', 'Интеграция Битрикс24 не настроена');
        }
        if ($callback === 'bitrix24GetLead') {
            return call_user_func($callback, swLeadPositiveInt($data, ['b24_id', 'id']));
        }
        return call_user_func($callback, $data);
    });
}
