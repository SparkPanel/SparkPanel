# SparkPanel

[![SparkPanel Logo](https://i.postimg.cc/cHGpXrhV/photo-2025-07-24-16-01-52.png)](https://postimg.cc/5HpKt9Z3)

SparkPanel — это современная бесплатная панель управления игровыми серверами с открытым исходным кодом, которая обеспечивает безопасную и интуитивно понятную среду для управления игровыми серверами.

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
- 2–4 ГБ RAM минимум для одного Minecraft‑сервера (рекомендуется ≥ 4 ГБ)

---

## Быстрый старт (5–10 минут, DEV)
1) Установите Docker и Node 20 (см. ниже «Установка на Ubuntu»).
2) Клонируйте и откройте проект:
```bash
git clone https://SparkPanel/SparkPanel.git
cd SparkPanel
```
3) Поднимите PostgreSQL:
```bash
sudo docker compose up -d postgres
```
4) Настройте `backend/.env` (скопируйте из `.env.example` и задайте JWT секреты). При желании добавьте `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
5) Создайте папку для данных серверов и права:
```bash
sudo mkdir -p /var/lib/sparkpanel/servers
sudo chown -R $USER:$USER /var/lib/sparkpanel/servers
```
6) Backend: установка и миграции
```bash
cd backend
npm install --no-fund --no-audit
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```
7) Frontend (в новом терминале):
```bash
cd ../frontend
npm install --no-fund --no-audit
npm run dev
```
Откройте `http://localhost:5173`.

---

## Установка на Ubuntu 22.04 (подробно, VDS IP)
Предположим, IP вашего VDS: `203.0.113.10`. Везде ниже подставляйте свой реальный IP/домен.

### 1) Docker
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```
Проверьте: `docker --version`.

### 2) Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential
node -v
```

### 3) Клонирование
```bash
git clone https://your.repo/SparkPanel.git
cd SparkPanel
```

### 4) PostgreSQL (docker-compose)
```bash
sudo docker compose up -d postgres
```
Проверьте: `docker ps` (контейнер postgres должен работать).

### 5) Конфиг backend
```bash
cp backend/.env.example backend/.env
nano backend/.env
```
Заполните как минимум:
- `DATABASE_URL` (оставьте из compose по умолчанию)
- `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` (случайные строки)
- `BASE_URL` — `http://203.0.113.10:5173` (или домен)
- `API_BASE_URL` — `http://203.0.113.10:8080` (или домен)
- Опционально `ADMIN_EMAIL`, `ADMIN_PASSWORD` для автосоздания админа

Создайте `FILES_ROOT` и права:
```bash
sudo mkdir -p /var/lib/sparkpanel/servers
sudo chown -R $USER:$USER /var/lib/sparkpanel/servers
```

### 6) Установка/миграции backend
```bash
cd backend
npm install --no-fund --no-audit
npx prisma generate
npx prisma migrate deploy
```

### 7) Запуск backend
```bash
npm run dev
```
Backend: `http://203.0.113.10:8080`.

### 8) Запуск frontend (с доступом по IP)
В другом терминале:
```bash
cd ../frontend
npm install --no-fund --no-audit
npm run dev  # уже запускается с --host
```
Frontend: `http://203.0.113.10:5173`.

Если используете домен — укажите его вместо IP в `BASE_URL`/`API_BASE_URL` и настройте DNS A‑запись.

### 9) Firewall (UFW)
```bash
sudo ufw allow OpenSSH
sudo ufw allow 5173
sudo ufw allow 8080
sudo ufw allow 25565/tcp  # для Minecraft
sudo ufw enable
sudo ufw status
```

> ВАЖНО: значения по умолчанию `BASE_URL=http://localhost:5173` и `API_BASE_URL=http://localhost:8080` предназначены ТОЛЬКО для локальной разработки. На VDS всегда задавайте эти переменные на IP/домен сервера — иначе фронтенд/Socket.IO и ссылки из писем могут работать некорректно.

---

## Переменные окружения (backend/.env)
Обязательные/важные:
- `PORT` — порт API (по умолчанию 8080)
- `BASE_URL` — URL фронтенда (CORS и Socket.IO)
- `API_BASE_URL` — публичный URL backend (используется в ссылках email)
- `DATABASE_URL` — строка подключения к PostgreSQL
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — секреты JWT
- `FILES_ROOT` — каталог данных серверов на хосте

