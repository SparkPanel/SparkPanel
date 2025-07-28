<?php
/**
 * Система логирования и аналитики SparkPanel
 */

class Logger {
    private $logFile;
    private $db;
    
    public function __construct($database = null, $logDir = null) {
        $this->db = $database;
        $logDir = $logDir ?: __DIR__ . '/../logs';
        $this->logFile = $logDir . '/application.log';
        
        // Создаем директорию для логов, если она не существует
        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }
    }
    
    /**
     * Записать сообщение в лог
     */
    public function log($level, $message, $context = []) {
        $timestamp = date('Y-m-d H:i:s');
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
        $userId = $_SESSION['user_id'] ?? 'anonymous';
        
        // Форматируем сообщение
        $contextStr = !empty($context) ? json_encode($context) : '';
        $logMessage = "[$timestamp] [$level] [IP: $ip] [User: $userId] [UA: $userAgent] $message $contextStr\n";
        
        // Записываем в файл
        file_put_contents($this->logFile, $logMessage, FILE_APPEND | LOCK_EX);
        
        // Сохраняем в базу данных, если доступна
        if ($this->db) {
            try {
                $stmt = $this->db->prepare("
                    INSERT INTO audit_log (user_id, username, action, details, ip_address, created_at) 
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                
                $username = $_SESSION['username'] ?? 'anonymous';
                $action = $level;
                $details = $message . ' ' . $contextStr;
                $stmt->execute([$userId, $username, $action, $details, $ip, $timestamp]);
            } catch (Exception $e) {
                // Игнорируем ошибки записи в БД, чтобы не нарушить основную логику
            }
        }
    }
    
    /**
     * Записать информационное сообщение
     */
    public function info($message, $context = []) {
        $this->log('INFO', $message, $context);
    }
    
    /**
     * Записать предупреждение
     */
    public function warning($message, $context = []) {
        $this->log('WARNING', $message, $context);
    }
    
    /**
     * Записать ошибку
     */
    public function error($message, $context = []) {
        $this->log('ERROR', $message, $context);
    }
    
    /**
     * Записать критическую ошибку
     */
    public function critical($message, $context = []) {
        $this->log('CRITICAL', $message, $context);
    }
    
    /**
     * Получить логи за определенный период
     */
    public function getLogs($startDate = null, $endDate = null, $level = null, $limit = 100) {
        $logs = [];
        
        // Если указана база данных, получаем логи из нее
        if ($this->db) {
            try {
                $whereClause = "";
                $params = [];
                
                if ($startDate) {
                    $whereClause .= " AND created_at >= ?";
                    $params[] = $startDate;
                }
                
                if ($endDate) {
                    $whereClause .= " AND created_at <= ?";
                    $params[] = $endDate;
                }
                
                if ($level) {
                    $whereClause .= " AND action = ?";
                    $params[] = $level;
                }
                
                $sql = "SELECT * FROM audit_log WHERE 1=1 $whereClause ORDER BY created_at DESC LIMIT ?";
                $params[] = $limit;
                
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
                $logs = $stmt->fetchAll();
                
                return $logs;
            } catch (Exception $e) {
                // Если не удалось получить из БД, читаем из файла
            }
        }
        
        // Если БД недоступна или произошла ошибка, читаем из файла
        if (file_exists($this->logFile)) {
            $lines = file($this->logFile, FILE_IGNORE_NEW_LINES);
            $logs = array_slice(array_reverse($lines), 0, $limit);
        }
        
        return $logs;
    }
    
    /**
     * Получить статистику по логам
     */
    public function getLogStats($days = 7) {
        $stats = [
            'total_logs' => 0,
            'by_level' => [],
            'by_user' => [],
            'daily' => []
        ];
        
        if ($this->db) {
            try {
                // Общее количество логов
                $stmt = $this->db->prepare("
                    SELECT COUNT(*) as total FROM audit_log 
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                ");
                $stmt->execute([$days]);
                $result = $stmt->fetch();
                $stats['total_logs'] = $result['total'];
                
                // Количество логов по уровням
                $stmt = $this->db->prepare("
                    SELECT action, COUNT(*) as count FROM audit_log 
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                    GROUP BY action
                ");
                $stmt->execute([$days]);
                $results = $stmt->fetchAll();
                
                foreach ($results as $row) {
                    $stats['by_level'][$row['action']] = $row['count'];
                }
                
                // Количество логов по пользователям
                $stmt = $this->db->prepare("
                    SELECT username, COUNT(*) as count FROM audit_log 
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                    GROUP BY username
                    ORDER BY count DESC
                    LIMIT 10
                ");
                $stmt->execute([$days]);
                $results = $stmt->fetchAll();
                
                foreach ($results as $row) {
                    $stats['by_user'][$row['username']] = $row['count'];
                }
                
                // Ежедневная статистика
                $stmt = $this->db->prepare("
                    SELECT DATE(created_at) as date, COUNT(*) as count FROM audit_log 
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                    GROUP BY DATE(created_at)
                    ORDER BY date
                ");
                $stmt->execute([$days]);
                $results = $stmt->fetchAll();
                
                foreach ($results as $row) {
                    $stats['daily'][$row['date']] = $row['count'];
                }
                
            } catch (Exception $e) {
                // Игнорируем ошибки
            }
        }
        
        return $stats;
    }
    
    /**
     * Очистить старые логи
     */
    public function cleanupLogs($days = 30) {
        if ($this->db) {
            try {
                $stmt = $this->db->prepare("
                    DELETE FROM audit_log 
                    WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
                ");
                $stmt->execute([$days]);
                
                $deletedRows = $stmt->rowCount();
                $this->info("Очищено старых логов: $deletedRows");
                
                return $deletedRows;
            } catch (Exception $e) {
                $this->error("Ошибка очистки логов: " . $e->getMessage());
                return false;
            }
        }
        
        return true;
    }
}