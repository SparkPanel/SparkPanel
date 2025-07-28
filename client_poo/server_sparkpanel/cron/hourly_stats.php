#!/usr/bin/env php
<?php
/**
 * Скрипт ежечасового сбора статистики SparkPanel
 * 
 * Этот скрипт должен запускаться по крону каждый час:
 * 0 * * * * * /usr/bin/php /var/www/sparkpanel/cron/hourly_stats.php >> /var/www/sparkpanel/logs/cron.log 2>&1
 */

// Подключаем необходимые файлы
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../app/server_manager.php';
require_once __DIR__ . '/../app/logger.php';
require_once __DIR__ . '/../app/monitoring.php';

try {
    // Подключаемся к базе данных
    $db = getDBConnection();
    
    // Создаем менеджер серверов
    $serverManager = new ServerManager($db);
    
    // Создаем логгер
    $logger = new Logger($db);
    
    // Создаем монитор
    $monitor = new ServerMonitor($db);
    
    // Собираем статистику системы
    $stats = $monitor->getSystemStats();
    $cpuUsage = $stats['cpu_usage'];
    $memoryUsage = $stats['memory_usage'];
    $diskUsage = $stats['disk_usage'];
    
    // Сохраняем метрики производительности
    $serverManager->addPerformanceMetric('cpu_usage', $cpuUsage);
    $serverManager->addPerformanceMetric('memory_usage', $memoryUsage);
    $serverManager->addPerformanceMetric('disk_usage', $diskUsage);
    
    // Записываем в лог
    $logger->info("Ежечасовая статистика собрана", [
        'cpu_usage' => $cpuUsage,
        'memory_usage' => $memoryUsage,
        'disk_usage' => $diskUsage
    ]);
    
    echo date('Y-m-d H:i:s') . " - Ежечасовая статистика собрана\n";
    
} catch (Exception $e) {
    // Записываем ошибку в лог
    if (isset($logger)) {
        $logger->error("Ошибка в скрипте сбора статистики", ['error' => $e->getMessage()]);
    }
    
    echo date('Y-m-d H:i:s') . " - Ошибка: " . $e->getMessage() . "\n";
    exit(1);
}
?>