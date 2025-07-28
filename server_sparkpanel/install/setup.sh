#!/bin/bash

# Скрипт установки SparkPanel

# Проверка, что скрипт запущен от root
if [ "$EUID" -ne 0 ]
  then echo "Пожалуйста, запустите скрипт от root"
  exit
fi

echo "Начало установки SparkPanel..."

# Обновление системы
echo "Обновление системы..."
apt-get update

# Установка необходимых пакетов
echo "Установка LEMP стека..."
apt-get install -y nginx php8.2 php8.2-fpm php8.2-mysql php8.2-xml php8.2-curl mysql-server composer ufw cron

# Запуск и включение сервисов
echo "Запуск сервисов..."
systemctl start nginx
systemctl start mysql
systemctl enable nginx
systemctl enable mysql

# Создание директории для веб-файлов
echo "Создание директории для веб-файлов..."
mkdir -p /var/www/sparkpanel
mkdir -p /var/www/sparkpanel/logs
mkdir -p /var/www/sparkpanel/cache
mkdir -p /var/www/sparkpanel/backups
mkdir -p /var/www/sparkpanel/cron

# Копирование файлов панели (в реальной реализации они будут скопированы из архива)
echo "Развертывание файлов панели..."
# cp -r /tmp/sparkpanel/* /var/www/sparkpanel/

# Настройка прав доступа
echo "Настройка прав доступа..."
chown -R www-data:www-data /var/www/sparkpanel
chmod -R 755 /var/www/sparkpanel
chmod -R 775 /var/www/sparkpanel/logs
chmod -R 775 /var/www/sparkpanel/cache
chmod -R 775 /var/www/sparkpanel/backups

# Настройка cron задач
echo "Настройка cron задач..."
cat > /etc/cron.d/sparkpanel << EOF
# SparkPanel cron jobs
* * * * * www-data /usr/bin/php /var/www/sparkpanel/cron/process_jobs.php >> /var/www/sparkpanel/logs/cron.log 2>&1
0 * * * * www-data /usr/bin/php /var/www/sparkpanel/cron/hourly_stats.php >> /var/www/sparkpanel/logs/cron.log 2>&1
0 0 * * * www-data /usr/bin/php /var/www/sparkpanel/cron/daily_cleanup.php >> /var/www/sparkpanel/logs/cron.log 2>&1
EOF

chmod 0644 /etc/cron.d/sparkpanel
systemctl restart cron

# Настройка Nginx
echo "Настройка Nginx..."
cat > /etc/nginx/sites-available/sparkpanel << EOF
server {
    listen 80;
    server_name _;
    root /var/www/sparkpanel/public;
    index index.php index.html;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        include fastcgi_params;
        
        # Добавляем заголовок User-Agent для проверки
        fastcgi_param HTTP_USER_AGENT \$http_user_agent;
    }

    # Запрет доступа к чувствительным файлам
    location ~ /\. {
        deny all;
    }

    location ~ \.php~$ {
        deny all;
    }

    location ~ ~$ {
        deny all;
    }
    
    # Запрет доступа к конфигурационным файлам
    location ~ \.(env|config|ini)$ {
        deny all;
    }
    
    # Запрет доступа к директориям логов и кэша
    location ~ /(logs|cache|backups)/ {
        deny all;
    }
}
EOF

ln -sf /etc/nginx/sites-available/sparkpanel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Проверяем конфигурацию и перезагружаем Nginx
nginx -t
systemctl reload nginx

# Настройка базы данных
echo "Настройка базы данных..."
mysql -e "CREATE DATABASE IF NOT EXISTS sparkpanel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS 'sparkpanel'@'localhost' IDENTIFIED BY 'password';"
mysql -e "GRANT ALL PRIVILEGES ON sparkpanel.* TO 'sparkpanel'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

# Инициализация таблиц
echo "Инициализация таблиц..."
# php /var/www/sparkpanel/config/db.php

# Настройка брандмауэра
echo "Настройка брандмауэра..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
echo 'y' | ufw enable

# Установка fail2ban
echo "Установка fail2ban..."
apt-get install -y fail2ban
systemctl start fail2ban
systemctl enable fail2ban

echo "Установка SparkPanel успешно завершена!"
echo ""
echo "Для доступа к панели:"
echo "1. Откройте в браузере IP-адрес вашего сервера"
echo "2. Используйте учетные данные по умолчанию:"
echo "   Логин: admin"
echo "   Пароль: admin"
echo ""
echo "В целях безопасности рекомендуется изменить пароль после первого входа."