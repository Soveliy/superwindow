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

## Деплой в `/calc/`

- Production base path уже настроен в [vite.config.ts](/d:/projects/superwindow/app/vite.config.ts:1) как `/calc/`.
- Роутер тоже учитывает подпапку через `basename` в [src/main.tsx](/d:/projects/superwindow/app/src/main.tsx:1).
- Для Apache/Bitrix в сборку теперь копируется `public/.htaccess`, который переписывает SPA-маршруты на `index.html`.
- Если сервер всё равно отдаёт `404` при обновлении `/calc/...`, значит rewrite нужно настроить на уровне фронтового Nginx/виртуального хоста:
  `try_files $uri $uri/ /calc/index.html;`
- Если доступа к серверному rewrite нет, временный обходной путь - включить hash routing через `VITE_USE_HASH_ROUTER=true`.
