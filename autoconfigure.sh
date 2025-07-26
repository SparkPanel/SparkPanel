#!/bin/bash

# Переход в директорию проекта
cd /var/www/html || exit

# Проверка наличия .env файла
if [ ! -f .env ]; then
    cp .env.example .env
    
    # Установка базовых значений для переменных окружения
    sed -i 's/DB_HOST=127.0.0.1/DB_HOST=mariadb/g' .env
    sed -i 's/DB_PORT=3306/DB_PORT=3306/g' .env
    sed -i 's/DB_DATABASE=SparkPanel/DB_DATABASE=sparkpanel/g' .env
    sed -i 's/DB_USERNAME=SparkPanel/DB_USERNAME=sparkpanel/g' .env
    sed -i 's/DB_PASSWORD=/DB_PASSWORD=secret/g' .env
    
    # Установка драйверов кэша и сессий
    sed -i 's/CACHE_DRIVER=file/CACHE_DRIVER=redis/g' .env
    sed -i 's/SESSION_DRIVER=file/SESSION_DRIVER=redis/g' .env
    sed -i 's/QUEUE_DRIVER=sync/QUEUE_DRIVER=redis/g' .env
    
    # Настройка Redis
    sed -i 's/REDIS_HOST=127.0.0.1/REDIS_HOST=redis/g' .env
    sed -i 's/REDIS_PASSWORD=null/REDIS_PASSWORD=null/g' .env
    sed -i 's/REDIS_PORT=6379/REDIS_PORT=6379/g' .env
fi

# Генерация ключа приложения
php sparkpanel key:generate

# Установка прав доступа
chmod -R 755 storage bootstrap/cache

# Запуск миграций
php sparkpanel migrate --force

# Запуск контейнеров Docker
docker-compose up -d