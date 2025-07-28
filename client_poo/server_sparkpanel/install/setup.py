#!/usr/bin/env python3
"""
Скрипт установки SparkPanel на сервер
"""

import os
import sys
import subprocess
import shutil


def check_root():
    """Проверка, что скрипт запущен от root"""
    if os.geteuid() != 0:
        print("Пожалуйста, запустите скрипт от root")
        sys.exit(1)


def run_command(command):
    """Выполнение команды в shell"""
    try:
        result = subprocess.run(command, shell=True, check=True, 
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, 
                              text=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        raise Exception(f"Ошибка выполнения команды '{command}': {e.stderr}")


def install_lemp_stack():
    """Установка LEMP стека"""
    print("Обновление системы...")
    run_command("apt-get update")
    
    print("Установка LEMP стека...")
    packages = [
        "nginx",
        "php8.2",
        "php8.2-fpm", 
        "php8.2-mysql",
        "php8.2-xml",
        "php8.2-curl",
        "mysql-server",
        "composer",
        "ufw"
    ]
    
    run_command(f"apt-get install -y {' '.join(packages)}")


def start_services():
    """Запуск и включение сервисов"""
    print("Запуск сервисов...")
    services = ["nginx", "mysql"]
    
    for service in services:
        run_command(f"systemctl start {service}")
        run_command(f"systemctl enable {service}")


def setup_directories():
    """Создание необходимых директорий"""
    print("Создание директорий...")
    directories = [
        "/var/www/sparkpanel/public/assets",
        "/var/www/sparkpanel/app",
        "/var/www/sparkpanel/config",
        "/var/www/sparkpanel/install"
    ]
    
    for directory in directories:
        os.makedirs(directory, exist_ok=True)


def setup_permissions():
    """Настройка прав доступа"""
    print("Настройка прав доступа...")
    run_command("chown -R www-data:www-data /var/www/sparkpanel")
    run_command("chmod -R 755 /var/www/sparkpanel")


def setup_nginx():
    """Настройка Nginx"""
    print("Настройка Nginx...")
    
    nginx_config = '''
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
'''
    
    with open('/etc/nginx/sites-available/sparkpanel', 'w') as f:
        f.write(nginx_config)
    
    # Активируем сайт
    run_command("ln -sf /etc/nginx/sites-available/sparkpanel /etc/nginx/sites-enabled/")
    run_command("rm -f /etc/nginx/sites-enabled/default")
    
    # Проверяем конфигурацию и перезагружаем Nginx
    run_command("nginx -t")
    run_command("systemctl reload nginx")


def setup_security():
    """Настройка базовой безопасности"""
    print("Настройка брандмауэра...")
    try:
        run_command("ufw allow OpenSSH")
        run_command("ufw allow 'Nginx Full'")
        run_command("echo 'y' | ufw enable")
    except Exception as e:
        print(f"Предупреждение: проблемы с настройкой брандмауэра: {e}")
    
    # Установка fail2ban
    print("Установка fail2ban...")
    try:
        run_command("apt-get install -y fail2ban")
        run_command("systemctl start fail2ban")
        run_command("systemctl enable fail2ban")
    except Exception as e:
        print(f"Предупреждение: проблемы с установкой fail2ban: {e}")


def main():
    """Основная функция установки"""
    print("Начало установки SparkPanel...")
    
    try:
        check_root()
        install_lemp_stack()
        start_services()
        setup_directories()
        setup_permissions()
        setup_nginx()
        setup_security()
        
        print("\nУстановка SparkPanel успешно завершена!")
        print("\nДля доступа к панели:")
        print("1. Откройте в браузере IP-адрес вашего сервера")
        print("2. Используйте учетные данные по умолчанию:")
        print("   Логин: admin")
        print("   Пароль: admin")
        print("\nВ целях безопасности рекомендуется изменить пароль после первого входа.")
        
    except Exception as e:
        print(f"Ошибка установки: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()