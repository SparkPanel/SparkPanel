[![i-1-png-(1).png](https://i.postimg.cc/htcDhVpt/i-1-png-(1).png)](https://postimg.cc/0bXRBMTT)

# SparkPanel

**Панель управления игровыми серверами**

**Версия: beta 1.0.0**

## Плагины

SparkPanel поддерживает систему плагинов для расширения функциональности. Пользователи могут создавать и загружать собственные плагины через веб-интерфейс.

**Поддерживаемые типы плагинов:**
- JavaScript/TypeScript (`.js`, `.ts`)
- Python (`.py`)
- Java (`.jar`)

**Документация:** См. `PLUGINS_README.md` для подробной документации по созданию плагинов.

**Примеры плагинов:** См. папку `plugins/example-plugin/` для примера.

---

## Установка на VDS (Ubuntu 20.04+)

### Шаг 0. Подключитесь к серверу по SSH

```bash
ssh root@ВАШ_IP
```

---

### Шаг 1. Установите Node.js 18

```bash
sudo apt update
sudo apt install -y curl git build-essential

curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка
node --version   # должно быть 18.x или выше
npm --version    # должно быть 8.x или выше
```

---

### Шаг 2. Установите Docker

```bash
sudo apt install -y ca-certificates gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Запуск и автозапуск Docker
sudo systemctl start docker
sudo systemctl enable docker

# Проверка
docker --version   # должно быть 20.10 или выше
```

---

### Шаг 3. Скачайте SparkPanel

```bash
cd /opt
sudo git clone https://github.com/SparkPanel/SparkPanel.git
sudo chown -R $USER:$USER /opt/SparkPanel
cd /opt/SparkPanel
```

---

### Шаг 4. Установите зависимости и соберите приложение

```bash
npm install
npm run build
```

Это создаст папку `dist/` с готовым приложением.

---

### Шаг 5. Создайте файл `.env`

```bash
nano /opt/SparkPanel/.env
```

Вставьте следующее:

```env
# Обязательно: секрет для сессий (сгенерируй и вставь свой)
SESSION_SECRET=СЮДА_ВСТАВИТЬ_СЕКРЕТ

# Режим: production
NODE_ENV=production

# Порт (по умолчанию 5000)
PORT=5000

# Если используешь Nginx+HTTPS — раскомментируй:
# FORCE_HTTPS=true

# Если используешь PostgreSQL — раскомментируй и укажи свои данные:
# DATABASE_URL=postgresql://user:password@localhost:5432/sparkpanel
```

Сгенерируй SESSION_SECRET этой командой и скопируй результат:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### Шаг 6. Дай доступ к Docker

```bash
sudo usermod -aG docker $USER
newgrp docker

# Проверка (должно работать без sudo)
docker ps
```

---

### Шаг 7. Запустите SparkPanel

```bash
cd /opt/SparkPanel
npm start
```

Панель откроется по адресу: `http://ВАШ_IP:5000`

**Данные для входа по умолчанию:**
- Логин: `adplayer`
- Пароль: `0000`

> ⚠️ Сразу после входа смените пароль в настройках!

---

### Шаг 8. Автозапуск через systemd (рекомендуется)

Создай файл сервиса:

```bash
sudo nano /etc/systemd/system/sparkpanel.service
```

Вставь:

```ini
[Unit]
Description=SparkPanel Game Server Management
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/SparkPanel
EnvironmentFile=/opt/SparkPanel/.env
ExecStart=/usr/bin/node /opt/SparkPanel/dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Включи и запусти:

```bash
sudo systemctl daemon-reload
sudo systemctl enable sparkpanel
sudo systemctl start sparkpanel

# Проверка статуса
sudo systemctl status sparkpanel

# Просмотр логов
sudo journalctl -u sparkpanel -f
```

---

### Шаг 9. Nginx + HTTPS (рекомендуется для домена)

Установи Nginx:

```bash
sudo apt install -y nginx
```

Создай конфиг:

```bash
sudo nano /etc/nginx/sites-available/sparkpanel
```

Вставь (замени `your-domain.com`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

Активируй и проверь:

```bash
sudo ln -s /etc/nginx/sites-available/sparkpanel /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Получи SSL-сертификат (бесплатно от Let's Encrypt):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

После получения сертификата добавь в `.env`:

```env
FORCE_HTTPS=true
```

И перезапусти SparkPanel:

```bash
sudo systemctl restart sparkpanel
```

---

## Обновление до новой версии

```bash
cd /opt/SparkPanel
git pull
npm install
npm run build
sudo systemctl restart sparkpanel
```

---

## Устранение неполадок

### SparkPanel не запускается

```bash
# Посмотреть логи
sudo journalctl -u sparkpanel -n 50

# Проверить Docker
sudo systemctl status docker

# Проверить что порт свободен
sudo lsof -i :5000
```

### Ошибка доступа к Docker

```bash
# Проверить права
ls -l /var/run/docker.sock

# Добавить пользователя в группу docker
sudo usermod -aG docker $USER
newgrp docker
```

### Ошибки 401 (не авторизован) при входе

- Если используешь Nginx с HTTPS: убедись что `FORCE_HTTPS=true` в `.env`
- Если используешь HTTP напрямую: `FORCE_HTTPS` должно быть `false` или не указано
- Попробуй очистить куки браузера

### Порт 5000 занят

```bash
# Используй другой порт — в .env измени:
PORT=8080
```

---

## Системные требования

| Компонент | Минимум |
|-----------|---------|
| ОС | Ubuntu 20.04+ / Debian 11+ |
| CPU | 1 ядро |
| RAM | 512 MB |
| Docker | 20.10+ |
| Node.js | 18+ |
| NPM | 8+ |

---

## Поддержка

- GitHub Issues: https://github.com/SparkPanel/SparkPanel/issues
