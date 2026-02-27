# SuperWindow PWA (MVP)

PWA-приложение для дилерского кабинета на стеке `React + TypeScript + Tailwind + Vite`.

## Запуск

```bash
npm install
cp .env.example .env
npm run dev
```

## Переменные окружения

- `VITE_API_BASE_URL` - базовый URL для API.
- `VITE_DEV_AUTH_ENABLED` - включить временный dev-вход (`true/false`, работает только в dev-режиме).
- `VITE_DEV_AUTH_LOGIN` - логин для dev-входа.
- `VITE_DEV_AUTH_PASSWORD` - пароль для dev-входа.
- `VITE_DEV_AUTH_DEALER_ID` - dealer ID, который будет записан в сессию после dev-входа.

## Первый инкремент

- Базовая архитектура модулей (`app`, `features`, `shared`).
- PWA-конфигурация (`vite-plugin-pwa`, manifest, service worker).
- Экран авторизации с валидацией и отправкой `POST /auth/login`.
- Черновые экраны `Orders` и `Settings` для дальнейшей итерации.
