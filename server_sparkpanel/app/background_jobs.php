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
            
            // Обновляем статус задачи
            $status = $result ? 'completed' : 'failed';
            $finishedAt = date('Y-m-d H:i:s');
            
            $stmt = $this->db->prepare("
                UPDATE background_jobs 
                SET status = ?, finished_at = ?, error_message = ? 
                WHERE id = ?
            ");
            $stmt->execute([$status, $finishedAt, $errorMessage, $job['id']]);
            
            $this->log("Задача #{$job['id']} завершена со статусом: $status");
            
        } catch (Exception $e) {
            // Обновляем статус задачи на "ошибка"
            $stmt = $this->db->prepare("
                UPDATE background_jobs 
                SET status = 'failed', finished_at = NOW(), error_message = ? 
                WHERE id = ?
            ");
            $stmt->execute([$e->getMessage(), $job['id']]);
            
            $this->log("Ошибка обработки задачи #{$job['id']}: " . $e->getMessage());
        }
    }
    
    /**
     * Обработать задачу резервного копирования
     */
    private function processBackupJob($payload) {
        $this->log("Обработка задачи резервного копирования для сервера #{$payload['server_id']}");
        
        try {
            // Получаем информацию о сервере
            $stmt = $this->db->prepare("SELECT name FROM servers WHERE id = ?");
            $stmt->execute([$payload['server_id']]);
            $server = $stmt->fetch();
            
            if (!$server) {
                throw new Exception("Сервер не найден");
            }
            
            // Генерируем имя файла резервной копии
            $timestamp = date('Y-m-d H:i:s');
            $filename = 'backup_' . $payload['server_id'] . '_' . date('Y-m-d_H-i-s') . '.zip';
            $name = 'Резервная копия от ' . date('d.m.Y H:i:s');
            
            // В реальной реализации здесь будет код создания резервной копии
            // Например, использование системной команды:
            // exec("zip -r /backups/{$filename} /path/to/server/{$payload['server_id']}", $output, $resultCode);
            
            // Для демонстрации имитируем создание резервной копии
            sleep(2); // Имитируем длительную операцию
            
            // Генерируем случайный размер файла
            $size = rand(500, 2000) . " MB";
            $path = "/backups/server_{$payload['server_id']}/$filename";
            
            // Записываем информацию о резервной копии в БД
            $stmt = $this->db->prepare("
                INSERT INTO backups (server_id, name, size, path, created_at) 
                VALUES (?, ?, ?, ?, NOW())
            ");
            $stmt->execute([$payload['server_id'], $name, $size, $path]);
            
            $this->log("Резервная копия создана: $name");
            return true;
        } catch (Exception $e) {
            $this->log("Ошибка создания резервной копии: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Обработать задачу отправки уведомлений
     */
    private function processNotificationJob($payload) {
        $this->log("Обработка задачи отправки уведомлений");
        
        // В реальной реализации здесь будет код для отправки уведомлений
        // Пока используем имитацию
        sleep(1); // Имитируем отправку уведомлений
        
        $this->log("Уведомления отправлены: " . json_encode($payload));
        return true;
    }
    
    /**
     * Обработать задачу очистки логов
     */
    private function processCleanupJob($payload) {
        $this->log("Обработка задачи очистки логов");
        
        try {
            // Очищаем старые логи аудита (оставляем данные за 30 дней)
            $stmt = $this->db->prepare("
                DELETE FROM audit_log 
                WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
            ");
            $stmt->execute();
            $deletedAuditLogs = $stmt->rowCount();
            
            // Очищаем старые метрики производительности (оставляем данные за 7 дней)
            $stmt = $this->db->prepare("
                DELETE FROM performance_metrics 
                WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
            ");
            $stmt->execute();
            $deletedMetrics = $stmt->rowCount();
            
            // Очищаем старые фоновые задачи (оставляем данные за 7 дней)
            $stmt = $this->db->prepare("
                DELETE FROM background_jobs 
                WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
            ");
            $stmt->execute();
            $deletedJobs = $stmt->rowCount();
            
            $this->log("Очищено: $deletedAuditLogs логов, $deletedMetrics метрик, $deletedJobs задач");
            return true;
        } catch (Exception $e) {
            $this->log("Ошибка очистки логов: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Обработать задачу обновления статистики сервера
     */
    private function processStatsUpdateJob($payload) {
        $this->log("Обработка задачи обновления статистики сервера");
        
        try {
            // Получаем все серверы
            $stmt = $this->db->prepare("SELECT id FROM servers");
            $stmt->execute();
            $servers = $stmt->fetchAll();
            
            $updatedServers = 0;
            foreach ($servers as $server) {
                // В реальной реализации здесь будет код получения статистики сервера
                // Например, через API сервера или чтение логов
                
                // Для демонстрации генерируем случайные данные
                $cpuUsage = rand(10, 90);
                $memoryUsage = rand(20, 80);
                $diskUsage = rand(30, 70);
                
                // Сохраняем метрики производительности
                $stmt = $this->db->prepare("
                    INSERT INTO performance_metrics (metric_type, value, server_id, created_at) 
                    VALUES (?, ?, ?, NOW())
                ");
                $stmt->execute(['cpu_usage', $cpuUsage, $server['id']]);
                $stmt->execute(['memory_usage', $memoryUsage, $server['id']]);
                $stmt->execute(['disk_usage', $diskUsage, $server['id']]);
                
                $updatedServers++;
            }
            
            $this->log("Статистика обновлена для $updatedServers серверов");
            return true;
        } catch (Exception $e) {
            $this->log("Ошибка обновления статистики: " . $e->getMessage());
            return false;
        }
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