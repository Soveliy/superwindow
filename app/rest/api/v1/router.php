<?
require_once __DIR__ . '/controllers/BasketController.php';
require_once __DIR__ . '/controllers/OrderController.php';
require_once __DIR__ . '/controllers/UserController.php';

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
                return userRegisterOrGet($query);

        
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


        
        // ### ДЕЙСТВИЯ ###

        case 'order_create': // Создать новый заказ
            return createOrder($query);
                
        case 'product_add': // Добавить товар в Корзину
            return addBasketProduct($query);

        case 'service_add': // Добавить услугу в Корзину
            return addBasketService($query);

        case 'basket_del': // Убрать товар из Корзины
            return removeBasketProduct($query);

        case 'basket_clear': // Очистить Корзину
            return clearBasket();


        default:
            http_response_code(404);
            return ['error' => 'Method not found'];
    }
}