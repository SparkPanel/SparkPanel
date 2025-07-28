<?php
/**
 * Файл управления серверами SparkPanel
 */
require_once '../config/db.php';
// Подключаем необходимые компоненты
require_once __DIR__ . '/cache.php';
require_once __DIR__ . '/background_jobs.php';
require_once __DIR__ . '/logger.php';

class ServerManager {
    private $db;
    
    public function __construct($database) {
        $this->db = $database;
    }
    
    /**
     * Получить список серверов
     */
    public function getServers() {
        try {
            $stmt = $this->db->prepare("SELECT * FROM servers ORDER BY name");
            $stmt->execute();
            return $stmt->fetchAll();
        } catch (Exception $e) {
            // Возвращаем пустой массив в случае ошибки
            return [];
        }
    }
    
    /**
     * Добавить новый сервер
     */
    public function addServer($name, $ip, $port) {
        try {
            $stmt = $this->db->prepare("INSERT INTO servers (name, ip, port) VALUES (?, ?, ?)");
            $result = $stmt->execute([$name, $ip, $port]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Сервер успешно добавлен', 'server_id' => $this->db->lastInsertId()];
            }
            
            return ['success' => false, 'message' => 'Не удалось добавить сервер'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка добавления сервера: ' . $e->getMessage()];
        }
    }
    
    /**
     * Получить информацию о сервере по ID
     */
    public function getServer($id) {
        try {
            $stmt = $this->db->prepare("SELECT * FROM servers WHERE id = ?");
            $stmt->execute([$id]);
            return $stmt->fetch();
        } catch (Exception $e) {
            return false;
        }
    }
    
    /**
     * Запустить сервер
     */
    public function startServer($id) {
        try {
            $stmt = $this->db->prepare("UPDATE servers SET status = 'online' WHERE id = ?");
            $result = $stmt->execute([$id]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Сервер успешно запущен'];
            }
            
            return ['success' => false, 'message' => 'Не удалось запустить сервер'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка запуска сервера: ' . $e->getMessage()];
        }
    }
    
    /**
     * Остановить сервер
     */
    public function stopServer($id) {
        try {
            $stmt = $this->db->prepare("UPDATE servers SET status = 'offline' WHERE id = ?");
            $result = $stmt->execute([$id]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Сервер успешно остановлен'];
            }
            
            return ['success' => false, 'message' => 'Не удалось остановить сервер'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка остановки сервера: ' . $e->getMessage()];
        }
    }
    
    /**
     * Удалить сервер
     */
    public function deleteServer($id) {
        try {
            // Начинаем транзакцию
            $this->db->beginTransaction();
            
            // Удаляем связанные записи
            $stmt = $this->db->prepare("DELETE FROM logs WHERE server_id = ?");
            $stmt->execute([$id]);
            
            $stmt = $this->db->prepare("DELETE FROM plugins WHERE server_id = ?");
            $stmt->execute([$id]);
            
            $stmt = $this->db->prepare("DELETE FROM backups WHERE server_id = ?");
            $stmt->execute([$id]);
            
            $stmt = $this->db->prepare("DELETE FROM scheduled_tasks WHERE server_id = ?");
            $stmt->execute([$id]);
            
            // Удаляем сам сервер
            $stmt = $this->db->prepare("DELETE FROM servers WHERE id = ?");
            $result = $stmt->execute([$id]);
            
            if ($result) {
                $this->db->commit();
                return ['success' => true, 'message' => 'Сервер успешно удален'];
            }
            
            $this->db->rollback();
            return ['success' => false, 'message' => 'Не удалось удалить сервер'];
        } catch (Exception $e) {
            $this->db->rollback();
            return ['success' => false, 'message' => 'Ошибка удаления сервера: ' . $e->getMessage()];
        }
    }
    
    /**
     * Получить список плагинов сервера
     */
    public function getPlugins($serverId) {
        try {
            $stmt = $this->db->prepare("SELECT * FROM plugins WHERE server_id = ? ORDER BY name");
            $stmt->execute([$serverId]);
            return $stmt->fetchAll();
        } catch (Exception $e) {
            // Возвращаем пустой массив в случае ошибки
            return [];
        }
    }
    
    /**
     * Включить плагин
     */
    public function enablePlugin($pluginId) {
        try {
            $stmt = $this->db->prepare("UPDATE plugins SET status = 'enabled' WHERE id = ?");
            $result = $stmt->execute([$pluginId]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Плагин успешно включен'];
            }
            
            return ['success' => false, 'message' => 'Не удалось включить плагин'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка включения плагина: ' . $e->getMessage()];
        }
    }
    
    /**
     * Отключить плагин
     */
    public function disablePlugin($pluginId) {
        try {
            $stmt = $this->db->prepare("UPDATE plugins SET status = 'disabled' WHERE id = ?");
            $result = $stmt->execute([$pluginId]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Плагин успешно отключен'];
            }
            
            return ['success' => false, 'message' => 'Не удалось отключить плагин'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка отключения плагина: ' . $e->getMessage()];
        }
    }
    
    /**
     * Удалить плагин
     */
    public function deletePlugin($pluginId) {
        try {
            $stmt = $this->db->prepare("DELETE FROM plugins WHERE id = ?");
            $result = $stmt->execute([$pluginId]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Плагин успешно удален'];
            }
            
            return ['success' => false, 'message' => 'Не удалось удалить плагин'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка удаления плагина: ' . $e->getMessage()];
        }
    }
    
    /**
     * Добавить плагин
     */
    public function addPlugin($serverId, $name, $version, $author) {
        try {
            $stmt = $this->db->prepare("INSERT INTO plugins (server_id, name, version, author) VALUES (?, ?, ?, ?)");
            $result = $stmt->execute([$serverId, $name, $version, $author]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Плагин успешно добавлен'];
            }
            
            return ['success' => false, 'message' => 'Не удалось добавить плагин'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка добавления плагина: ' . $e->getMessage()];
        }
    }
    
    /**
     * Получить список резервных копий
     */
    public function getBackups() {
        try {
            $stmt = $this->db->prepare("
                SELECT b.*, s.name as server_name 
                FROM backups b 
                LEFT JOIN servers s ON b.server_id = s.id 
                ORDER BY b.created_at DESC
            ");
            $stmt->execute();
            return $stmt->fetchAll();
        } catch (Exception $e) {
            // Возвращаем пустой массив в случае ошибки
            return [];
        }
    }
    
    /**
     * Создать резервную копию
     */
    public function createBackup($serverId) {
        try {
            // Получаем информацию о сервере
            $stmt = $this->db->prepare("SELECT name FROM servers WHERE id = ?");
            $stmt->execute([$serverId]);
            $server = $stmt->fetch();
            
            if (!$server) {
                return ['success' => false, 'message' => 'Сервер не найден'];
            }
            
            // Генерируем имя файла резервной копии
            $timestamp = date('Y-m-d H:i:s');
            $filename = 'backup_' . $serverId . '_' . date('Ymd_His') . '.zip';
            $name = 'Резервная копия от ' . $timestamp;
            
            // В реальной реализации здесь будет код создания резервной копии
            // Для демонстрации просто добавляем запись в БД
            $stmt = $this->db->prepare("INSERT INTO backups (server_id, name, size, path) VALUES (?, ?, ?, ?)");
            $result = $stmt->execute([$serverId, $name, '1.5 GB', '/backups/' . $filename]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Резервная копия успешно создана'];
            }
            
            return ['success' => false, 'message' => 'Не удалось создать резервную копию'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка создания резервной копии: ' . $e->getMessage()];
        }
    }
    
    /**
     * Восстановить резервную копию
     */
    public function restoreBackup($backupId) {
        try {
            // Получаем информацию о резервной копии
            $stmt = $this->db->prepare("SELECT * FROM backups WHERE id = ?");
            $stmt->execute([$backupId]);
            $backup = $stmt->fetch();
            
            if (!$backup) {
                return ['success' => false, 'message' => 'Резервная копия не найдена'];
            }
            
            // В реальной реализации здесь будет код восстановления из резервной копии
            // Для демонстрации просто возвращаем успех
            return ['success' => true, 'message' => 'Резервная копия успешно восстановлена'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка восстановления резервной копии: ' . $e->getMessage()];
        }
    }
    
    /**
     * Удалить резервную копию
     */
    public function deleteBackup($backupId) {
        try {
            $stmt = $this->db->prepare("DELETE FROM backups WHERE id = ?");
            $result = $stmt->execute([$backupId]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Резервная копия успешно удалена'];
            }
            
            return ['success' => false, 'message' => 'Не удалось удалить резервную копию'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка удаления резервной копии: ' . $e->getMessage()];
        }
    }
    
    /**
     * Получить список запланированных задач
     */
    public function getScheduledTasks() {
        try {
            $stmt = $this->db->prepare("
                SELECT st.*, s.name as server_name 
                FROM scheduled_tasks st 
                LEFT JOIN servers s ON st.server_id = s.id 
                ORDER BY st.name
            ");
            $stmt->execute();
            return $stmt->fetchAll();
        } catch (Exception $e) {
            // Возвращаем пустой массив в случае ошибки
            return [];
        }
    }
    
    /**
     * Добавить задачу в планировщик
     */
    public function addScheduledTask($name, $type, $serverId, $schedule) {
        try {
            $stmt = $this->db->prepare("INSERT INTO scheduled_tasks (name, task_type, server_id, schedule) VALUES (?, ?, ?, ?)");
            $result = $stmt->execute([$name, $type, $serverId, $schedule]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Задача успешно добавлена'];
            }
            
            return ['success' => false, 'message' => 'Не удалось добавить задачу'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка добавления задачи: ' . $e->getMessage()];
        }
    }
    
    /**
     * Отключить задачу
     */
    public function disableTask($taskId) {
        try {
            $stmt = $this->db->prepare("UPDATE scheduled_tasks SET status = 'disabled' WHERE id = ?");
            $result = $stmt->execute([$taskId]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Задача успешно отключена'];
            }
            
            return ['success' => false, 'message' => 'Не удалось отключить задачу'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка отключения задачи: ' . $e->getMessage()];
        }
    }
    
    /**
     * Включить задачу
     */
    public function enableTask($taskId) {
        try {
            $stmt = $this->db->prepare("UPDATE scheduled_tasks SET status = 'enabled' WHERE id = ?");
            $result = $stmt->execute([$taskId]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Задача успешно включена'];
            }
            
            return ['success' => false, 'message' => 'Не удалось включить задачу'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка включения задачи: ' . $e->getMessage()];
        }
    }
    
    /**
     * Удалить задачу
     */
    public function deleteTask($taskId) {
        try {
            $stmt = $this->db->prepare("DELETE FROM scheduled_tasks WHERE id = ?");
            $result = $stmt->execute([$taskId]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Задача успешно удалена'];
            }
            
            return ['success' => false, 'message' => 'Не удалось удалить задачу'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка удаления задачи: ' . $e->getMessage()];
        }
    }
    
    /**
     * Получить настройки уведомлений
     */
    public function getNotificationSettings() {
        try {
            $stmt = $this->db->prepare("SELECT * FROM notification_settings LIMIT 1");
            $stmt->execute();
            $settings = $stmt->fetch();
            
            if ($settings) {
                $settings['notifications'] = json_decode($settings['notifications'], true);
                return $settings;
            }
            
            // Возвращаем значения по умолчанию
            return [
                'id' => null,
                'email_enabled' => false,
                'email_address' => '',
                'telegram_enabled' => false,
                'telegram_token' => '',
                'telegram_chat_id' => '',
                'discord_enabled' => false,
                'discord_webhook' => '',
                'notifications' => [
                    'server_status' => true,
                    'errors' => true,
                    'high_load' => true,
                    'backups' => false,
                    'player_connections' => false
                ]
            ];
        } catch (Exception $e) {
            // Возвращаем значения по умолчанию в случае ошибки
            return [
                'id' => null,
                'email_enabled' => false,
                'email_address' => '',
                'telegram_enabled' => false,
                'telegram_token' => '',
                'telegram_chat_id' => '',
                'discord_enabled' => false,
                'discord_webhook' => '',
                'notifications' => [
                    'server_status' => true,
                    'errors' => true,
                    'high_load' => true,
                    'backups' => false,
                    'player_connections' => false
                ]
            ];
        }
    }
    
    /**
     * Сохранить настройки уведомлений
     */
    public function saveNotificationSettings($settings) {
        try {
            // Проверяем, существуют ли настройки
            $stmt = $this->db->prepare("SELECT id FROM notification_settings LIMIT 1");
            $stmt->execute();
            $existing = $stmt->fetch();
            
            if ($existing) {
                // Обновляем существующие настройки
                $stmt = $this->db->prepare("
                    UPDATE notification_settings SET 
                    email_enabled = ?, email_address = ?, 
                    telegram_enabled = ?, telegram_token = ?, telegram_chat_id = ?,
                    discord_enabled = ?, discord_webhook = ?,
                    notifications = ?
                ");
                $result = $stmt->execute([
                    $settings['email_enabled'], $settings['email_address'],
                    $settings['telegram_enabled'], $settings['telegram_token'], $settings['telegram_chat_id'],
                    $settings['discord_enabled'], $settings['discord_webhook'],
                    json_encode($settings['notifications'])
                ]);
            } else {
                // Создаем новые настройки
                $stmt = $this->db->prepare("
                    INSERT INTO notification_settings 
                    (email_enabled, email_address, telegram_enabled, telegram_token, telegram_chat_id, 
                     discord_enabled, discord_webhook, notifications)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $result = $stmt->execute([
                    $settings['email_enabled'], $settings['email_address'],
                    $settings['telegram_enabled'], $settings['telegram_token'], $settings['telegram_chat_id'],
                    $settings['discord_enabled'], $settings['discord_webhook'],
                    json_encode($settings['notifications'])
                ]);
            }
            
            if ($result) {
                return ['success' => true, 'message' => 'Настройки уведомлений успешно сохранены'];
            }
            
            return ['success' => false, 'message' => 'Не удалось сохранить настройки уведомлений'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка сохранения настроек: ' . $e->getMessage()];
        }
    }
    
    /**
     * Получить данные для мониторинга в реальном времени
     */
    public function getRealtimeStats() {
        try {
            // Пытаемся получить данные из кэша
            $cache = new Cache();
            $cachedData = $cache->get('realtime_stats');
            
            if ($cachedData) {
                return [
                    'success' => true,
                    'data' => $cachedData,
                    'from_cache' => true
                ];
            }
            
            // В реальной реализации здесь будет сбор данных с сервера
            // Сейчас используем симуляцию
            
            // Получаем данные о системе
            $cpu_usage = rand(10, 90);
            $memory_total = 16 * 1024 * 1024 * 1024; // 16 GB
            $memory_used = rand(2, 14) * 1024 * 1024 * 1024;
            $memory_percent = ($memory_used / $memory_total) * 100;
            
            $disk_total = 100 * 1024 * 1024 * 1024; // 100 GB
            $disk_used = rand(20, 80) * 1024 * 1024 * 1024;
            $disk_percent = ($disk_used / $disk_total) * 100;
            
            // Получаем данные о серверах
            $stmt = $this->db->prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online FROM servers");
            $stmt->execute();
            $server_stats = $stmt->fetch();
            
            // Получаем данные о пользователях
            $stmt = $this->db->prepare("SELECT COUNT(*) as total FROM users");
            $stmt->execute();
            $user_stats = $stmt->fetch();
            
            $data = [
                'cpu_usage' => $cpu_usage,
                'memory_usage' => round($memory_percent, 2),
                'disk_usage' => round($disk_percent, 2),
                'servers_total' => $server_stats['total'],
                'servers_online' => $server_stats['online'],
                'users_total' => $user_stats['total'],
                'timestamp' => date('Y-m-d H:i:s')
            ];
            
            // Сохраняем данные в кэш на 60 секунд
            $cache->set('realtime_stats', $data, 60);
            
            return [
                'success' => true,
                'data' => $data,
                'from_cache' => false
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => 'Ошибка получения статистики: ' . $e->getMessage()
            ];
        }
    }
    
    /**
     * Получить исторические данные для графиков
     */
    public function getHistoricalData($metric, $hours = 24) {
        try {
            // Пытаемся получить данные из кэша
            $cache = new Cache();
            $cacheKey = "historical_data_{$metric}_{$hours}";
            $cachedData = $cache->get($cacheKey);
            
            if ($cachedData) {
                return [
                    'success' => true,
                    'data' => $cachedData,
                    'from_cache' => true
                ];
            }
            
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
            
            // Сохраняем данные в кэш на 5 минут
            $cache->set($cacheKey, $data, 300);
            
            return [
                'success' => true,
                'data' => $data,
                'from_cache' => false
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => 'Ошибка получения исторических данных: ' . $e->getMessage()
            ];
        }
    }
    
    /**
     * Добавить метрики производительности
     */
    public function addPerformanceMetric($metricType, $value, $serverId = null) {
        try {
            $stmt = $this->db->prepare("
                INSERT INTO performance_metrics (metric_type, value, server_id, created_at) 
                VALUES (?, ?, ?, NOW())
            ");
            $result = $stmt->execute([$metricType, $value, $serverId]);
            
            if ($result) {
                // Записываем в лог
                $logger = new Logger($this->db);
                $logger->info("Добавлена метрика производительности", [
                    'type' => $metricType,
                    'value' => $value,
                    'server_id' => $serverId
                ]);
                
                return true;
            }
            
            return false;
        } catch (Exception $e) {
            // Записываем ошибку в лог
            $logger = new Logger($this->db);
            $logger->error("Ошибка добавления метрики производительности", [
                'error' => $e->getMessage(),
                'type' => $metricType,
                'value' => $value,
                'server_id' => $serverId
            ]);
            
            return false;
        }
    }
    
    /**
     * Получить метрики производительности
     */
    public function getPerformanceMetrics($metricType = null, $limit = 100) {
        try {
            $whereClause = "";
            $params = [];
            
            if ($metricType) {
                $whereClause = "WHERE metric_type = ?";
                $params[] = $metricType;
            }
            
            $sql = "SELECT * FROM performance_metrics $whereClause ORDER BY created_at DESC LIMIT ?";
            $params[] = $limit;
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $metrics = $stmt->fetchAll();
            
            return $metrics;
        } catch (Exception $e) {
            return [];
        }
    }
    
    /**
     * Очистить старые метрики производительности
     */
    public function cleanupPerformanceMetrics($days = 30) {
        try {
            $stmt = $this->db->prepare("
                DELETE FROM performance_metrics 
                WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
            ");
            $stmt->execute([$days]);
            
            $deletedRows = $stmt->rowCount();
            
            // Записываем в лог
            $logger = new Logger($this->db);
            $logger->info("Очищены старые метрики производительности", [
                'deleted_rows' => $deletedRows,
                'days' => $days
            ]);
            
            return $deletedRows;
        } catch (Exception $e) {
            // Записываем ошибку в лог
            $logger = new Logger($this->db);
            $logger->error("Ошибка очистки метрик производительности", [
                'error' => $e->getMessage(),
                'days' => $days
            ]);
            
            return false;
        }
    }
    
    /**
     * Добавить задачу в очередь фоновой обработки
     */
    public function addBackgroundJob($jobType, $payload, $priority = 0) {
        $jobProcessor = new BackgroundJobProcessor($this->db);
        return $jobProcessor->addJob($jobType, $payload, $priority);
    }
    
    /**
     * Обработать ожидающие фоновые задачи
     */
    public function processBackgroundJobs($limit = 10) {
        $jobProcessor = new BackgroundJobProcessor($this->db);
        return $jobProcessor->processPendingJobs($limit);
    }

    /**
     * Получить список пользователей
     */
    public function getUsers() {
        try {
            $stmt = $this->db->prepare("SELECT id, username, role, last_login, last_ip FROM users ORDER BY username");
            $stmt->execute();
            return $stmt->fetchAll();
        } catch (Exception $e) {
            // Возвращаем пустой массив в случае ошибки
            return [];
        }
    }
    
    /**
     * Обновить роль пользователя
     */
    public function updateUserRole($userId, $role) {
        try {
            $stmt = $this->db->prepare("UPDATE users SET role = ? WHERE id = ?");
            $result = $stmt->execute([$role, $userId]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Роль пользователя успешно обновлена'];
            }
            
            return ['success' => false, 'message' => 'Не удалось обновить роль пользователя'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка обновления роли: ' . $e->getMessage()];
        }
    }
    
    /**
     * Получить список разрешенных IP-адресов для пользователя
     */
    public function getAllowedIPs($userId) {
        try {
            $stmt = $this->db->prepare("SELECT ip_address FROM allowed_ips WHERE user_id = ? ORDER BY ip_address");
            $stmt->execute([$userId]);
            $results = $stmt->fetchAll();
            
            $ips = [];
            foreach ($results as $row) {
                $ips[] = $row['ip_address'];
            }
            
            return $ips;
        } catch (Exception $e) {
            // Возвращаем пустой массив в случае ошибки
            return [];
        }
    }
    
    /**
     * Добавить разрешенный IP-адрес для пользователя
     */
    public function addAllowedIP($userId, $ip) {
        try {
            // Проверяем, не добавлен ли уже этот IP
            $stmt = $this->db->prepare("SELECT id FROM allowed_ips WHERE user_id = ? AND ip_address = ?");
            $stmt->execute([$userId, $ip]);
            if ($stmt->fetch()) {
                return ['success' => false, 'message' => 'Этот IP-адрес уже добавлен'];
            }
            
            // Добавляем новый IP
            $stmt = $this->db->prepare("INSERT INTO allowed_ips (user_id, ip_address) VALUES (?, ?)");
            $result = $stmt->execute([$userId, $ip]);
            
            if ($result) {
                return ['success' => true, 'message' => 'IP-адрес успешно добавлен'];
            }
            
            return ['success' => false, 'message' => 'Не удалось добавить IP-адрес'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка добавления IP: ' . $e->getMessage()];
        }
    }
    
    /**
     * Удалить разрешенный IP-адрес для пользователя
     */
    public function removeAllowedIP($userId, $ip) {
        try {
            $stmt = $this->db->prepare("DELETE FROM allowed_ips WHERE user_id = ? AND ip_address = ?");
            $result = $stmt->execute([$userId, $ip]);
            
            if ($result) {
                return ['success' => true, 'message' => 'IP-адрес успешно удален'];
            }
            
            return ['success' => false, 'message' => 'Не удалось удалить IP-адрес'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка удаления IP: ' . $e->getMessage()];
        }
    }
    
    /**
     * Получить логи аудита
     */
    public function getAuditLogs($limit = 50, $offset = 0) {
        try {
            $stmt = $this->db->prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?");
            $stmt->execute([$limit, $offset]);
            return $stmt->fetchAll();
        } catch (Exception $e) {
            // Возвращаем пустой массив в случае ошибки
            return [];
        }
    }
    
    /**
     * Получить логи сервера
     */
    public function getServerLogs($serverId, $limit = 100) {
        try {
            $stmt = $this->db->prepare("SELECT * FROM logs WHERE server_id = ? ORDER BY created_at DESC LIMIT ?");
            $stmt->execute([$serverId, $limit]);
            return $stmt->fetchAll();
        } catch (Exception $e) {
            // Возвращаем пустой массив в случае ошибки
            return [];
        }
    }
    
    /**
     * Добавить запись в лог
     */
    public function addLogEntry($serverId, $message) {
        try {
            $stmt = $this->db->prepare("INSERT INTO logs (server_id, message) VALUES (?, ?)");
            return $stmt->execute([$serverId, $message]);
        } catch (Exception $e) {
            return false;
        }
    }
    
    public function getServerStatus($serverId) {
        try {
            // Получаем информацию о сервере из базы данных
            $stmt = $this->pdo->prepare("SELECT * FROM servers WHERE id = ?");
            $stmt->execute([$serverId]);
            $server = $stmt->fetch();
            
            if (!$server) {
                return [
                    'status' => 'offline',
                    'players' => '0/0',
                    'max_players' => 0,
                    'tps' => 0.0,
                    'uptime' => 0
                ];
            }
            
            // В реальной реализации здесь будет код для получения реальных метрик сервера
            // Например, через API сервера или чтение логов
            return [
                'status' => $server['status'],
                'players' => $server['players'] ?? '0/20',
                'max_players' => 20,
                'tps' => mt_rand(1500, 2000) / 100, // Имитация TPS
                'uptime' => mt_rand(3600, 86400) // Имитация времени работы
            ];
        } catch (Exception $e) {
            return [
                'status' => 'offline',
                'players' => '0/0',
                'max_players' => 0,
                'tps' => 0.0,
                'uptime' => 0
            ];
        }
    }
}
?>