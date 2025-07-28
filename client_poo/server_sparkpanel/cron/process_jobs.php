#!/usr/bin/env php
<?php
/**
 * Скрипт фоновой обработки задач SparkPanel
 * 
 * Этот скрипт должен запускаться по крону каждую минуту:
 * * * * * * /usr/bin/php /var/www/sparkpanel/cron/process_jobs.php >> /var/www/sparkpanel/logs/cron.log 2>&1
 */

// Подключаем необходимые файлы
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../app/server_manager.php';
require_once __DIR__ . '/../app/background_jobs.php';
require_once __DIR__ . '/../app/logger.php';

try {
    // Подключаемся к базе данных
    $db = getDBConnection();
    
    // Создаем менеджер серверов
    $serverManager = new ServerManager($db);
    
    // Создаем логгер
    $logger = new Logger($db);
    
    // Обрабатываем ожидающие задачи
    $processed = $serverManager->processBackgroundJobs(5);
    
    // Записываем в лог
    if ($processed > 0) {
        $logger->info("Фоновые задачи обработаны", ['processed' => $processed]);
        echo date('Y-m-d H:i:s') . " - Обработано задач: $processed\n";
    }
    
} catch (Exception $e) {
    // Записываем ошибку в лог
    if (isset($logger)) {
        $logger->error("Ошибка в скрипте фоновой обработки", ['error' => $e->getMessage()]);
    }
    
    echo date('Y-m-d H:i:s') . " - Ошибка: " . $e->getMessage() . "\n";
    exit(1);
}