<?php
/**
 * Система фоновой обработки задач SparkPanel
 */

class BackgroundJobProcessor {
    private $db;
    private $logFile;
    
    public function __construct($database) {
        $this->db = $database;
        $this->logFile = __DIR__ . '/../logs/background_jobs.log';
        
        // Создаем директорию для логов, если она не существует
        $logDir = dirname($this->logFile);
        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }
    }
    
    /**
     * Добавить задачу в очередь
     */
    public function addJob($jobType, $payload, $priority = 0) {
        try {
            $stmt = $this->db->prepare("
                INSERT INTO background_jobs (job_type, payload, priority, status, created_at) 
                VALUES (?, ?, ?, 'pending', NOW())
            ");
            
            $payloadJson = json_encode($payload);
            $result = $stmt->execute([$jobType, $payloadJson, $priority]);
            
            if ($result) {
                $jobId = $this->db->lastInsertId();
                $this->log("Задача #$jobId добавлена в очередь: $jobType");
                return $jobId;
            }
            
            return false;
        } catch (Exception $e) {
            $this->log("Ошибка добавления задачи: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Обработать ожидающие задачи
     */
    public function processPendingJobs($limit = 10) {
        try {
            // Получаем ожидающие задачи, отсортированные по приоритету
            $stmt = $this->db->prepare("
                SELECT * FROM background_jobs 
                WHERE status = 'pending' 
                ORDER BY priority DESC, created_at ASC 
                LIMIT ?
            ");
            $stmt->execute([$limit]);
            $jobs = $stmt->fetchAll();
            
            $processed = 0;
            foreach ($jobs as $job) {
                $this->processJob($job);
                $processed++;
            }
            
            $this->log("Обработано задач: $processed");
            return $processed;
        } catch (Exception $e) {
            $this->log("Ошибка обработки задач: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Обработать конкретную задачу
     */
    private function processJob($job) {
        try {
            // Обновляем статус задачи на "в процессе"
            $stmt = $this->db->prepare("
                UPDATE background_jobs 
                SET status = 'processing', started_at = NOW() 
                WHERE id = ?
            ");
            $stmt->execute([$job['id']]);
            
            $payload = json_decode($job['payload'], true);
            $result = false;
            $errorMessage = '';
            
            // Обрабатываем задачу в зависимости от типа
            switch ($job['job_type']) {
                case 'backup_server':
                    $result = $this->processBackupJob($payload);
                    break;
                    
                case 'send_notification':
                    $result = $this->processNotificationJob($payload);
                    break;
                    
                case 'cleanup_logs':
                    $result = $this->processCleanupJob($payload);
                    break;
                    
                case 'update_server_stats':
                    $result = $this->processStatsUpdateJob($payload);
                    break;
                    
                default:
                    $errorMessage = "Неизвестный тип задачи: " . $job['job_type'];
                    $result = false;
            }
            
            if ($result) {
                // Обновляем статус задачи на "успешно завершена"
                $stmt = $this->db->prepare("
                    UPDATE background_jobs 
                    SET status = 'completed', completed_at = NOW() 
                    WHERE id = ?
                ");
                $stmt->execute([$job['id']]);
                $this->log("Задача #$job[id] успешно завершена: " . $job['job_type']);
            } else {
                // Обновляем статус задачи на "ошибка"
                $stmt = $this->db->prepare("
                    UPDATE background_jobs 
                    SET status = 'error', error_message = ?, completed_at = NOW() 
                    WHERE id = ?
                ");
                $stmt->execute([$errorMessage, $job['id']]);
                $this->log("Ошибка выполнения задачи #$job[id]: " . $job['job_type'] . " - $errorMessage");
            }
        } catch (Exception $e) {
            $this->log("Ошибка обработки задачи #$job[id]: " . $e->getMessage());
        }
    }
    
    /**
     * Обработать задачу резервного копирования сервера
     */
    private function processBackupJob($payload) {
        // Реализация задачи резервного копирования сервера
        return true;
    }
    
    /**
     * Обработать задачу отправки уведомления
     */
    private function processNotificationJob($payload) {
        // Реализация задачи отправки уведомления
        return true;
    }
    
    /**
     * Обработать задачу очистки логов
     */
    private function processCleanupJob($payload) {
        // Реализация задачи очистки логов
        return true;
    }
    
    /**
     * Обработать задачу обновления статистики сервера
     */
    private function processStatsUpdateJob($payload) {
        // Реализация задачи обновления статистики сервера
        return true;
    }
    
    /**
     * Получить статистику по задачам
     */
    public function getJobStats() {
        try {
            $stats = [];
            
            // Получаем количество задач по статусам
            $stmt = $this->db->prepare("
                SELECT status, COUNT(*) as count 
                FROM background_jobs 
                GROUP BY status
            ");
            $stmt->execute();
            $results = $stmt->fetchAll();
            
            foreach ($results as $row) {
                $stats[$row['status']] = $row['count'];
            }
            
            return $stats;
        } catch (Exception $e) {
            $this->log("Ошибка получения статистики задач: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * Записать сообщение в лог
     */
    private function log($message) {
        $timestamp = date('Y-m-d H:i:s');
        $logMessage = "[$timestamp] $message\n";
        file_put_contents($this->logFile, $logMessage, FILE_APPEND | LOCK_EX);
    }
}
?>