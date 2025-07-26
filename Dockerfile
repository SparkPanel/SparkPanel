# Используем официальный образ PHP
FROM php:8.2-apache

# Устанавливаем рабочую директорию
WORKDIR /var/www/html

# Устанавливаем необходимые пакеты системы
RUN apt-get update && apt-get install -y \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    zip \
    unzip \
    git \
    && docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd \
    && docker-php-ext-enable mbstring xml

# Устанавливаем Composer
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Устанавливаем Node.js и Yarn
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g yarn

# Копируем composer файлы
COPY composer.json composer.json
COPY composer.lock composer.lock

# Устанавливаем зависимости PHP
RUN composer install --no-dev --optimize-autoloader

# Копируем остальные файлы проекта
COPY . /var/www/html

# Устанавливаем зависимости Node.js и собираем фронтенд
RUN yarn install && \
    yarn run build

# Настройка Apache
RUN a2enmod rewrite headers expires mime

# Создаем директорию для логов
RUN mkdir -p /var/log/apache2

# Устанавливаем права доступа
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

# Экспозируем порт 80
EXPOSE 80

# Команда по умолчанию
CMD ["apache2-foreground"]