Дополнительно:
- Квоты диска: `DISK_QUOTA_ENFORCE=true|false`, `DISK_QUOTA_DEFAULT_MB=10240`
- Ретеншн бэкапов: `BACKUP_RETENTION_DAYS=14`, `BACKUP_RETENTION_MAX=10`
- S3 бэкапы: `S3_ENABLED=true|false`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_SSE` (опц.), `S3_PATH_STYLE=true|false`
- SMTP (опц.): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Bootstrap‑админ (опц.): `ADMIN_EMAIL`, `ADMIN_PASSWORD`

> Рекомендация для продакшна: всегда явно задавайте `BASE_URL` и `API_BASE_URL` (IP/домен с протоколом http/https). Даже если локальные дефолты работают, они могут ломать CORS, Socket.IO и ссылки из email.

---

## Создание пользователей и администратора
- Админ: укажите `ADMIN_EMAIL`/`ADMIN_PASSWORD` в `backend/.env` до первого запуска backend — админ создастся автоматически.
- Пользователь: зарегистрируйтесь на `/register`, подтвердите email, войдите.
- Роли: войдите под админом → «Админ → Пользователи» → отметьте роли.

Без SMTP в DEV можно подтвердить email вручную: возьмите токен из таблицы `EmailVerificationToken` и вызовите:
```
GET {API_BASE_URL}/api/auth/verify-email?token=...
```

### Создание через SSH (CLI)
См. раздел «Создание пользователя через SSH (CLI)» ниже — готовые однострочники `node -e` для: создать пользователя, выдать ADMIN, сбросить пароль.

### Быстрый CLI для пользователей
После установки зависимостей (в каталоге `backend`):
```bash
# создать пользователя (email подтвердится автоматически)
node scripts/user.mjs create --email user@example.com --username user1 --password StrongPass123

# выдать ADMIN существующему пользователю
node scripts/user.mjs admin --login user@example.com

# сбросить пароль
node scripts/user.mjs reset-password --login user@example.com --password NewStrongPass123
```

---

## Продакшн установка (с SSL, nginx, systemd)

### Сборка
```bash
# backend
cd backend
npm install --no-fund --no-audit
npx prisma generate
npx prisma migrate deploy
npm run build

# frontend
cd ../frontend
npm install --no-fund --no-audit
npm run build
```

### systemd unit (backend)
Создайте `/etc/systemd/system/sparkpanel-backend.service`:
```ini
[Unit]
Description=SparkPanel Backend
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/SparkPanel/backend
Environment=NODE_ENV=production
EnvironmentFile=/opt/SparkPanel/backend/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```
Команды:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sparkpanel-backend
sudo systemctl status sparkpanel-backend
```

### nginx (один домен, фронтенд + прокси API)
Предположим домен `panel.example.com`, фронтенд файлы в `/opt/SparkPanel/frontend/dist`:
```nginx
server {
  listen 80;
  server_name panel.example.com;
  root /opt/SparkPanel/frontend/dist;
  index index.html;

  location /api {
    proxy_pass http://127.0.0.1:8080/api;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /socket.io/ {
    proxy_pass http://127.0.0.1:8080/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
  }

  location / {
    try_files $uri /index.html;
  }
}
```
SSL (Let's Encrypt):
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d panel.example.com --agree-tos -m you@example.com --redirect
```

### Firewall (UFW)
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
# для Minecraft-серверов (пример стандартного порта)
sudo ufw allow 25565/tcp
sudo ufw enable
sudo ufw status
```

### Переменные окружения (прод)
- `BASE_URL=https://panel.example.com`
- `API_BASE_URL=https://panel.example.com`
- корректные `JWT_*` и `DATABASE_URL`
- `FILES_ROOT` должен существовать и быть доступным пользователю сервиса


## Обновление панели
```bash
cd /opt/SparkPanel
git pull
cd backend
npm install --no-fund --no-audit
npx prisma migrate deploy
npm run build
sudo systemctl restart sparkpanel-backend

cd ../frontend
npm install --no-fund --no-audit
npm run build
# статика nginx уже указывает на dist, перезапуск nginx не обязателен
```

## Резервные копии и восстановление
- БД PostgreSQL:
```bash
# backup
docker exec -t <postgres_container> pg_dump -U postgres sparkpanel > /opt/backups/sparkpanel_$(date +%F).sql
# restore
cat /opt/backups/sparkpanel_X.sql | docker exec -i <postgres_container> psql -U postgres -d sparkpanel
```
- Данные серверов (`FILES_ROOT`):
```bash
sudo tar -czf /opt/backups/sparkpanel_files_$(date +%F).tar.gz -C /var/lib/sparkpanel servers
```

## Траблшутинг (частые ошибки)
- Docker не запущен: `sudo systemctl status docker`
- «port is already allocated»: порт сервера занят — измените порт при создании
- Нет доступа к `FILES_ROOT`: проверьте владельца/права для пользователя, под которым работает сервис
- Не приходят письма: настройте SMTP в `.env` или подтвердите email вручную (см. выше)
- CORS/Socket.IO: убедитесь, что `BASE_URL`/`API_BASE_URL` выставлены на реальные домены
- 401 при refresh: проверьте httpOnly cookie, домен/путь `/api/auth`, `sameSite` в случае кросс‑домена

## Безопасность и лучшие практики
- Меняйте JWT‑секреты, не храните их в репозитории
- Включайте HTTPS, обновляйте сертификаты
- Ограничивайте доступ к серверу по SSH‑ключам, включите UFW
- Делайте регулярные бэкапы БД и файлов
- Задавайте лимиты CPU/RAM у контейнеров серверов, следите за диском

## Удаление
```bash
# остановка backend
sudo systemctl stop sparkpanel-backend && sudo systemctl disable sparkpanel-backend
sudo rm -f /etc/systemd/system/sparkpanel-backend.service && sudo systemctl daemon-reload
# postgres из compose
cd /opt/SparkPanel && sudo docker compose down -v
# файлы
sudo rm -rf /var/lib/sparkpanel/servers
```
