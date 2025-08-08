# SparkPanel

Мощная веб‑панель для управления игровыми серверами. Цель — сделать удобную, красивую и быструю панель с дружелюбным UX в духе «be happy».

## Возможности
- Регистрация, подтверждение email, вход с 2FA (TOTP), восстановление пароля
- Роли и права (ADMIN, MODERATOR, USER)
- Управление серверами Minecraft: создание, запуск/стоп, мониторинг CPU/RAM/Net, хранение данных на хосте
- Файловый менеджер (листинг, загрузка, скачивание, удаление)
- Аудит‑логи действий
- Уведомления (заготовки под Discord/Telegram)
- WebSocket/Socket.IO статистика в реальном времени
- Мультиязычность (RU/EN), темы (светлая/тёмная)

## Архитектура
- Backend: Node.js + TypeScript + Express, Prisma + PostgreSQL, JWT (access/refresh), Socket.IO, Docker API (dockerode)
- Frontend: Vite + React + TypeScript, React Router, React Query, Zustand, i18n
- Данные: PostgreSQL (через Prisma)
- Серверы Minecraft: Docker-контейнеры `itzg/minecraft-server`, данные на хосте (`FILES_ROOT`)

## Поддерживаемые ОС хоста
- Ubuntu 22.04 LTS (рекомендуется)
- Ubuntu 22.10/23.04/24.04 — должны работать при наличии Docker и Node 20+

## Требования
- Docker Engine + Docker Compose v2
- Node.js 20.x (рекомендуется LTS), npm 10+
- PostgreSQL 16 (можно в контейнере)

## Установка на Ubuntu 22.04

### 1) Установите Docker
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

### 2) Установите Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential
```

### 3) Клонируйте проект
```bash
git clone https://your.repo/SparkPanel.git
cd SparkPanel
```

### 4) Поднимите PostgreSQL (через docker-compose)
```bash
sudo docker compose up -d postgres
```
Проверьте: `docker ps` должен показать контейнер `postgres`.

### 5) Настройте переменные окружения backend
```bash
cp backend/.env.example backend/.env
nano backend/.env
```
- Укажите `DATABASE_URL` на ваш Postgres (если compose — значение по умолчанию подойдёт)
- Задайте `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET`
- При необходимости отредактируйте `BASE_URL` (URL фронтенда), `FILES_ROOT` (где хранить данные серверов)
- Для автоматического создания админа добавьте `ADMIN_EMAIL` и `ADMIN_PASSWORD`

Создайте директорию для данных серверов:
```bash
sudo mkdir -p /var/lib/sparkpanel/servers
sudo chown -R $USER:$USER /var/lib/sparkpanel/servers
```

### 6) Установка зависимостей и миграции Prisma
```bash
cd backend
npm install --no-fund --no-audit
npx prisma generate
npx prisma migrate deploy
```
Если вы разворачиваете свежую БД для разработки, можно:
```bash
npx prisma migrate dev --name init
```

### 7) Запуск backend (dev)
```bash
npm run dev
```
Backend поднимется на `http://localhost:8080`.

### 8) Настройка и запуск frontend
```bash
cd ../../frontend
npm install --no-fund --no-audit
npm run dev
```
Фронтенд будет доступен на `http://localhost:5173`. Прокси в Vite переадресует `/api` и Socket.IO на backend.

## Prod‑развёртывание (кратко)
- Соберите backend и frontend:
```bash
cd backend && npm run build
cd ../frontend && npm run build
```
- Сервируйте `frontend/dist` через nginx, проксируйте `/api` и `/socket.io` на Node сервер backend.
- Запускайте backend как systemd‑сервис, задайте переменные в `/etc/environment` или Unit‑файле.
- Обеспечьте HTTPS (например, nginx + certbot).

## Конфигурация окружения (backend/.env)
- `PORT` — порт API (по умолчанию 8080)
- `BASE_URL` — URL фронтенда (CORS и Socket.IO)
- `DATABASE_URL` — строка подключения к PostgreSQL
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — секреты JWT
- `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` — сроки жизни токенов (например, 15m / 30d)
- `SMTP_*` — SMTP (необязательно) для отправки писем
- `FILES_ROOT` — каталог данных серверов на хосте
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — бустрап‑администратор (необязательно)

## API (кратко)
- `POST /api/auth/register` — регистрация
- `GET  /api/auth/verify-email?token=...` — подтверждение email
- `POST /api/auth/login` — вход (email/username + пароль + 2FA при необходимости)
- `POST /api/auth/refresh` — обновление access токена по refresh (cookie)
- `POST /api/auth/logout` — выход
- `POST /api/auth/2fa/setup|enable|disable` — управление 2FA (требует access)
- `GET  /api/users/me` — профиль
- `GET  /api/users` (ADMIN) — список пользователей
- `PUT  /api/users/:id/roles` (ADMIN) — выдать роли
- `GET  /api/servers` — сервера пользователя
- `POST /api/servers` — создать сервер
- `GET  /api/servers/:id` — детали сервера
- `POST /api/servers/:id/start|stop` — управление контейнером
- `GET  /api/servers/:id/stats` — разовые статусы
- `GET  /api/servers/:id/files` — листинг
- `GET  /api/servers/:id/files/download?path=...` — скачать
- `POST /api/servers/:id/files/upload` — загрузить (multipart)
- `DELETE /api/servers/:id/files?path=...` — удалить

Socket.IO: auth через `auth.token = <access JWT>`, события `watch_server`, `unwatch_server`, ответы `server_stats`.

## Безопасность
- Пароли — bcrypt
- JWT access/refresh, refresh в httpOnly cookie (path `/api/auth`)
- Helmet, CORS (белый список по `BASE_URL`)
- RBAC (ADMIN/MODERATOR/USER)
- Аудит‑лог действий

## Ограничения/заметки
- Управление Minecraft основано на образе `itzg/minecraft-server` и Docker. Порты по умолчанию 25565/tcp, пробрасываются наружу хоста.
- Для продакшн‑нагрузки настройте лимиты CPU/RAM, дисковые квоты, мониторинг Docker‑демона и резервные копии данных (`FILES_ROOT`).

## Лицензия
MIT
