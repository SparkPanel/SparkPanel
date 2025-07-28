<?php
/**
 * Файл аутентификации и авторизации SparkPanel
 */

class Auth {
    private $db;
    private $session_name = 'sparkpanel_user';
    
    public function __construct($database) {
        $this->db = $database;
        // Запускаем сессию, если она еще не запущена
        if (session_status() == PHP_SESSION_NONE) {
            session_start();
        }
    }
    
    /**
     * Проверка, авторизован ли пользователь
     */
    public function isLoggedIn() {
        return isset($_SESSION[$this->session_name]) && !empty($_SESSION[$this->session_name]);
    }
    
    /**
     * Получение данных текущего пользователя
     */
    public function getUser() {
        return $_SESSION[$this->session_name] ?? null;
    }
    
    /**
     * Вход в систему
     */
    public function login($username, $password, $twofa_code = '') {
        try {
            // Проверяем существование пользователя
            $stmt = $this->db->prepare("SELECT * FROM users WHERE username = ?");
            $stmt->execute([$username]);
            $user = $stmt->fetch();
            
            if (!$user) {
                return ['success' => false, 'message' => 'Неверное имя пользователя или пароль'];
            }
            
            // Проверяем пароль
            if (!password_verify($password, $user['password'])) {
                return ['success' => false, 'message' => 'Неверное имя пользователя или пароль'];
            }
            
            // Проверяем IP-адрес (если включены ограничения)
            if (!$this->isIPAllowed($user['id'])) {
                return ['success' => false, 'message' => 'Доступ с этого IP-адреса запрещен'];
            }
            
            // Проверяем двухфакторную аутентификацию
            if ($user['twofa_enabled']) {
                if (empty($twofa_code)) {
                    // Запрашиваем код 2FA
                    return ['success' => false, 'twofa_required' => true, 'message' => 'Введите код двухфакторной аутентификации'];
                }
                
                if (!$this->verifyTwoFA($user['twofa_secret'], $twofa_code)) {
                    return ['success' => false, 'message' => 'Неверный код двухфакторной аутентификации'];
                }
            }
            
            // Обновляем информацию о последнем входе
            $this->updateLastLogin($user['id']);
            
            // Сохраняем пользователя в сессии
            $_SESSION[$this->session_name] = [
                'id' => $user['id'],
                'username' => $user['username'],
                'role' => $user['role']
            ];
            
            return ['success' => true, 'message' => 'Вход выполнен успешно'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка входа: ' . $e->getMessage()];
        }
    }
    
    /**
     * Выход из системы
     */
    public function logout() {
        unset($_SESSION[$this->session_name]);
        session_destroy();
        return ['success' => true, 'message' => 'Вы успешно вышли из системы'];
    }
    
    /**
     * Проверка, включена ли двухфакторная аутентификация для пользователя
     */
    public function isTwoFAEnabled($user_id) {
        try {
            $stmt = $this->db->prepare("SELECT twofa_enabled FROM users WHERE id = ?");
            $stmt->execute([$user_id]);
            $result = $stmt->fetch();
            return $result ? (bool)$result['twofa_enabled'] : false;
        } catch (Exception $e) {
            return false;
        }
    }
    
    /**
     * Включить двухфакторную аутентификацию
     */
    public function enableTwoFA($user_id) {
        try {
            // Генерируем секретный ключ
            $secret = $this->generateSecretKey();
            
            $stmt = $this->db->prepare("UPDATE users SET twofa_enabled = 1, twofa_secret = ? WHERE id = ?");
            $result = $stmt->execute([$secret, $user_id]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Двухфакторная аутентификация включена', 'secret' => $secret];
            }
            
            return ['success' => false, 'message' => 'Не удалось включить двухфакторную аутентификацию'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка включения 2FA: ' . $e->getMessage()];
        }
    }
    
    /**
     * Отключить двухфакторную аутентификацию
     */
    public function disableTwoFA($user_id) {
        try {
            $stmt = $this->db->prepare("UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = ?");
            $result = $stmt->execute([$user_id]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Двухфакторная аутентификация отключена'];
            }
            
            return ['success' => false, 'message' => 'Не удалось отключить двухфакторную аутентификацию'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка отключения 2FA: ' . $e->getMessage()];
        }
    }
    
    /**
     * Генерация секретного ключа для 2FA
     */
    private function generateSecretKey($length = 16) {
        $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $secret = '';
        for ($i = 0; $i < $length; $i++) {
            $secret .= $chars[mt_rand(0, strlen($chars) - 1)];
        }
        return $secret;
    }
    
    /**
     * Проверка кода двухфакторной аутентификации
     */
    private function verifyTwoFA($secret, $code) {
        // Реализация TOTP (Time-Based One-Time Password)
        // Используем алгоритм RFC 6238
        
        // Декодируем секрет из base32
        $secret = $this->base32Decode($secret);
        
        // Получаем текущее время в 30-секундных интервалах (по стандарту TOTP)
        $time = floor(time() / 30);
        
        // Генерируем хэш по алгоритму HOTP
        $hash = hash_hmac('sha1', pack('N*', 0) . pack('N*', $time), $secret, true);
        
        // Получаем 4 байта смещения
        $offset = ord($hash[19]) & 0xf;
        
        // Получаем 4 байта значения
        $value = ((ord($hash[$offset]) & 0x7f) << 24) |
                 ((ord($hash[$offset + 1]) & 0xff) << 16) |
                 ((ord($hash[$offset + 2]) & 0xff) << 8) |
                 (ord($hash[$offset + 3]) & 0xff);
        
        // Получаем 6-значный код
        $calculatedCode = str_pad($value % 1000000, 6, '0', STR_PAD_LEFT);
        
        // Сравниваем с введенным кодом
        return hash_equals($calculatedCode, $code);
    }
    
    /**
     * Декодирование из base32
     */
    private function base32Decode($secret) {
        $base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $secret = strtoupper($secret);
        $buffer = 0;
        $bufferBits = 0;
        $output = '';
        
        for ($i = 0; $i < strlen($secret); $i++) {
            $char = $secret[$i];
            $value = strpos($base32Chars, $char);
            
            if ($value === false) {
                continue;
            }
            
            $buffer = ($buffer << 5) | $value;
            $bufferBits += 5;
            
            if ($bufferBits >= 8) {
                $bufferBits -= 8;
                $output .= chr(($buffer >> $bufferBits) & 0xFF);
            }
        }
        
        return $output;
    }
    
    /**
     * Получить список разрешенных IP-адресов для пользователя
     */
    public function getAllowedIPs($user_id) {
        try {
            $stmt = $this->db->prepare("SELECT ip FROM allowed_ips WHERE user_id = ?");
            $stmt->execute([$user_id]);
            $result = $stmt->fetchAll();
            return array_column($result, 'ip');
        } catch (Exception $e) {
            return [];
        }
    }
    
    /**
     * Проверка, разрешен ли IP-адрес для пользователя
     */
    private function isIPAllowed($user_id) {
        $allowedIPs = $this->getAllowedIPs($user_id);
        
        // Если список пуст, значит ограничения нет
        if (empty($allowedIPs)) {
            return true;
        }
        
        $currentIP = $_SERVER['REMOTE_ADDR'];
        return in_array($currentIP, $allowedIPs);
    }
    
    /**
     * Добавить IP-адрес в список разрешенных
     */
    public function addAllowedIP($user_id, $ip) {
        try {
            $stmt = $this->db->prepare("INSERT INTO allowed_ips (user_id, ip) VALUES (?, ?)");
            $result = $stmt->execute([$user_id, $ip]);
            
            if ($result) {
                return ['success' => true, 'message' => 'IP-адрес добавлен в список разрешенных'];
            }
            
            return ['success' => false, 'message' => 'Не удалось добавить IP-адрес'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка добавления IP: ' . $e->getMessage()];
        }
    }
    
    /**
     * Удалить IP-адрес из списка разрешенных
     */
    public function removeAllowedIP($user_id, $ip) {
        try {
            $stmt = $this->db->prepare("DELETE FROM allowed_ips WHERE user_id = ? AND ip = ?");
            $result = $stmt->execute([$user_id, $ip]);
            
            if ($result) {
                return ['success' => true, 'message' => 'IP-адрес удален из списка разрешенных'];
            }
            
            return ['success' => false, 'message' => 'Не удалось удалить IP-адрес'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка удаления IP: ' . $e->getMessage()];
        }
    }
    
    /**
     * Проверка роли пользователя
     */
    public function hasRole($role) {
        $user = $this->getUser();
        return $user && $user['role'] === $role;
    }
    
    /**
     * Проверка наличия разрешения у пользователя
     */
    public function hasPermission($permission) {
        $user = $this->getUser();
        if (!$user) {
            return false;
        }
        
        // Определяем разрешения для каждой роли
        $permissions = [
            'admin' => [
                'manage_servers', 'manage_plugins', 'manage_backups', 
                'manage_settings', 'manage_security', 'manage_users'
            ],
            'moderator' => [
                'manage_servers', 'manage_plugins', 'manage_backups'
            ],
            'user' => [
                'view_servers', 'view_stats', 'view_logs'
            ]
        ];
        
        $userPermissions = $permissions[$user['role']] ?? [];
        return in_array($permission, $userPermissions) || $user['role'] === 'admin';
    }
    
    /**
     * Создать нового пользователя
     */
    public function createUser($username, $password, $role = 'user') {
        try {
            // Проверяем, существует ли пользователь с таким именем
            $stmt = $this->db->prepare("SELECT id FROM users WHERE username = ?");
            $stmt->execute([$username]);
            if ($stmt->fetch()) {
                return ['success' => false, 'message' => 'Пользователь с таким именем уже существует'];
            }
            
            // Хешируем пароль
            $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
            
            // Создаем пользователя
            $stmt = $this->db->prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
            $result = $stmt->execute([$username, $hashedPassword, $role]);
            
            if ($result) {
                return ['success' => true, 'message' => 'Пользователь создан успешно'];
            }
            
            return ['success' => false, 'message' => 'Не удалось создать пользователя'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка создания пользователя: ' . $e->getMessage()];
        }
    }
    
    /**
     * Удалить пользователя
     */
    public function deleteUser($user_id) {
        try {
            // Не позволяем удалить самого себя
            $currentUser = $this->getUser();
            if ($currentUser && $currentUser['id'] == $user_id) {
                return ['success' => false, 'message' => 'Нельзя удалить самого себя'];
            }
            
            $stmt = $this->db->prepare("DELETE FROM users WHERE id = ?");
            $result = $stmt->execute([$user_id]);
            
            if ($result) {
                // Также удаляем разрешенные IP-адреса
                $stmt = $this->db->prepare("DELETE FROM allowed_ips WHERE user_id = ?");
                $stmt->execute([$user_id]);
                
                return ['success' => true, 'message' => 'Пользователь удален'];
            }
            
            return ['success' => false, 'message' => 'Не удалось удалить пользователя'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка удаления пользователя: ' . $e->getMessage()];
        }
    }
    
    /**
     * Обновить информацию о последнем входе
     */
    private function updateLastLogin($user_id) {
        try {
            $stmt = $this->db->prepare("UPDATE users SET last_login = NOW(), last_ip = ? WHERE id = ?");
            $stmt->execute([$_SERVER['REMOTE_ADDR'], $user_id]);
        } catch (Exception $e) {
            // Просто игнорируем ошибки обновления времени входа
        }
    }
}
?>