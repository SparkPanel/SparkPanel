# 🌟 SparkPanel

> Современная, бесплатная панель управления игровыми серверами с открытым исходным кодом

![SparkPanel Screenshot](https://i.postimg.cc/Qxr23SM0/photo-2025-07-25-13-34-57.jpg)

## Описание

SparkPanel - это современная, бесплатная панель управления игровыми серверами с открытым исходным кодом, которая обеспечивает безопасную и интуитивно понятную среду для управления игровыми серверами. Панель предлагает:

- **Современный интерфейс** с поддержкой темной и светлой тем
- **Интуитивно понятное управление** игровыми серверами
- **Расширенные функции мониторинга ресурсов**
- **Гибкую систему пользовательских прав**
- **Поддержку плагинов и расширений**
- **Многоязычный интерфейс**

## Требования к системе

| Компонент              | Минимальные требования      | Рекомендуемые требования     |
|-----------------------|-----------------------------|----------------------------|
| Операционная система   | Ubuntu 20.04 или новее      | Ubuntu 22.04 LTS           |
| PHP                   | 8.1                         | 8.2                        |
| MySQL/MariaDB          | 5.6+                        | 10.5+                      |
| Веб-сервер             | Apache с mod_rewrite        | Nginx                      |
| Composer              | 2.0+                        | 2.0+                       |
| Node.js               | 16.x                        | 18.x                       |
| Yarn                  | 1.22+                       | 1.22+                      |
| Docker (опционально)    | -                           | Рекомендуется для изоляции игровых серверов |


## 📦 Установка на VDS (Ubuntu 22.04)

### Шаг 1: Обновление системы
```bash
sudo apt update && sudo apt upgrade -y
```

### Шаг 2: Установка необходимых утилит
```bash
sudo apt install -y git curl wget unzip
```

### Шаг 3: Установка PHP и необходимых расширений
```bash
# Добавляем репозиторий PHP
sudo add-apt-repository ppa:ondrej/php -y
sudo apt update

# Устанавливаем PHP
sudo apt install -y php php-cli php-mysql php-curl php-gd php-mbstring php-xml php-zip

# Проверяем версию PHP
php -v
```

### Шаг 4: Установка Composer
```bash
# Скачиваем Composer
cd ~
curl -sS https://getcomposer.org/installer | php

# Перемещаем Composer в системную директорию
sudo mv composer.phar /usr/local/bin/composer

# Проверяем установку
composer --version
```

### Шаг 5: Установка Node.js и Yarn
```bash
# Устанавливаем Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Устанавливаем Yarn
sudo npm install -g yarn

# Проверяем установку
node -v
yarn -v
```

### Шаг 6: Установка Docker и Docker Compose
```bash
# Устанавливаем Docker
sudo apt install -y docker.io

# Устанавливаем Docker Compose
DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep -o '"tag_name": ".*"' | cut -d '"' -f 4)
sudo curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Проверяем установку
docker --version
docker-compose --version
```

### Шаг 7: Клонирование репозитория
```bash
# Клонируем репозиторий
git clone https://github.com/SparkPanel
/SparkPanel.git
cd SparkPanel
```

### Шаг 8: Установка зависимостей
```bash
# Устанавливаем PHP зависимости
composer install --no-dev --optimize-autoloader

# Устанавливаем JS зависимости
yarn install --frozen-lockfile

# Собираем frontend
yarn run build:production
```

### Шаг 9: Настройка окружения
```bash
# Копируем .env файл
cp .env.example .env

# Генерируем ключ приложения
php sparkpanel key:generate
```

### Шаг 10: Миграция базы данных
```bash
# Выполняем миграцию
php sparkpanel migrate
```

### Шаг 11: Запуск контейнеров
```bash
# Запускаем контейнеры
docker-compose up -d
```

## ⚠️ Важные предупреждения

> Для доступа к панели после установки используйте `http://ваш_сервер_ip:8080`
