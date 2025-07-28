#!/usr/bin/env php
<?php
/**
 * Скрипт ежедневной очистки SparkPanel
 * 
 * Этот скрипт должен запускаться по крону каждый день:
 * 0 0 * * * * /usr/bin/php /var/www/sparkpanel/cron/daily_cleanup.php >> /var/www/sparkpanel/logs/cron.log 2>&1
 */

// Подключаем необходимые файлы
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../app/server_manager.php';
require_once __DIR__ . '/../app/logger.php';
require_once __DIR__ . '/../app/cache.php';

try {
    // Подключаемся к базе данных
    $db = getDBConnection();
    
    // Создаем менеджер серверов
    $serverManager = new ServerManager($db);
    
    // Создаем логгер
    $logger = new Logger($db);
    
    // Создаем кэш
    $cache = new Cache();
    
    // Очищаем старые метрики производительности (оставляем данные за 30 дней)
    $deletedMetrics = $serverManager->cleanupPerformanceMetrics(30);
    
    // Очищаем старые логи аудита (оставляем данные за 30 дней)
    $deletedLogs = 0;
    if (isset($logger)) {
        $deletedLogs = $logger->cleanupLogs(30);
    }
    
    // Очищаем кэш
    $cache->clear();
    
    // Записываем в лог
    $logger->info("Ежедневная очистка выполнена", [
        'deleted_metrics' => $deletedMetrics,
        'deleted_logs' => $deletedLogs
    ]);
    
    echo date('Y-m-d H:i:s') . " - Ежедневная очистка выполнена\n";
    echo "Удалено метрик: " . ($deletedMetrics ?: 0) . "\n";
    echo "Удалено логов: " . ($deletedLogs ?: 0) . "\n";
    
} catch (Exception $e) {
    // Записываем ошибку в лог
    if (isset($logger)) {
        $logger->error("Ошибка в скрипте ежедневной очистки", ['error' => $e->getMessage()]);
    }
    
    echo date('Y-m-d H:i:s') . " - Ошибка: " . $e->getMessage() . "\n";
    exit(1);
}