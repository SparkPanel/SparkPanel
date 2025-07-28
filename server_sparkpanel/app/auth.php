<?php
/**
 * Файл аутентификации SparkPanel
 */

class Auth {
    private $db;
    
    public function __construct($database) {
        $this->db = $database;
    }
    
    /**
     * Проверка входа пользователя
     */
    public function login($username, $password, $twofa_code = null) {
        try {
            // Получаем пользователя из базы данных
            $stmt = $this->db->prepare("SELECT id, username, password, role, twofa_enabled, twofa_secret FROM users WHERE username = ?");
            $stmt->execute([$username]);
            $user = $stmt->fetch();
            
            if (!$user) {
                $this->logAuditAction(null, 'login_failed', 'Пользователь не найден: ' . $username, $_SERVER['REMOTE_ADDR']);
                return ['success' => false, 'message' => 'Неверное имя пользователя или пароль'];
            }
            
            // Проверяем пароль
            if (!password_verify($password, $user['password'])) {
                $this->logAuditAction($user['id'], 'login_failed', 'Неверный пароль для пользователя: ' . $username, $_SERVER['REMOTE_ADDR']);
                return ['success' => false, 'message' => 'Неверное имя пользователя или пароль'];
            }
            
            // Проверка двухфакторной аутентификации, если включена
            if ($user['twofa_enabled']) {
                if (empty($twofa_code)) {
                    return ['success' => false, 'message' => 'Требуется код двухфакторной аутентификации', 'twofa_required' => true];
                }
                
                if (!$this->verifyTwoFACode($user['twofa_secret'], $twofa_code)) {
                    $this->logAuditAction($user['id'], 'login_failed', 'Неверный код двухфакторной аутентификации', $_SERVER['REMOTE_ADDR']);
                    return ['success' => false, 'message' => 'Неверный код двухфакторной аутентификации'];
                }
            }
            
            // Проверка ограничений по IP
            if (!$this->checkIPRestriction($user['id'])) {
                $this->logAuditAction($user['id'], 'login_failed', 'Доступ с данного IP-адреса запрещен', $_SERVER['REMOTE_ADDR']);
                return ['success' => false, 'message' => 'Доступ с данного IP-адреса запрещен'];
            }
            
            // Обновляем время последнего входа и IP
            $stmt = $this->db->prepare("UPDATE users SET last_login = NOW(), last_ip = ? WHERE id = ?");
            $stmt->execute([$_SERVER['REMOTE_ADDR'], $user['id']]);
            
            $_SESSION['loggedin'] = true;
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $user['username'];
            $_SESSION['role'] = $user['role'];
            $_SESSION['login_time'] = time();
            
            // Записываем в аудит
            $this->logAuditAction($user['id'], 'login', 'Успешный вход в систему', $_SERVER['REMOTE_ADDR']);
            
            return ['success' => true, 'message' => 'Вход выполнен успешно'];
        } catch (Exception $e) {
            error_log("Ошибка входа: " . $e->getMessage());
            return ['success' => false, 'message' => 'Ошибка аутентификации'];
        }
    }
    
    /**
     * Выход пользователя
     */
    public function logout() {
        if (isset($_SESSION['user_id'])) {
            $this->logAuditAction($_SESSION['user_id'], 'logout', 'Выход из системы', $_SERVER['REMOTE_ADDR']);
        }
        
        session_destroy();
        header('Location: index.php');
        exit;
    }
    
    /**
     * Проверка, авторизован ли пользователь
     */
    public function isLoggedIn() {
        // Проверка времени сессии (30 минут)
        if (isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true) {
            if (time() - $_SESSION['login_time'] > 1800) { // 30 минут
                $this->logout(); // Сессия истекла
                return false;
            }
            
            // Проверка IP-адреса
            if (!$this->checkIPRestriction($_SESSION['user_id'])) {
                $this->logout();
                return false;
            }
            
            // Обновляем время активности
            $_SESSION['login_time'] = time();
            return true;
        }
        return false;
    }
    
    /**
     * Проверка роли пользователя
     */
    public function hasRole($role) {
        return isset($_SESSION['role']) && $_SESSION['role'] === $role;
    }
    
    /**
     * Проверка разрешений пользователя
     */
    public function hasPermission($permission) {
        if (!isset($_SESSION['role'])) {
            return false;
        }
        
        // Определяем разрешения для каждой роли
        $permissions = [
            'admin' => [
                'manage_servers', 'manage_users', 'view_logs', 'manage_plugins', 
                'manage_backups', 'manage_settings', 'manage_security', 'view_audit'
            ],
            'moderator' => [
                'manage_servers', 'view_logs', 'manage_plugins', 'view_audit'
            ],
            'user' => [
                'view_servers', 'view_logs'
            ]
        ];
        
        return in_array($permission, $permissions[$_SESSION['role']] ?? []);
    }
    
