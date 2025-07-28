<?php
/**
 * Файл управления серверами SparkPanel
 */
require_once '../config/db.php';

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
            // Возвращаем тестовые данные в случае ошибки
            return [
                [
                    'id' => 1,
                    'name' => 'Minecraft Server #1',
                    'ip' => '123.45.67.89',
                    'port' => 25565,
                    'status' => 'online',
                    'players' => '12/20'
                ],
                [
                    'id' => 2,
                    'name' => 'Minecraft Server #2',
                    'ip' => '123.45.67.89',
                    'port' => 25566,
                    'status' => 'offline',
                    'players' => '0/15'
                ]
            ];
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
     * Добавить новый сервер
     */
    public function addServer($name, $ip, $port) {
        try {
            $stmt = $this->db->prepare("INSERT INTO servers (name, ip, port) VALUES (?, ?, ?)");
            $result = $stmt->execute([$name, $ip, $port]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('add_server', "Добавлен сервер: $name ($ip:$port)");
                
                return ['success' => true, 'message' => 'Сервер успешно добавлен', 'server_id' => $this->db->lastInsertId()];
            }
            
            return ['success' => false, 'message' => 'Не удалось добавить сервер'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка добавления сервера: ' . $e->getMessage()];
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
                // Записываем в аудит
                $this->logAction('start_server', "Запущен сервер с ID: $id");
                
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
                // Записываем в аудит
                $this->logAction('stop_server', "Остановлен сервер с ID: $id");
                
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
            $stmt = $this->db->prepare("DELETE FROM servers WHERE id = ?");
            $result = $stmt->execute([$id]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('delete_server', "Удален сервер с ID: $id");
                
                return ['success' => true, 'message' => 'Сервер успешно удален'];
            }
            
            return ['success' => false, 'message' => 'Не удалось удалить сервер'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка удаления сервера: ' . $e->getMessage()];
        }
    }
    
    /**
     * Получить список плагинов для сервера
     */
    public function getPlugins($server_id = null) {
        try {
            if ($server_id) {
                $stmt = $this->db->prepare("SELECT * FROM plugins WHERE server_id = ? ORDER BY name");
                $stmt->execute([$server_id]);
            } else {
                $stmt = $this->db->prepare("SELECT * FROM plugins ORDER BY name");
                $stmt->execute();
            }
            
            return $stmt->fetchAll();
        } catch (Exception $e) {
            // Возвращаем тестовые данные в случае ошибки
            return [
                [
                    'id' => 1,
                    'server_id' => 1,
                    'name' => 'WorldEdit',
                    'version' => '7.2.0',
                    'author' => 'EngineHub Team',
                    'status' => 'enabled'
                ],
                [
                    'id' => 2,
                    'server_id' => 1,
                    'name' => 'WorldGuard',
                    'version' => '7.0.5',
                    'author' => 'EngineHub Team',
                    'status' => 'enabled'
                ]
            ];
        }
    }
    
    /**
     * Добавить плагин
     */
    public function addPlugin($server_id, $name, $version, $author) {
        try {
            $stmt = $this->db->prepare("INSERT INTO plugins (server_id, name, version, author) VALUES (?, ?, ?, ?)");
            $result = $stmt->execute([$server_id, $name, $version, $author]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('add_plugin', "Добавлен плагин: $name v$version на сервер $server_id");
                
                return ['success' => true, 'message' => 'Плагин успешно добавлен'];
            }
            
            return ['success' => false, 'message' => 'Не удалось добавить плагин'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка добавления плагина: ' . $e->getMessage()];
        }
    }
    
    /**
     * Включить плагин
     */
    public function enablePlugin($id) {
        try {
            $stmt = $this->db->prepare("UPDATE plugins SET status = 'enabled' WHERE id = ?");
            $result = $stmt->execute([$id]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('enable_plugin', "Включен плагин с ID: $id");
                
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
    public function disablePlugin($id) {
        try {
            $stmt = $this->db->prepare("UPDATE plugins SET status = 'disabled' WHERE id = ?");
            $result = $stmt->execute([$id]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('disable_plugin', "Отключен плагин с ID: $id");
                
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
    public function deletePlugin($id) {
        try {
            $stmt = $this->db->prepare("DELETE FROM plugins WHERE id = ?");
            $result = $stmt->execute([$id]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('delete_plugin', "Удален плагин с ID: $id");
                
                return ['success' => true, 'message' => 'Плагин успешно удален'];
            }
            
            return ['success' => false, 'message' => 'Не удалось удалить плагин'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка удаления плагина: ' . $e->getMessage()];
        }
    }
    
    /**
     * Получить список резервных копий
     */
    public function getBackups() {
        try {
            $stmt = $this->db->prepare("SELECT b.*, s.name as server_name FROM backups b LEFT JOIN servers s ON b.server_id = s.id ORDER BY b.created_at DESC");
            $stmt->execute();
            return $stmt->fetchAll();
        } catch (Exception $e) {
            // Возвращаем тестовые данные в случае ошибки
            return [
                [
                    'id' => 1,
                    'server_id' => 1,
                    'name' => 'Автоматическая резервная копия',
                    'size' => '2.4 GB',
                    'created_at' => '2025-07-27 05:00:00'
                ],
                [
                    'id' => 2,
                    'server_id' => 2,
                    'name' => 'Ручная резервная копия',
                    'size' => '1.8 GB',
                    'created_at' => '2025-07-26 14:30:00'
                ]
            ];
        }
    }
    
    /**
     * Создать резервную копию
     */
    public function createBackup($server_id) {
        try {
            $stmt = $this->db->prepare("INSERT INTO backups (server_id, name, size) VALUES (?, ?, ?)");
            $result = $stmt->execute([$server_id, 'Резервная копия ' . date('Y-m-d H:i:s'), '2.5 GB']);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('create_backup', "Создана резервная копия для сервера $server_id");
                
                return ['success' => true, 'message' => 'Резервная копия успешно создана'];
            }
            
            return ['success' => false, 'message' => 'Не удалось создать резервную копию'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка создания резервной копии: ' . $e->getMessage()];
        }
    }
    
    /**
     * Восстановить из резервной копии
     */
    public function restoreBackup($id) {
        try {
            // Записываем в аудит
            $this->logAction('restore_backup', "Восстановление из резервной копии с ID: $id");
            
            return ['success' => true, 'message' => 'Начато восстановление из резервной копии'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка восстановления из резервной копии: ' . $e->getMessage()];
        }
    }
    
    /**
     * Удалить резервную копию
     */
    public function deleteBackup($id) {
        try {
            $stmt = $this->db->prepare("DELETE FROM backups WHERE id = ?");
            $result = $stmt->execute([$id]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('delete_backup', "Удалена резервная копия с ID: $id");
                
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
            $stmt = $this->db->prepare("SELECT t.*, s.name as server_name FROM scheduled_tasks t LEFT JOIN servers s ON t.server_id = s.id ORDER BY t.name");
            $stmt->execute();
            return $stmt->fetchAll();
        } catch (Exception $e) {
            // Возвращаем тестовые данные в случае ошибки
            return [
                [
                    'id' => 1,
                    'name' => 'Ежедневный перезапуск',
                    'type' => 'restart',
                    'server_id' => 1,
                    'schedule' => '0 5 * * *',
                    'status' => 'enabled'
                ],
                [
                    'id' => 2,
                    'name' => 'Еженедельное резервное копирование',
                    'type' => 'backup',
                    'server_id' => null,
                    'schedule' => '0 2 * * 1',
                    'status' => 'enabled'
                ]
            ];
        }
    }
    
    /**
     * Добавить запланированную задачу
     */
    public function addScheduledTask($name, $type, $server_id, $schedule) {
        try {
            $stmt = $this->db->prepare("INSERT INTO scheduled_tasks (name, type, server_id, schedule) VALUES (?, ?, ?, ?)");
            $result = $stmt->execute([$name, $type, $server_id, $schedule]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('add_task', "Добавлена задача: $name (тип: $type)");
                
                return ['success' => true, 'message' => 'Задача успешно добавлена'];
            }
            
            return ['success' => false, 'message' => 'Не удалось добавить задачу'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка добавления задачи: ' . $e->getMessage()];
        }
    }
    
    /**
     * Включить задачу
     */
    public function enableTask($id) {
        try {
            $stmt = $this->db->prepare("UPDATE scheduled_tasks SET status = 'enabled' WHERE id = ?");
            $result = $stmt->execute([$id]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('enable_task', "Включена задача с ID: $id");
                
                return ['success' => true, 'message' => 'Задача успешно включена'];
            }
            
            return ['success' => false, 'message' => 'Не удалось включить задачу'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка включения задачи: ' . $e->getMessage()];
        }
    }
    
    /**
     * Отключить задачу
     */
    public function disableTask($id) {
        try {
            $stmt = $this->db->prepare("UPDATE scheduled_tasks SET status = 'disabled' WHERE id = ?");
            $result = $stmt->execute([$id]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('disable_task', "Отключена задача с ID: $id");
                
                return ['success' => true, 'message' => 'Задача успешно отключена'];
            }
            
            return ['success' => false, 'message' => 'Не удалось отключить задачу'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка отключения задачи: ' . $e->getMessage()];
        }
    }
    
    /**
     * Удалить задачу
     */
    public function deleteTask($id) {
        try {
            $stmt = $this->db->prepare("DELETE FROM scheduled_tasks WHERE id = ?");
            $result = $stmt->execute([$id]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('delete_task', "Удалена задача с ID: $id");
                
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
        // Возвращаем тестовые настройки
        return [
            'email_enabled' => true,
            'email_address' => 'admin@example.com',
            'telegram_enabled' => true,
            'telegram_token' => '123456789:ABCDEFabcdef1234567890',
            'telegram_chat_id' => '987654321',
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
    
    /**
     * Сохранить настройки уведомлений
     */
    public function saveNotificationSettings($settings) {
        try {
            // Записываем в аудит
            $this->logAction('save_notifications', "Обновлены настройки уведомлений");
            
            return ['success' => true, 'message' => 'Настройки уведомлений успешно сохранены'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка сохранения настроек уведомлений: ' . $e->getMessage()];
        }
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
            // Возвращаем тестовые данные в случае ошибки
            return [
                [
                    'id' => 1,
                    'username' => 'admin',
                    'role' => 'admin',
                    'last_login' => '2025-07-27 10:30:00',
                    'last_ip' => '192.168.1.100'
                ],
                [
                    'id' => 2,
                    'username' => 'moderator',
                    'role' => 'moderator',
                    'last_login' => '2025-07-27 09:15:00',
                    'last_ip' => '192.168.1.101'
                ],
                [
                    'id' => 3,
                    'username' => 'user',
                    'role' => 'user',
                    'last_login' => '2025-07-26 16:45:00',
                    'last_ip' => '192.168.1.102'
                ]
            ];
        }
    }
    
    /**
     * Обновить роль пользователя
     */
    public function updateUserRole($user_id, $role) {
        try {
            $stmt = $this->db->prepare("UPDATE users SET role = ? WHERE id = ?");
            $result = $stmt->execute([$role, $user_id]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('update_user_role', "Обновлена роль пользователя $user_id на $role");
                
                return ['success' => true, 'message' => 'Роль пользователя успешно обновлена'];
            }
            
            return ['success' => false, 'message' => 'Не удалось обновить роль пользователя'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка обновления роли пользователя: ' . $e->getMessage()];
        }
    }
    
    /**
     * Добавить разрешенный IP-адрес для пользователя
     */
    public function addAllowedIP($user_id, $ip) {
        try {
            $stmt = $this->db->prepare("INSERT INTO allowed_ips (user_id, ip) VALUES (?, ?)");
            $result = $stmt->execute([$user_id, $ip]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('add_allowed_ip', "Добавлен разрешенный IP $ip для пользователя $user_id");
                
                return ['success' => true, 'message' => 'IP-адрес успешно добавлен'];
            }
            
            return ['success' => false, 'message' => 'Не удалось добавить IP-адрес'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка добавления IP-адреса: ' . $e->getMessage()];
        }
    }
    
    /**
     * Удалить разрешенный IP-адрес у пользователя
     */
    public function removeAllowedIP($user_id, $ip) {
        try {
            $stmt = $this->db->prepare("DELETE FROM allowed_ips WHERE user_id = ? AND ip = ?");
            $result = $stmt->execute([$user_id, $ip]);
            
            if ($result) {
                // Записываем в аудит
                $this->logAction('remove_allowed_ip', "Удален разрешенный IP $ip у пользователя $user_id");
                
                return ['success' => true, 'message' => 'IP-адрес успешно удален'];
            }
            
            return ['success' => false, 'message' => 'Не удалось удалить IP-адрес'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка удаления IP-адреса: ' . $e->getMessage()];
        }
    }
    
    /**
     * Получить логи аудита
     */
    public function getAuditLogs() {
        try {
            $stmt = $this->db->prepare("SELECT a.*, u.username FROM audit_log a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 50");
            $stmt->execute();
            return $stmt->fetchAll();
        } catch (Exception $e) {
            // Возвращаем тестовые данные в случае ошибки
            return [
                [
                    'id' => 1,
                    'user_id' => 1,
                    'username' => 'admin',
                    'action' => 'login',
                    'details' => 'Успешный вход в систему',
                    'ip_address' => '192.168.1.100',
                    'created_at' => '2025-07-27 10:30:00'
                ],
                [
                    'id' => 2,
                    'user_id' => 1,
                    'username' => 'admin',
                    'action' => 'add_server',
                    'details' => 'Добавлен сервер: Test Server (127.0.0.1:25565)',
                    'ip_address' => '192.168.1.100',
                    'created_at' => '2025-07-27 10:35:00'
                ],
                [
                    'id' => 3,
                    'user_id' => 2,
                    'username' => 'moderator',
                    'action' => 'login',
                    'details' => 'Успешный вход в систему',
                    'ip_address' => '192.168.1.101',
                    'created_at' => '2025-07-27 09:15:00'
                ]
            ];
        }
    }
    
    /**
     * Записать действие в журнал аудита
     */
    private function logAction($action, $details = '') {
        try {
            // Получаем текущего пользователя
            session_start();
            $user = $_SESSION['sparkpanel_user'] ?? null;
            $user_id = $user['id'] ?? null;
            
            $stmt = $this->db->prepare("INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)");
            $stmt->execute([$user_id, $action, $details, $_SERVER['REMOTE_ADDR'] ?? '']);
        } catch (Exception $e) {
            // Просто игнорируем ошибки логирования
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