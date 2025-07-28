<?php
/**
 * Конфигурация базы данных SparkPanel
 */

// Параметры подключения к базе данных
define('DB_HOST', 'localhost');
define('DB_USER', 'sparkpanel');
define('DB_PASS', 'password');
define('DB_NAME', 'sparkpanel');

// Функция для подключения к базе данных
function getDBConnection() {
    try {
        $pdo = new PDO(
            "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8",
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ]
        );
        return $pdo;
    } catch (PDOException $e) {
        die("Ошибка подключения к базе данных: " . $e->getMessage());
    }
}

// Инициализация таблиц (для установки)
function initializeDatabase() {
    $pdo = getDBConnection();
    
    // Создание таблицы пользователей
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role ENUM('admin', 'moderator', 'user') DEFAULT 'user',
            twofa_secret VARCHAR(255) NULL,
            last_login TIMESTAMP NULL,
            last_ip VARCHAR(45) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ");
    
    // Создание таблицы серверов
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS servers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            ip VARCHAR(45) NOT NULL,
            port INT NOT NULL,
            status ENUM('online', 'offline') DEFAULT 'offline',
            players VARCHAR(20) DEFAULT '0/20',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ");
    
    // Создание таблицы плагинов
    
    // Создание таблицы фоновых задач
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS background_jobs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            job_type VARCHAR(50) NOT NULL,
            payload TEXT,
            priority INT DEFAULT 0,
            status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMP NULL,
            finished_at TIMESTAMP NULL,
            error_message TEXT
        )
    ");
    
    // Создание таблицы кэша
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS cache (
            id VARCHAR(255) PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ");
    
    // Создание таблицы метрик производительности
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS performance_metrics (
            id INT AUTO_INCREMENT PRIMARY KEY,
            metric_type VARCHAR(50) NOT NULL,
            value DECIMAL(10,2) NOT NULL,
            server_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        )
    ");
    
    // Добавление индексов для оптимизации
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS plugins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            server_id INT,
            name VARCHAR(100) NOT NULL,
            version VARCHAR(20) NOT NULL,
            author VARCHAR(100) NOT NULL,
            status ENUM('enabled', 'disabled') DEFAULT 'enabled',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        )
    ");
    
    // Создание таблицы резервных копий
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS backups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            server_id INT,
            name VARCHAR(255) NOT NULL,
            size VARCHAR(20),
            path VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        )
    ");
    
    // Создание таблицы запланированных задач
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS scheduled_tasks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            server_id INT NULL,
            task_type ENUM('restart', 'backup', 'command', 'notification') NOT NULL,
            schedule VARCHAR(100) NOT NULL,
            status ENUM('enabled', 'disabled') DEFAULT 'enabled',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        )
    ");
    
    // Создание таблицы настроек уведомлений
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS notification_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email_enabled BOOLEAN DEFAULT FALSE,
            email_address VARCHAR(255),
            telegram_enabled BOOLEAN DEFAULT FALSE,
            telegram_token VARCHAR(255),
            telegram_chat_id VARCHAR(100),
            discord_enabled BOOLEAN DEFAULT FALSE,
            discord_webhook VARCHAR(500),
            notifications TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ");
    
    // Создание таблицы разрешенных IP-адресов
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS allowed_ips (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            ip_address VARCHAR(45) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");
    
    // Создание таблицы аудита
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS audit_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,
            username VARCHAR(50),
            action VARCHAR(100) NOT NULL,
            details TEXT,
            ip_address VARCHAR(45),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    ");
    
    // Добавление индексов для оптимизации
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_audit_log_username ON audit_log(username)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(created_at)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_plugins_server ON plugins(server_id)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_backups_server ON backups(server_id)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_background_jobs_priority ON background_jobs(priority)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_performance_metrics_type ON performance_metrics(metric_type)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(created_at)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at)");
    
    // Создание администратора по умолчанию (если не существует)
    try {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
        $stmt->execute();
        $adminExists = $stmt->fetch();
        
        if (!$adminExists) {
            $hashedPassword = password_hash('admin', PASSWORD_DEFAULT);
            $pdo->prepare("INSERT INTO users (username, password, role) VALUES ('admin', ?, 'admin')")->execute([$hashedPassword]);
        }
    } catch (Exception $e) {
        // Игнорируем ошибки создания пользователя
    }
}
?>