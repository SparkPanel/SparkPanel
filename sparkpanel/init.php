<?php

// SparkPanel инициализационный файл

// Определение констант
if (!defined('SPARKPANEL_VERSION')) {
    define('SPARKPANEL_VERSION', '1.0.0');
}

if (!defined('SPARKPANEL_PATH')) {
    define('SPARKPANEL_PATH', __DIR__);
}

// Автозагрузка классов
require_once SPARKPANEL_PATH . '/core/autoload.php';

// Запуск приложения
try {
    $app = new \SparkPanel\Application();
    $app->run();
} catch (Exception $e) {
    echo 'Ошибка: ' . $e->getMessage();
    exit(1);
}