# Backend Contract

## Authentication

- `POST /auth/login`

## Orders

- `GET /orders`
- `GET /orders/:orderId`
- `POST /orders`
- `PATCH /orders/:orderId`

## Calculator Ajax Handlers

- `POST /local/ajax/save-window.php`
- `POST /local/ajax/save-service.php`

Payloads are currently sent as JSON.

## Settings

- `GET /settings/production-dates`
- `PATCH /settings/production-dates`
- `GET /profile/me`
- `PATCH /profile/me`

## Notes

- The UI currently keeps drafts in `localStorage`, but window and service save actions now also send AJAX requests to the PHP handlers above.
- The app now uses `/calc/` as the production base path and does not auto-redirect from the root route.
