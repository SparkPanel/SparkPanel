# Используем официальный образ PHP
FROM php:8.2-apache

# Устанавливаем рабочую директорию
WORKDIR /var/www/html

# Устанавливаем системные зависимости
RUN apt-get update && apt-get install -y \
    git \
    unzip \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    libwebp-dev \
    libzip-dev \
    curl \
    libonig-dev # Для поддержки mbstring

# Копируем файлы проекта
COPY . /var/www/html

# Устанавливаем расширения PHP
RUN docker-php-ext-install pdo_mysql mbstring xml curl && \
    docker-php-ext-enable mbstring xml
