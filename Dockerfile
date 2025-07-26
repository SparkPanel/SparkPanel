# Используем официальный образ PHP
FROM php:8.2-apache

# Устанавливаем рабочую директорию
WORKDIR /var/www/html

# Копируем файлы проекта
COPY . /var/www/html

# Устанавливаем расширения PHP
RUN docker-php-ext-install pdo_mysql mbstring xml curl && \
    docker-php-ext-enable mbstring xml

# Устанавливаем Composer
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Устанавливаем Node.js и Yarn
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g yarn

# Устанавливаем зависимости проекта
RUN composer install --no-dev --optimize-autoloader && \
    yarn install && \
    yarn run build

# Настройка Apache
RUN a2enmod rewrite headers expires mime security2

# Создаем директорию для логов
RUN mkdir -p /var/log/apache2

# Экспозируем порт 80
EXPOSE 80

# Команда по умолчанию
CMD ["apache2-foreground"]