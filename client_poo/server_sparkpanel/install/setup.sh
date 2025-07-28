#!/bin/bash

# Скрипт установки SparkPanel
# Поддерживаемые ОС: Ubuntu 20.04+

echo "Начинаем установку SparkPanel..."

# Проверяем, что скрипт запущен от root
if [ "$EUID" -ne 0 ]
  then echo "Пожалуйста, запустите этот скрипт от root"
  exit
fi

# Определяем ОС
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
else
    echo "Не удалось определить операционную систему"
    exit 1
fi

echo "Обнаружена ОС: $OS $VER"

# Обновляем систему
echo "Обновляем систему..."
apt-get update

# Устанавливаем необходимые пакеты
echo "Устанавливаем LEMP стек..."
apt-get install -y nginx php8.2 php8.2-fpm php8.2-mysql php8.2-xml php8.2-curl mysql-server composer ufw

# Запускаем и включаем сервисы
echo "Запускаем сервисы..."
systemctl start nginx
systemctl start mysql
systemctl enable nginx
systemctl enable mysql

# Создаем базу данных и пользователя
echo "Создаем базу данных..."
mysql -e "CREATE DATABASE IF NOT EXISTS sparkpanel;"
mysql -e "CREATE USER IF NOT EXISTS 'sparkpanel_user'@'localhost' IDENTIFIED BY 'secure_password_2025';"
mysql -e "GRANT ALL PRIVILEGES ON sparkpanel.* TO 'sparkpanel_user'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

# Настраиваем веб-сервер
echo "Настраиваем Nginx..."
cat > /etc/nginx/sites-available/sparkpanel << 'EOF'
server {
    listen 80;
    server_name localhost;
    root /var/www/sparkpanel/public;
    index index.php;

    # Защита от прямого доступа к файлам
    location ~ ^/assets/ {
        allow all;
    }

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        
        # Добавляем заголовок User-Agent для проверки
        fastcgi_param HTTP_USER_AGENT $http_user_agent;
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
}
EOF

# Активируем сайт
ln -sf /etc/nginx/sites-available/sparkpanel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# Настраиваем права доступа
echo "Настраиваем права доступа..."
chown -R www-data:www-data /var/www/sparkpanel
chmod -R 755 /var/www/sparkpanel

# Настраиваем брандмауэр
echo "Настраиваем брандмауэр..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
echo "y" | ufw enable

# Устанавливаем fail2ban для дополнительной безопасности
echo "Устанавливаем fail2ban..."
apt-get install -y fail2ban
systemctl start fail2ban
systemctl enable fail2ban

echo "Установка SparkPanel завершена!"
echo ""
echo "Для доступа к панели используйте клиентское приложение Poo"
echo "Учетные данные по умолчанию:"
echo "  Логин: admin"
echo "  Пароль: admin"
echo ""
echo "В целях безопасности рекомендуется изменить пароль после первого входа"