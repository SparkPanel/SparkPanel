<?php

// SparkPanel автозагрузка классов

if (!defined('SPARKPANEL_PATH')) {
    exit('Прямой доступ запрещен');
}

// Регистрация автозагрузчика
spl_autoload_register(function ($class) {
    // Базовое пространство имен SparkPanel
    $prefix = 'SparkPanel\';
    
    // Базовая директория для SparkPanel
    $base_dir = SPARKPANEL_PATH . '/';
    
    // Проверяем, начинается ли класс с префикса SparkPanel
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }
    
    // Получаем относительное имя класса
    $relative_class = substr($class, $len);
    
    // Заменяем разделители пространства имен на разделители директорий
    // и добавляем .php в конец
    $file = $base_dir . str_replace('\', '/', $relative_class) . '.php';
    
    // Если файл существует, загружаем его
    if (file_exists($file)) {
        require_once $file;
    }
});