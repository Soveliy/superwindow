# Backend Contract

## Authentication

- `POST /auth/login`

## Orders

- `GET /orders`
- `GET /orders/:orderId`
- `POST /orders`
- `PATCH /orders/:orderId`

## Calculator Ajax Handlers

- `POST /local/rest/api/v1/?action=product_add`
- `POST /local/rest/api/v1/?action=service_add`
- `POST /local/rest/api/v1/?action=basket_del`
- `POST /local/rest/api/v1/?action=user_register_or_get`
- `POST /local/rest/api/v1/?action=order_create`
- `POST /local/rest/api/v1/?action=order_refresh`
- `POST /local/rest/api/v1/?action=order_get`

Payloads are currently sent as JSON.

## Settings

- `GET /settings/production-dates`
- `PATCH /settings/production-dates`
- `GET /profile/me`
- `PATCH /profile/me`

## Notes

- The UI currently keeps drafts in `localStorage`, but window, service, and full-order save actions now also send JSON requests to the REST handlers above.
- The app now uses `/calc/` as the production base path and does not auto-redirect from the root route.
