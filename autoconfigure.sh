#!/bin/bash

# Переход в директорию проекта
cd /var/www/html || exit

# Проверка наличия .env файла
if [ ! -f .env ]; then
    cp .env.example .env
fi

# Генерация ключа, если его нет
if [ ! -f bootstrap/cache/config.php ]; then
    php artisan key:generate
fi

# Запуск миграций
php sparkpanel migrate

# Запуск контейнеров Docker
docker-compose up -d