    /**
     * Получение роли пользователя
     */
    public function getUserRole($username) {
        try {
            $stmt = $this->db->prepare("SELECT role FROM users WHERE username = ?");
            $stmt->execute([$username]);
            $result = $stmt->fetch();
            return $result ? $result['role'] : 'user';
        } catch (Exception $e) {
            return 'user';
        }
    }
    
    /**
     * Проверка включена ли двухфакторная аутентификация
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
     * Верификация кода двухфакторной аутентификации
     */
    private function verifyTwoFACode($secret, $code) {
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
     * Включение двухфакторной аутентификации
     */
    public function enableTwoFA($user_id) {
        try {
            // Генерируем секретный ключ
            $secret = $this->generateSecret();
            
            $stmt = $this->db->prepare("UPDATE users SET twofa_enabled = 1, twofa_secret = ? WHERE id = ?");
            $result = $stmt->execute([$secret, $user_id]);
            
            if ($result) {
                $this->logAuditAction($user_id, 'security', 'Включена двухфакторная аутентификация', $_SERVER['REMOTE_ADDR']);
                return ['success' => true, 'secret' => $secret];
            }
            
            return ['success' => false, 'message' => 'Не удалось включить двухфакторную аутентификацию'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка включения двухфакторной аутентификации'];
        }
    }
    
    /**
     * Отключение двухфакторной аутентификации
     */
    public function disableTwoFA($user_id) {
        try {
            $stmt = $this->db->prepare("UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = ?");
            $result = $stmt->execute([$user_id]);
            
            if ($result) {
                $this->logAuditAction($user_id, 'security', 'Отключена двухфакторная аутентификация', $_SERVER['REMOTE_ADDR']);
                return ['success' => true];
            }
            
            return ['success' => false, 'message' => 'Не удалось отключить двухфакторную аутентификацию'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка отключения двухфакторной аутентификации'];
        }
    }
    
    /**
     * Генерация секретного ключа для 2FA
     */
    private function generateSecret($length = 16) {
        $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $secret = '';
        for ($i = 0; $i < $length; $i++) {
            $secret .= $chars[rand(0, strlen($chars) - 1)];
        }
        return $secret;
    }
    
    /**
     * Генерация QR-кода для настройки 2FA
     */
    public function generateQRCode($username, $secret) {
        // В реальной реализации здесь будет генерация QR-кода
        // Для демонстрации возвращаем URL для Google Authenticator
        $issuer = 'SparkPanel';
        $url = 'otpauth://totp/' . $issuer . ':' . $username . '?secret=' . $secret . '&issuer=' . $issuer;
        return $url;
    }
    
    /**
     * Проверка ограничений по IP-адресу
     */
    private function checkIPRestriction($user_id) {
        try {
            // Получаем IP-адрес пользователя
            $user_ip = $_SERVER['REMOTE_ADDR'];
            
            // Проверяем, есть ли ограничения по IP для пользователя
            $stmt = $this->db->prepare("SELECT COUNT(*) as count FROM allowed_ips WHERE user_id = ?");
            $stmt->execute([$user_id]);
            $result = $stmt->fetch();
            
            // Если нет ограничений, разрешаем доступ
            if ($result['count'] == 0) {
                return true;
            }
            
            // Проверяем, находится ли IP пользователя в списке разрешенных
            $stmt = $this->db->prepare("SELECT id FROM allowed_ips WHERE user_id = ? AND ip_address = ?");
            $stmt->execute([$user_id, $user_ip]);
            $result = $stmt->fetch();
            
            return $result ? true : false;
        } catch (Exception $e) {
            // В случае ошибки разрешаем доступ
            return true;
        }
    }
    
    /**
     * Получение разрешенных IP-адресов для пользователя
     */
    public function getAllowedIPs($user_id) {
        try {
            $stmt = $this->db->prepare("SELECT ip_address FROM allowed_ips WHERE user_id = ?");
            $stmt->execute([$user_id]);
            $results = $stmt->fetchAll();
            
            $ips = [];
            foreach ($results as $row) {
                $ips[] = $row['ip_address'];
            }
            
            return $ips;
        } catch (Exception $e) {
            return [];
        }
    }
    
    /**
     * Добавление разрешенного IP-адреса
     */
    public function addAllowedIP($user_id, $ip) {
        try {
            // Проверяем, не добавлен ли уже этот IP
            $stmt = $this->db->prepare("SELECT id FROM allowed_ips WHERE user_id = ? AND ip_address = ?");
            $stmt->execute([$user_id, $ip]);
            if ($stmt->fetch()) {
                return ['success' => false, 'message' => 'IP-адрес уже добавлен'];
            }
            
            // Добавляем новый IP
            $stmt = $this->db->prepare("INSERT INTO allowed_ips (user_id, ip_address) VALUES (?, ?)");
            $result = $stmt->execute([$user_id, $ip]);
            
            if ($result) {
                $this->logAuditAction($user_id, 'security', 'Добавлен разрешенный IP: ' . $ip, $_SERVER['REMOTE_ADDR']);
                return ['success' => true];
            }
            
            return ['success' => false, 'message' => 'Не удалось добавить IP-адрес'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка добавления IP-адреса'];
        }
    }
    
    /**
     * Удаление разрешенного IP-адреса
     */
    public function removeAllowedIP($user_id, $ip) {
        try {
            $stmt = $this->db->prepare("DELETE FROM allowed_ips WHERE user_id = ? AND ip_address = ?");
            $result = $stmt->execute([$user_id, $ip]);
            
            if ($result) {
                $this->logAuditAction($user_id, 'security', 'Удален разрешенный IP: ' . $ip, $_SERVER['REMOTE_ADDR']);
                return ['success' => true];
            }
            
            return ['success' => false, 'message' => 'Не удалось удалить IP-адрес'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка удаления IP-адреса'];
        }
    }
    
    /**
     * Запись действия в аудит
     */
    public function logAuditAction($user_id, $action, $details, $ip_address) {
        try {
            $username = null;
            if ($user_id) {
                $stmt = $this->db->prepare("SELECT username FROM users WHERE id = ?");
                $stmt->execute([$user_id]);
                $user = $stmt->fetch();
                $username = $user ? $user['username'] : 'Unknown';
            }
            
            $stmt = $this->db->prepare(
                "INSERT INTO audit_log (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)"
            );
            $stmt->execute([$user_id, $username, $action, $details, $ip_address]);
        } catch (Exception $e) {
            error_log("Ошибка записи в аудит: " . $e->getMessage());
        }
    }
    
    /**
     * Получение логов аудита
     */
    public function getAuditLogs($limit = 50, $offset = 0) {
        try {
            $stmt = $this->db->prepare("
                SELECT id, username, action, details, ip_address, created_at 
                FROM audit_log 
                ORDER BY created_at DESC 
                LIMIT ? OFFSET ?
            ");
            $stmt->execute([$limit, $offset]);
            return $stmt->fetchAll();
        } catch (Exception $e) {
            return [];
        }
    }
    
    /**
     * Получение пользователей
     */
    public function getUsers() {
        try {
            $stmt = $this->db->prepare("SELECT id, username, role, last_login, last_ip FROM users ORDER BY username");
            $stmt->execute();
            return $stmt->fetchAll();
        } catch (Exception $e) {
            return [];
        }
    }
    
    /**
     * Обновление роли пользователя
     */
    public function updateUserRole($user_id, $role) {
        try {
            $stmt = $this->db->prepare("UPDATE users SET role = ? WHERE id = ?");
            $result = $stmt->execute([$role, $user_id]);
            
            if ($result) {
                $this->logAuditAction($_SESSION['user_id'], 'user_management', 'Обновлена роль пользователя ID ' . $user_id . ' на ' . $role, $_SERVER['REMOTE_ADDR']);
                return ['success' => true];
            }
            
            return ['success' => false, 'message' => 'Не удалось обновить роль пользователя'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка обновления роли пользователя'];
        }
    }
    
    /**
     * Создание нового пользователя
     */
    public function createUser($username, $password, $role = 'user') {
        try {
            // Проверяем, не существует ли уже пользователь с таким именем
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
                $userId = $this->db->lastInsertId();
                $this->logAuditAction($_SESSION['user_id'], 'user_management', 'Создан новый пользователь: ' . $username, $_SERVER['REMOTE_ADDR']);
                return ['success' => true, 'user_id' => $userId];
            }
            
            return ['success' => false, 'message' => 'Не удалось создать пользователя'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка создания пользователя'];
        }
    }
    
    /**
     * Удаление пользователя
     */
    public function deleteUser($user_id) {
        try {
            // Не позволяем удалить самого себя
            if ($user_id == $_SESSION['user_id']) {
                return ['success' => false, 'message' => 'Нельзя удалить самого себя'];
            }
            
            $stmt = $this->db->prepare("DELETE FROM users WHERE id = ?");
            $result = $stmt->execute([$user_id]);
            
            if ($result) {
                $this->logAuditAction($_SESSION['user_id'], 'user_management', 'Удален пользователь ID: ' . $user_id, $_SERVER['REMOTE_ADDR']);
                return ['success' => true];
            }
            
            return ['success' => false, 'message' => 'Не удалось удалить пользователя'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Ошибка удаления пользователя'];
        }
    }
}

// Инициализация сессии
session_start();

// Обработка выхода
if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    // Подключение к базе данных
    require_once 'config/db.php';
    $db = getDBConnection();
    $auth = new Auth($db);
    $auth->logout();
}
?>