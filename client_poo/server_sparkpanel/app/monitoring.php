<?php
/**
 * Система мониторинга SparkPanel (клиентская часть)
 * 
 * Этот файл предоставляет функциональность для мониторинга серверов и ресурсов.
 */

class ServerMonitor {
    private $db;
    
    public function __construct($database) {
        $this->db = $database;
    }
    
    /**
     * Получить текущую статистику системы
     */
    public function getSystemStats() {
        // В реальной реализации здесь будет сбор данных о системе
        // Сейчас используем симуляцию
        
        $stats = [
            'cpu_usage' => $this->getCPUUsage(),
            'memory_usage' => $this->getMemoryUsage(),
            'disk_usage' => $this->getDiskUsage(),
            'network_stats' => $this->getNetworkStats(),
            'load_average' => $this->getLoadAverage(),
            'uptime' => $this->getSystemUptime()
        ];
        
        return $stats;
    }
    
    /**
     * Получить статистику Minecraft сервера
     */
    public function getMinecraftStats($serverId) {
        // В реальной реализации здесь будет сбор данных о Minecraft сервере
        // Сейчас используем симуляцию
        
        $stats = [
            'tps' => rand(15, 20) + (rand(0, 99) / 100),
            'players_online' => rand(0, 50),
            'players_max' => 100,
            'loaded_chunks' => rand(100, 2000),
            'entities' => rand(500, 5000),
            'server_status' => rand(0, 1) ? 'online' : 'offline'
        ];
        
        return $stats;
    }
    
    /**
     * Получить использование CPU
     */
    private function getCPUUsage() {
        // В реальной реализации здесь будет получение реальных данных
        // Сейчас используем симуляцию
        return rand(10, 90) + (rand(0, 99) / 100);
    }
    
    /**
     * Получить использование памяти
     */
    private function getMemoryUsage() {
        // В реальной реализации здесь будет получение реальных данных
        // Сейчас используем симуляцию
        return rand(20, 80) + (rand(0, 99) / 100);
    }
    
    /**
     * Получить использование диска
     */
    private function getDiskUsage() {
        // В реальной реализации здесь будет получение реальных данных
        // Сейчас используем симуляцию
        return rand(30, 70) + (rand(0, 99) / 100);
    }
    
    /**
     * Получить сетевую статистику
     */
    private function getNetworkStats() {
        // В реальной реализации здесь будет получение реальных данных
        // Сейчас используем симуляцию
        return [
            'bytes_sent' => rand(1000000, 100000000),
            'bytes_received' => rand(1000000, 100000000),
            'packets_sent' => rand(10000, 1000000),
            'packets_received' => rand(10000, 1000000)
        ];
    }
    
    /**
     * Получить среднюю нагрузку
     */
    private function getLoadAverage() {
        // В реальной реализации здесь будет получение реальных данных
        // Сейчас используем симуляцию
        return [
            '1min' => rand(0, 200) / 100,
            '5min' => rand(0, 200) / 100,
            '15min' => rand(0, 200) / 100
        ];
    }
    
    /**
     * Получить время работы системы
     */
    private function getSystemUptime() {
        // В реальной реализации здесь будет получение реальных данных
        // Сейчас используем симуляцию
        return rand(1, 30) * 24 * 60 * 60; // Секунды
    }
    
    /**
     * Получить исторические данные для графиков
     */
    public function getHistoricalData($metric, $hours = 24) {
        $data = [];
        $now = time();
        
        // Генерируем исторические данные
        for ($i = $hours; $i >= 0; $i--) {
            $timestamp = $now - ($i * 3600); // Каждый час
            
            switch ($metric) {
                case 'cpu':
                    $value = rand(10, 90) + (rand(0, 100) / 100);
                    break;
                case 'memory':
                    $value = rand(20, 80) + (rand(0, 100) / 100);
                    break;
                case 'disk':
                    $value = rand(30, 70) + (rand(0, 100) / 100);
                    break;
                case 'network':
                    $value = rand(100, 1000); // MB
                    break;
                default:
                    $value = rand(0, 100);
            }
            
            $data[] = [
                'timestamp' => date('Y-m-d H:i:s', $timestamp),
                'value' => $value
            ];
        }
        
        return $data;
    }
    
    /**
     * Проверить пороговые значения и сгенерировать оповещения
     */
    public function checkThresholds() {
        $alerts = [];
        $stats = $this->getSystemStats();
        
        // Проверяем пороговые значения
        if ($stats['cpu_usage'] > 80) {
            $alerts[] = [
                'type' => 'high_cpu',
                'message' => 'Высокая нагрузка на CPU: ' . round($stats['cpu_usage'], 2) . '%',
                'severity' => 'warning'
            ];
        }
        
        if ($stats['memory_usage'] > 85) {
            $alerts[] = [
                'type' => 'high_memory',
                'message' => 'Высокое использование памяти: ' . round($stats['memory_usage'], 2) . '%',
                'severity' => 'warning'
            ];
        }
        
        if ($stats['disk_usage'] > 90) {
            $alerts[] = [
                'type' => 'low_disk_space',
                'message' => 'Недостаточно свободного места на диске: ' . round($stats['disk_usage'], 2) . '%',
                'severity' => 'critical'
            ];
        }
        
        return $alerts;
    }
}
?>