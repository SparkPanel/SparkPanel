import paramiko
import os
import tempfile


class SSHInstaller:
    def __init__(self, host, port, username, auth):
        self.host = host
        self.port = port
        self.username = username
        self.auth = auth  # Может быть пароль или путь к ключу
        self.ssh = None
        self.sftp = None

    def connect(self):
        """Подключение к серверу по SSH"""
        try:
            self.ssh = paramiko.SSHClient()
            self.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            # Определяем, является ли auth путем к ключу или паролем
            if os.path.isfile(self.auth):
                # Используем ключ
                self.ssh.connect(
                    hostname=self.host,
                    port=self.port,
                    username=self.username,
                    key_filename=self.auth,
                    timeout=30
                )
            else:
                # Используем пароль
                self.ssh.connect(
                    hostname=self.host,
                    port=self.port,
                    username=self.username,
                    password=self.auth,
                    timeout=30
                )
                
            self.sftp = self.ssh.open_sftp()
            return True
        except Exception as e:
            raise Exception(f"Ошибка подключения к серверу: {str(e)}")

    def install_stack(self):
        """Установка LAMP/LEMP стека"""
        try:
            # Определяем, какая ОС используется
            stdin, stdout, stderr = self.ssh.exec_command("cat /etc/os-release | grep '^ID='", get_pty=True)
            os_info = stdout.read().decode().strip()
            
            if "ubuntu" in os_info or "debian" in os_info:
                # Установка LEMP стека (Nginx, PHP, MySQL, Composer)
                commands = [
                    "apt-get update",
                    "apt-get install -y nginx php8.2 php8.2-fpm php8.2-mysql php8.2-xml php8.2-curl mysql-server composer ufw"
                ]
                
                for command in commands:
                    stdin, stdout, stderr = self.ssh.exec_command(f"sudo {command}", get_pty=True)
                    # Ждем завершения команды
                    exit_status = stdout.channel.recv_exit_status()
                    if exit_status != 0:
                        error = stderr.read().decode().strip()
                        raise Exception(f"Ошибка выполнения команды '{command}': {error}")
                
                # Запуск и включение сервисов
                services_commands = [
                    "systemctl start nginx",
                    "systemctl start mysql",
                    "systemctl enable nginx",
                    "systemctl enable mysql"
                ]
                
                for command in services_commands:
                    stdin, stdout, stderr = self.ssh.exec_command(command, get_pty=True)
                    exit_status = stdout.channel.recv_exit_status()
                    if exit_status != 0:
                        error = stderr.read().decode().strip()
                        raise Exception(f"Ошибка выполнения команды '{command}': {error}")
            else:
                raise Exception(f"Неподдерживаемая операционная система: {os_info}")
        except Exception as e:
            raise Exception(f"Ошибка установки стека: {str(e)}")

    def deploy_sparkpanel(self):
        """Загрузка и разворачивание SparkPanel"""
        try:
            # Создаем структуру директорий на сервере
            commands = [
                "mkdir -p /var/www/sparkpanel/public/assets",
                "mkdir -p /var/www/sparkpanel/app",
                "mkdir -p /var/www/sparkpanel/config",
                "mkdir -p /var/www/sparkpanel/install"
            ]
            
            for command in commands:
                stdin, stdout, stderr = self.ssh.exec_command(command, get_pty=True)
                exit_status = stdout.channel.recv_exit_status()
                if exit_status != 0:
                    error = stderr.read().decode().strip()
                    raise Exception(f"Ошибка выполнения команды '{command}': {error}")
            
            # Загружаем файлы из клиентской части
            local_base_path = os.path.join(os.path.dirname(__file__), "..", "server_sparkpanel")
            
            # Загружаем основные файлы
            files_to_upload = [
                ("public/index.php", "/var/www/sparkpanel/public/index.php"),
                ("public/login.php", "/var/www/sparkpanel/public/login.php"),
                ("app/auth.php", "/var/www/sparkpanel/app/auth.php"),
                ("app/server_manager.php", "/var/www/sparkpanel/app/server_manager.php"),
                ("app/monitoring.php", "/var/www/sparkpanel/app/monitoring.php"),
                ("app/cache.php", "/var/www/sparkpanel/app/cache.php"),
                ("app/background_jobs.php", "/var/www/sparkpanel/app/background_jobs.php"),
                ("app/logger.php", "/var/www/sparkpanel/app/logger.php"),
                ("app/updater.php", "/var/www/sparkpanel/app/updater.php"),
                ("app/documentation.php", "/var/www/sparkpanel/app/documentation.php"),
                ("config/db.php", "/var/www/sparkpanel/config/db.php"),
                ("install/setup.sh", "/var/www/sparkpanel/install/setup.sh"),
                ("cron/process_jobs.php", "/var/www/sparkpanel/cron/process_jobs.php"),
                ("cron/hourly_stats.php", "/var/www/sparkpanel/cron/hourly_stats.php"),
                ("cron/daily_cleanup.php", "/var/www/sparkpanel/cron/daily_cleanup.php"),
                ("api/v1/index.php", "/var/www/sparkpanel/api/v1/index.php"),
                ("public/assets/style.css", "/var/www/sparkpanel/public/assets/style.css"),
                ("public/assets/script.js", "/var/www/sparkpanel/public/assets/script.js")
            ]
            
            for local_rel_path, remote_path in files_to_upload:
                local_path = os.path.join(local_base_path, local_rel_path)
                if os.path.exists(local_path):
                    self.sftp.put(local_path, remote_path)
                else:
                    raise Exception(f"Файл {local_path} не найден")
            
            # Устанавливаем правильные права доступа
            permissions_commands = [
                "chmod -R 755 /var/www/sparkpanel",
                "chown -R www-data:www-data /var/www/sparkpanel"
            ]
            ]
            
            for command in permissions_commands:
                stdin, stdout, stderr = self.ssh.exec_command(command, get_pty=True)
                exit_status = stdout.channel.recv_exit_status()
                if exit_status != 0:
                    error = stderr.read().decode().strip()
                    raise Exception(f"Ошибка выполнения команды '{command}': {error}")
                    
        except Exception as e:
            raise Exception(f"Ошибка развертывания SparkPanel: {str(e)}")

    def configure_webserver(self):
        """Настройка веб-сервера (Nginx)"""
        try:
            # Создаем конфигурационный файл Nginx
            nginx_config = '''
server {
    listen 80;
    server_name localhost;
    root /var/www/sparkpanel/public;
    index index.php;

    # Защита от прямого доступа к файлам
    location ~ ^/assets/ {
        allow all;
    }

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        
        # Добавляем заголовок User-Agent для проверки
        fastcgi_param HTTP_USER_AGENT $http_user_agent;
    }

    # Запрет доступа к чувствительным файлам
    location ~ /\. {
        deny all;
    }

    location ~ \.php~$ {
        deny all;
    }

    location ~ ~$ {
        deny all;
    }
}
'''
            
            # Создаем временный файл для конфигурации
            with tempfile.NamedTemporaryFile(mode='w', delete=False, encoding='utf-8') as f:
                f.write(nginx_config)
                temp_config_path = f.name
            
            # Загружаем конфигурацию на сервер
            self.sftp.put(temp_config_path, '/etc/nginx/sites-available/sparkpanel')
            os.unlink(temp_config_path)
            
            # Активируем сайт
            commands = [
                "ln -sf /etc/nginx/sites-available/sparkpanel /etc/nginx/sites-enabled/",
                "rm -f /etc/nginx/sites-enabled/default",
                "nginx -t",  # Проверяем конфигурацию
                "systemctl reload nginx"  # Перезагружаем Nginx
            ]
            
            for command in commands:
                stdin, stdout, stderr = self.ssh.exec_command(command, get_pty=True)
                exit_status = stdout.channel.recv_exit_status()
                if exit_status != 0:
                    error = stderr.read().decode().strip()
                    raise Exception(f"Ошибка выполнения команды '{command}': {error}")
                    
        except Exception as e:
            raise Exception(f"Ошибка настройки веб-сервера: {str(e)}")

    def setup_security(self):
        """Настройка дополнительных мер безопасности"""
        try:
            # Настройка UFW (брандмауэр)
            ufw_commands = [
                "ufw allow OpenSSH",  # Разрешаем SSH
                "ufw allow 'Nginx Full'",  # Разрешаем HTTP/HTTPS для Nginx
                "ufw --force enable"  # Включаем брандмауэр
            ]
            
            for command in ufw_commands:
                stdin, stdout, stderr = self.ssh.exec_command(f"echo 'y' | {command}", get_pty=True)
                exit_status = stdout.channel.recv_exit_status()
                # Пропускаем ошибки для ufw, так как они могут отличаться в разных системах
                
            # Установка fail2ban для защиты от брутфорса
            fail2ban_commands = [
                "apt-get install -y fail2ban",
                "systemctl start fail2ban",
                "systemctl enable fail2ban"
            ]
            
            for command in fail2ban_commands:
                stdin, stdout, stderr = self.ssh.exec_command(command, get_pty=True)
                exit_status = stdout.channel.recv_exit_status()
                # Пропускаем ошибки, если fail2ban не устанавливается
                
        except Exception as e:
            # Просто логируем ошибки безопасности, но не прерываем установку
            print(f"Предупреждение: проблемы с настройкой безопасности: {str(e)}")

    def disconnect(self):
        """Отключение от сервера"""
        if self.sftp:
            self.sftp.close()
        if self.ssh:
            self.ssh.close()

            <?php elseif ($_GET['page'] == 'notifications'): ?>
            <section id="notifications" class="page">
                <h2>Система уведомлений</h2>
                <div class="card">
                    <div class="card-header">
                        <h3>Настройки уведомлений</h3>
                    </div>
                    <div class="card-body">
                        <div class="notification-settings">
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" checked> Уведомления по Email
                                </label>
                            </div>
                            <div class="form-group">
                                <label>Email для уведомлений:</label>
                                <input type="email" class="form-control" value="admin@example.com">
                            </div>
                            
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" checked> Уведомления в Telegram
                                </label>
                            </div>
                            <div class="form-group">
                                <label>Telegram Bot Token:</label>
                                <input type="text" class="form-control" value="123456789:ABCdefGhIJKlmNoPQRstuvWXyz">
                            </div>
                            <div class="form-group">
                                <label>Chat ID:</label>
                                <input type="text" class="form-control" value="@myserverchannel">
                            </div>
                            
                            <div class="form-group">
                                <label>
                                    <input type="checkbox"> Уведомления в Discord
                                </label>
                            </div>
                            <div class="form-group">
                                <label>Discord Webhook URL:</label>
                                <input type="text" class="form-control" placeholder="https://discord.com/api/webhooks/...">
                            </div>
                            
                            <button class="btn btn-primary">Сохранить настройки</button>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Типы уведомлений</h3>
                    </div>
                    <div class="card-body">
                        <div class="notification-types">
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" checked> Уведомления о запуске/остановке сервера
                                </label>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" checked> Уведомления об ошибках
                                </label>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" checked> Уведомления о высокой нагрузке
                                </label>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox"> Уведомления о резервном копировании
                                </label>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox"> Уведомления о подключении игроков
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            
            <?php elseif ($_GET['page'] == 'stats'): ?>
            <section id="stats" class="page">
                <h2>Статистика</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">🖥️</div>
                        <div class="stat-info">
                            <h3>CPU</h3>
                            <div class="stat-value">42%</div>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: 42%"></div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">💾</div>
                        <div class="stat-info">
                            <h3>Память</h3>
                            <div class="stat-value">6.2 GB</div>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: 78%"></div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">🔌</div>
                        <div class="stat-info">
                            <h3>Серверы</h3>
                            <div class="stat-value">1/2</div>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: 50%"></div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">👥</div>
                        <div class="stat-info">
                            <h3>Игроки</h3>
                            <div class="stat-value">12</div>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: 60%"></div>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Мониторинг производительности в реальном времени</h3>
                    </div>
                    <div class="card-body">
                        <div class="chart-container">
                            <h4>Использование CPU</h4>
                            <div class="chart-placeholder cpu-chart">
                                <canvas id="cpuChart"></canvas>
                            </div>
                        </div>
                        
                        <div class="chart-container">
                            <h4>Использование памяти</h4>
                            <div class="chart-placeholder memory-chart">
                                <canvas id="memoryChart"></canvas>
                            </div>
                        </div>
                        
                        <div class="chart-container">
                            <h4>Активные игроки</h4>
                            <div class="chart-placeholder players-chart">
                                <canvas id="playersChart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <?php elseif ($_GET['page'] == 'logs'): ?>
            <section id="logs" class="page">
                <h2>Логи</h2>
                <div class="card">
                    <div class="card-header">
                        <h3>Последние записи</h3>
                        <div class="log-filters">
                            <button class="btn btn-sm btn-outline">Все</button>
                            <button class="btn btn-sm btn-warning">Предупреждения</button>
                            <button class="btn btn-sm btn-error">Ошибки</button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="log-list">
                            <div class="log-entry log-info">
                                <span class="log-time">[2025-07-27 10:00:00]</span>
                                <span class="log-type">[INFO]</span>
                                <span class="log-message">Сервер запущен</span>
                            </div>
                            <div class="log-entry log-info">
                                <span class="log-time">[2025-07-27 10:05:23]</span>
                                <span class="log-type">[INFO]</span>
                                <span class="log-message">Игрок Alex подключился</span>
                            </div>
                            <div class="log-entry log-warning">
                                <span class="log-time">[2025-07-27 10:15:42]</span>
                                <span class="log-type">[WARN]</span>
                                <span class="log-message">Низкая память: 85%</span>
                            </div>
                            <div class="log-entry log-info">
                                <span class="log-time">[2025-07-27 10:20:11]</span>
                                <span class="log-type">[INFO]</span>
                                <span class="log-message">Игрок Alex отключился</span>
                            </div>
                            <div class="log-entry log-error">
                                <span class="log-time">[2025-07-27 10:25:33]</span>
                                <span class="log-type">[ERROR]</span>
                                <span class="log-message">Ошибка плагина WorldEdit</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <?php endif; ?>
        </div>
    </main>
    
    <footer>
        <div class="container">
            <p>&copy; 2025 SparkPanel. Все права защищены.</p>
        </div>
    </footer>
    
    <script src="assets/script.js"></script>
</body>
</html>'''
            
            auth_content = '''<?php
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
    public function login($username, $password) {
        // В реальной реализации здесь будет проверка учетных данных
        // Пока используем простую проверку
        if ($username === 'admin' && $password === 'admin') {
            $_SESSION['loggedin'] = true;
            $_SESSION['username'] = $username;
            return true;
        }
        return false;
    }
    
    /**
     * Выход пользователя
     */
    public function logout() {
        session_destroy();
        header('Location: index.php');
        exit;
    }
    
    /**
     * Проверка, авторизован ли пользователь
     */
    public function isLoggedIn() {
        return isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true;
    }
}

// Инициализация сессии
session_start();

// Обработка выхода
if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    $auth = new Auth(null);
    $auth->logout();
}
?>'''
            
            server_manager_content = '''<?php
/**
 * Файл управления серверами SparkPanel
 */

class ServerManager {
    private $db;
    
    public function __construct($database) {
        $this->db = $database;
    }
    
    /**
     * Получить список серверов
     */
    public function getServers() {
        // В реальной реализации здесь будет запрос к базе данных
        // Пока возвращаем тестовые данные
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
    
    /**
     * Добавить новый сервер
     */
    public function addServer($name, $port) {
        // В реальной реализации здесь будет код для добавления сервера
        return true;
    }
    
    /**
     * Запустить сервер
     */
    public function startServer($id) {
        // В реальной реализации здесь будет код для запуска сервера
        return true;
    }
    
    /**
     * Остановить сервер
     */
    public function stopServer($id) {
        // В реальной реализации здесь будет код для остановки сервера
        return true;
    }
    
    /**
     * Удалить сервер
     */
    public function deleteServer($id) {
        // В реальной реализации здесь будет код для удаления сервера
        return true;
    }
    
    /**
     * Получить список плагинов сервера
     */
    public function getPlugins($serverId) {
        // В реальной реализации здесь будет запрос к базе данных или файловой системе
        return [
            [
                'id' => 1,
                'name' => 'WorldEdit',
                'version' => '7.2.9',
                'author' => 'EngineHub Team',
                'status' => 'enabled'
            ],
            [
                'id' => 2,
                'name' => 'WorldGuard',
                'version' => '7.0.7',
                'author' => 'EngineHub Team',
                'status' => 'enabled'
            ],
            [
                'id' => 3,
                'name' => 'EssentialsX',
                'version' => '2.19.0',
                'author' => 'EssentialsX Team',
                'status' => 'disabled'
            ]
        ];
    }
    
    /**
     * Включить плагин
     */
    public function enablePlugin($pluginId) {
        // В реальной реализации здесь будет код для включения плагина
        return true;
    }
    
    /**
     * Отключить плагин
     */
    public function disablePlugin($pluginId) {
        // В реальной реализации здесь будет код для отключения плагина
        return true;
    }
    
    /**
     * Удалить плагин
     */
    public function deletePlugin($pluginId) {
        // В реальной реализации здесь будет код для удаления плагина
        return true;
    }
    
    /**
     * Получить список резервных копий
     */
    public function getBackups() {
        // В реальной реализации здесь будет запрос к базе данных или файловой системе
        return [
            [
                'id' => 1,
                'name' => 'Резервная копия от 27.07.2025 14:30',
                'server' => 'Minecraft Server #1',
                'size' => '2.4 GB',
                'date' => '2025-07-27 14:30'
            ],
            [
                'id' => 2,
                'name' => 'Резервная копия от 26.07.2025 10:15',
                'server' => 'Minecraft Server #1',
                'size' => '2.1 GB',
                'date' => '2025-07-26 10:15'
            ],
            [
                'id' => 3,
                'name' => 'Резервная копия от 25.07.2025 09:00',
                'server' => 'Minecraft Server #2',
                'size' => '1.8 GB',
                'date' => '2025-07-25 09:00'
            ]
        ];
    }
    
    /**
     * Создать резервную копию
     */
    public function createBackup($serverId) {
        // В реальной реализации здесь будет код для создания резервной копии
        return true;
    }
    
    /**
     * Восстановить резервную копию
     */
    public function restoreBackup($backupId) {
        // В реальной реализации здесь будет код для восстановления резервной копии
        return true;
    }
    
    /**
     * Удалить резервную копию
     */
    public function deleteBackup($backupId) {
        // В реальной реализации здесь будет код для удаления резервной копии
        return true;
    }
    
    /**
     * Получить список запланированных задач
     */
    public function getScheduledTasks() {
        // В реальной реализации здесь будет запрос к базе данных
        return [
            [
                'id' => 1,
                'name' => 'Автоматический перезапуск сервера',
                'server' => 'Minecraft Server #1',
                'schedule' => 'Ежедневно в 05:00',
                'status' => 'enabled'
            ],
            [
                'id' => 2,
                'name' => 'Резервное копирование',
                'server' => 'Все серверы',
                'schedule' => 'Каждые 6 часов',
                'status' => 'enabled'
            ]
        ];
    }
    
    /**
     * Добавить задачу в планировщик
     */
    public function addScheduledTask($name, $type, $serverId, $schedule) {
        // В реальной реализации здесь будет код для добавления задачи
        return true;
    }
    
    /**
     * Отключить задачу
     */
    public function disableTask($taskId) {
        // В реальной реализации здесь будет код для отключения задачи
        return true;
    }
    
    /**
     * Удалить задачу
     */
    public function deleteTask($taskId) {
        // В реальной реализации здесь будет код для удаления задачи
        return true;
    }
    
    /**
     * Получить настройки уведомлений
     */
    public function getNotificationSettings() {
        // В реальной реализации здесь будет запрос к базе данных
        return [
            'email_enabled' => true,
            'email_address' => 'admin@example.com',
            'telegram_enabled' => true,
            'telegram_token' => '123456789:ABCdefGhIJKlmNoPQRstuvWXyz',
            'telegram_chat_id' => '@myserverchannel',
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
        // В реальной реализации здесь будет код для сохранения настроек
        return true;
    }
    
    /**
     * Получить данные для мониторинга в реальном времени
     */
    public function getRealtimeStats() {
        // В реальной реализации здесь будут данные с сервера
        return [
            'cpu_usage' => rand(20, 80),
            'memory_usage' => rand(50, 90),
            'disk_usage' => rand(30, 70),
            'active_players' => rand(5, 20),
            'network_usage' => rand(10, 100)
        ];
    }
}
?>'''
            
            db_content = '''<?php
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
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ");
    
    // Создание таблицы логов
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            server_id INT,
            message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        )
    ");
    
    // Создание таблицы плагинов
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS plugins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            server_id INT,
            name VARCHAR(100) NOT NULL,
            version VARCHAR(20) NOT NULL,
            author VARCHAR(100),
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
            server_id INT,
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
}
?>'''
            
            setup_content = '''#!/bin/bash

# Скрипт установки SparkPanel

# Проверка, что скрипт запущен от root
if [ "$EUID" -ne 0 ]
  then echo "Пожалуйста, запустите скрипт от root"
  exit
fi

echo "Начало установки SparkPanel..."

# Обновление системы
echo "Обновление системы..."
apt-get update

# Установка необходимых пакетов
echo "Установка LEMP стека..."
apt-get install -y nginx php8.2 php8.2-fpm php8.2-mysql php8.2-xml php8.2-curl mysql-server composer ufw

# Запуск и включение сервисов
echo "Запуск сервисов..."
systemctl start nginx
systemctl start mysql
systemctl enable nginx
systemctl enable mysql

# Создание директории для веб-файлов
echo "Создание директории для веб-файлов..."
mkdir -p /var/www/sparkpanel

# Копирование файлов панели (в реальной реализации они будут скопированы из архива)
echo "Развертывание файлов панели..."
# cp -r /tmp/sparkpanel/* /var/www/sparkpanel/

# Настройка прав доступа
echo "Настройка прав доступа..."
chown -R www-data:www-data /var/www/sparkpanel
chmod -R 755 /var/www/sparkpanel

# Настройка Nginx
echo "Настройка Nginx..."
cat > /etc/nginx/sites-available/sparkpanel << EOF
server {
    listen 80;
    server_name _;
    root /var/www/sparkpanel/public;
    index index.php index.html;

    location / {
        try_files \\$uri \\$uri/ /index.php?\\$query_string;
    }

    location ~ \\\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
    }
}
EOF

# Включение конфигурации
ln -s /etc/nginx/sites-available/sparkpanel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Перезапуск Nginx
echo "Перезапуск Nginx..."
systemctl restart nginx

# Настройка брандмауэра
echo "Настройка брандмауэра..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
yes | ufw enable

echo "Установка SparkPanel завершена!"
echo "Панель доступна по IP вашего сервера"'''
            
            style_content = '''/* Стили для SparkPanel */

:root {
    /* Светлая тема */
    --bg-color: #f5f7fa;
    --text-color: #333;
    --header-bg: #2c3e50;
    --header-text: #fff;
    --card-bg: #fff;
    --border-color: #e1e8ed;
    --primary-color: #3498db;
    --primary-hover: #2980b9;
    --success-color: #2ecc71;
    --success-hover: #27ae60;
    --danger-color: #e74c3c;
    --danger-hover: #c0392b;
    --warning-color: #f39c12;
    --warning-hover: #d35400;
    --secondary-color: #95a5a6;
    --secondary-hover: #7f8c8d;
    --online-color: #2ecc71;
    --offline-color: #e74c3c;
    --enabled-color: #2ecc71;
    --disabled-color: #e74c3c;
    --progress-bg: #ecf0f1;
}

.dark-theme {
    /* Темная тема */
    --bg-color: #1a1a2e;
    --text-color: #eee;
    --header-bg: #16213e;
    --header-text: #eee;
    --card-bg: #16213e;
    --border-color: #0f3460;
    --primary-color: #3498db;
    --primary-hover: #5dade2;
    --success-color: #2ecc71;
    --success-hover: #58d68d;
    --danger-color: #e74c3c;
    --danger-hover: #ec7063;
    --warning-color: #f39c12;
    --warning-hover: #f5b041;
    --secondary-color: #95a5a6;
    --secondary-hover: #aab7b8;
    --online-color: #2ecc71;
    --offline-color: #e74c3c;
    --enabled-color: #2ecc71;
    --disabled-color: #e74c3c;
    --progress-bg: #1f4068;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: var(--bg-color);
    color: var(--text-color);
    line-height: 1.6;
    transition: background-color 0.3s, color 0.3s;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
}

/* Переключатель темы */
.theme-toggle {
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 1000;
    background: var(--card-bg);
    padding: 0.5rem 1rem;
    border-radius: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

#theme-switch {
    margin-right: 0.5rem;
}

/* Шапка */
header {
    background-color: var(--header-bg);
    color: var(--header-text);
    padding: 1rem 0;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    position: sticky;
    top: 0;
    z-index: 100;
}

header .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
}

header h1 {
    font-size: 1.5rem;
    margin: 0;
}

nav ul {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
}

nav ul li {
    margin-left: 1rem;
}

nav ul li a {
    color: var(--header-text);
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background-color 0.3s;
    display: block;
}

nav ul li a:hover,
nav ul li a.active {
    background-color: rgba(255,255,255,0.1);
}

/* Основное содержимое */
main {
    padding: 2rem 0;
}

.page {
    display: none;
    animation: fadeIn 0.5s ease-in-out;
}

.page.active {
    display: block;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

h2 {
    margin-bottom: 1.5rem;
    color: var(--text-color);
    font-size: 1.8rem;
}

h3 {
    color: var(--text-color);
    font-size: 1.3rem;
}

h4 {
    color: var(--text-color);
    font-size: 1.1rem;
    margin-bottom: 0.5rem;
}

/* Карточки */
.card {
    background-color: var(--card-bg);
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    margin-bottom: 2rem;
    overflow: hidden;
    transition: transform 0.3s, box-shadow 0.3s;
}

.card:hover {
    transform: translateY(-5px);
    box-shadow: 0 5px 20px rgba(0,0,0,0.15);
}

.card-header {
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
}

.card-header h3 {
    margin: 0;
    font-size: 1.3rem;
}

.card-body {
    padding: 1.5rem;
}

/* Сетка серверов */
.server-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
}

.server-card {
    background-color: var(--card-bg);
    border-radius: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    padding: 1.5rem;
    transition: transform 0.3s, box-shadow 0.3s;
    border: 1px solid var(--border-color);
}

.server-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
}

.server-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.server-header h4 {
    margin: 0;
    font-size: 1.2rem;
}

.status-badge {
    padding: 0.3rem 0.6rem;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: bold;
}

.status-online, .status-enabled {
    background-color: rgba(46, 204, 113, 0.2);
    color: var(--online-color);
}

.status-offline, .status-disabled {
    background-color: rgba(231, 76, 60, 0.2);
    color: var(--offline-color);
}

.server-details p {
    margin: 0.5rem 0;
}

.player-count {
    font-weight: bold;
}

/* Прогресс-бары */
.progress-bar {
    height: 10px;
    background-color: var(--progress-bg);
    border-radius: 5px;
    margin: 1rem 0;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary-color), var(--success-color));
    border-radius: 5px;
    transition: width 0.5s ease-in-out;
}

/* Статистика */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.stat-card {
    background-color: var(--card-bg);
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    padding: 1.5rem;
    text-align: center;
    transition: transform 0.3s;
    border: 1px solid var(--border-color);
}

.stat-card:hover {
    transform: translateY(-5px);
}

.stat-icon {
    font-size: 2rem;
    margin-bottom: 1rem;
}

.stat-info h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    color: var(--text-color);
}

.stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: var(--primary-color);
    margin-bottom: 1rem;
}

/* Плагины */
.plugins-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
}

.plugin-card {
    background-color: var(--card-bg);
    border-radius: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    padding: 1.5rem;
    transition: transform 0.3s, box-shadow 0.3s;
    border: 1px solid var(--border-color);
}

.plugin-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
}

.plugin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.plugin-header h4 {
    margin: 0;
    font-size: 1.2rem;
}

.plugin-details p {
    margin: 0.5rem 0;
}

/* Резервные копии */
.backup-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.backup-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background-color: var(--card-bg);
}

.backup-info h4 {
    margin-top: 0;
}

/* Планировщик задач */
.scheduler-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.task-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background-color: var(--card-bg);
}

.task-info h4 {
    margin-top: 0;
}

/* Уведомления */
.notification-settings, .notification-types {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.form-group {
    margin-bottom: 1rem;
}

.form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
}

.form-control {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background-color: var(--card-bg);
    color: var(--text-color);
}

.form-control:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

/* Графики */
.chart-container {
    background-color: var(--card-bg);
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    padding: 1.5rem;
    border: 1px solid var(--border-color);
    margin-bottom: 1.5rem;
}

.chart-placeholder {
    height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0,0,0,0.02);
    border-radius: 4px;
    border: 1px dashed var(--border-color);
}

.chart-placeholder p {
    color: var(--secondary-color);
}

/* Логи */
.log-filters {
    display: flex;
    gap: 0.5rem;
}

.log-list {
    max-height: 500px;
    overflow-y: auto;
}

.log-entry {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    flex-wrap: wrap;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
}

.log-entry:last-child {
    border-bottom: none;
}

.log-time {
    color: var(--secondary-color);
    margin-right: 1rem;
    min-width: 150px;
}

.log-type {
    font-weight: bold;
    margin-right: 1rem;
    min-width: 60px;
}

.log-info .log-type {
    color: var(--primary-color);
}

.log-warning .log-type {
    color: var(--warning-color);
}

.log-error .log-type {
    color: var(--danger-color);
}

.log-message {
    flex-grow: 1;
}

/* Кнопки */
.btn {
    display: inline-block;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-decoration: none;
    font-size: 1rem;
    transition: all 0.3s;
    text-align: center;
}

.btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
}

.btn-primary {
    background-color: var(--primary-color);
    color: white;
}

.btn-primary:hover {
    background-color: var(--primary-hover);
}

.btn-success {
    background-color: var(--success-color);
    color: white;
}

.btn-success:hover {
    background-color: var(--success-hover);
}

.btn-danger {
    background-color: var(--danger-color);
    color: white;
}

.btn-danger:hover {
    background-color: var(--danger-hover);
}

.btn-warning {
    background-color: var(--warning-color);
    color: white;
}

.btn-warning:hover {
    background-color: var(--warning-hover);
}

.btn-secondary {
    background-color: var(--secondary-color);
    color: white;
}

.btn-secondary:hover {
    background-color: var(--secondary-hover);
}

.btn-error {
    background-color: var(--danger-color);
    color: white;
}

.btn-error:hover {
    background-color: var(--danger-hover);
}

.btn-outline {
    background-color: transparent;
    border: 1px solid var(--primary-color);
    color: var(--primary-color);
}

.btn-outline:hover {
    background-color: var(--primary-color);
    color: white;
}

.btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
}

/* Подвал */
footer {
    text-align: center;
    padding: 2rem 0;
    background-color: var(--header-bg);
    color: var(--header-text);
    margin-top: 2rem;
}

/* Адаптивность */
@media (max-width: 768px) {
    .container {
        padding: 0 0.5rem;
    }
    
    header .container {
        flex-direction: column;
        align-items: stretch;
    }
    
    nav ul {
        justify-content: center;
        margin-top: 1rem;
    }
    
    nav ul li {
        margin: 0.25rem;
    }
    
    .card-header {
        flex-direction: column;
        align-items: stretch;
        text-align: center;
        gap: 1rem;
    }
    
    .server-grid, .plugins-grid {
        grid-template-columns: 1fr;
    }
    
    .stats-grid {
        grid-template-columns: 1fr;
    }
    
    .log-entry {
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .log-time, .log-type {
        min-width: auto;
    }
    
    .theme-toggle {
        position: static;
        margin: 1rem auto;
        width: fit-content;
    }
    
    .backup-item, .task-item {
        flex-direction: column;
        align-items: stretch;
        gap: 1rem;
    }
    
    .backup-actions, .task-actions {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
    }
}

@media (max-width: 480px) {
    .server-card, .plugin-card {
        padding: 1rem;
    }
    
    .card-header, .card-body {
        padding: 1rem;
    }
    
    .stat-card {
        padding: 1rem;
    }
    
    .log-filters {
        flex-wrap: wrap;
        justify-content: center;
    }
}'''
            
            script_content = '''// Функциональность SparkPanel

document.addEventListener('DOMContentLoaded', function() {
    // Переключение темы
    const themeSwitch = document.getElementById('theme-switch');
    const body = document.body;
    
    // Проверяем сохраненную тему
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        body.classList.add('dark-theme');
        themeSwitch.checked = true;
    }
    
    themeSwitch.addEventListener('change', function() {
        if (this.checked) {
            body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
        } else {
            body.classList.remove('dark-theme');
            localStorage.setItem('theme', 'light');
        }
    });
    
    // Навигация между страницами
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Удаляем активный класс у всех ссылок и страниц
            navLinks.forEach(nav => nav.classList.remove('active'));
            pages.forEach(page => page.classList.remove('active'));
            
            // Добавляем активный класс к текущей ссылке
            this.classList.add('active');
            
            // Показываем соответствующую страницу
            const pageId = this.getAttribute('data-page');
            if (pageId) {
                document.getElementById(pageId).classList.add('active');
            }
            
            // Обновляем URL
            const url = new URL(window.location);
            url.searchParams.set('page', pageId);
            window.history.pushState({}, '', url);
        });
    });
    
    // Обработчик для кнопки добавления сервера
    const addServerBtn = document.getElementById('add-server');
    if (addServerBtn) {
        addServerBtn.addEventListener('click', function() {
            // Анимация при нажатии
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            alert('Функция добавления сервера будет реализована в полной версии');
        });
    }
    
    // Обработчик для кнопки загрузки плагина
    const uploadPluginBtn = document.getElementById('upload-plugin');
    if (uploadPluginBtn) {
        uploadPluginBtn.addEventListener('click', function() {
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            alert('Функция загрузки плагина будет реализована в полной версии');
        });
    }
    
    // Обработчик для кнопки создания резервной копии
    const createBackupBtn = document.getElementById('create-backup');
    if (createBackupBtn) {
        createBackupBtn.addEventListener('click', function() {
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            alert('Создание резервной копии запущено. Это может занять несколько минут.');
        });
    }
    
    // Обработчик для кнопки добавления задачи
    const addTaskBtn = document.getElementById('add-task');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', function() {
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            alert('Функция добавления задачи будет реализована в полной версии');
        });
    }
    
    // Обработчики для кнопок управления серверами
    const serverActionButtons = document.querySelectorAll('.server-actions button');
    serverActionButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Анимация при нажатии
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            const action = this.classList.contains('start-server') ? 'запустить' : 
                          this.classList.contains('stop-server') ? 'остановить' : 'удалить';
            const serverName = this.closest('.server-card').querySelector('h4').textContent;
            
            if (confirm(`Вы уверены, что хотите ${action} сервер ${serverName}?`)) {
                alert(`Сервер будет ${action}. Реализация в полной версии.`);
            }
        });
    });
    
    // Обработчики для кнопок управления плагинами
    const pluginActionButtons = document.querySelectorAll('.plugin-actions button');
    pluginActionButtons.forEach(button => {
        button.addEventListener('click', function() {
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            const action = this.classList.contains('enable-plugin') ? 'включить' : 
                          this.classList.contains('disable-plugin') ? 'отключить' : 'удалить';
            const pluginName = this.closest('.plugin-card').querySelector('h4').textContent;
            
            if (confirm(`Вы уверены, что хотите ${action} плагин ${pluginName}?`)) {
                alert(`Плагин будет ${action}. Реализация в полной версии.`);
            }
        });
    });
    
    // Обработчики для кнопок управления резервными копиями
    const backupActionButtons = document.querySelectorAll('.backup-actions button');
    backupActionButtons.forEach(button => {
        button.addEventListener('click', function() {
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            const action = this.classList.contains('restore-backup') ? 'восстановить' : 'удалить';
            const backupName = this.closest('.backup-item').querySelector('h4').textContent;
            
            if (confirm(`Вы уверены, что хотите ${action} резервную копию ${backupName}?`)) {
                if (action === 'восстановить') {
                    alert('Восстановление резервной копии запущено. Сервер будет перезапущен.');
                } else {
                    alert('Резервная копия будет удалена.');
                }
            }
        });
    });
    
    // Обработчики для кнопок управления задачами
    const taskActionButtons = document.querySelectorAll('.task-actions button');
    taskActionButtons.forEach(button => {
        button.addEventListener('click', function() {
            this.classList.add('clicked');
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
            
            const action = this.classList.contains('disable-task') ? 'отключить' : 'удалить';
            const taskName = this.closest('.task-item').querySelector('h4').textContent;
            
            if (confirm(`Вы уверены, что хотите ${action} задачу ${taskName}?`)) {
                alert(`Задача будет ${action}. Реализация в полной версии.`);
            }
        });
    });
    
    // Имитация обновления статистики
    function updateStats() {
        const statValues = document.querySelectorAll('.stat-value');
        statValues.forEach(element => {
            // Генерируем случайное значение для демонстрации
            const oldValue = parseInt(element.textContent);
            const newValue = Math.max(0, Math.min(100, oldValue + Math.floor(Math.random() * 21) - 10));
            element.textContent = newValue + (element.textContent.includes('GB') ? ' GB' : element.textContent.includes('/') ? '/20' : '');
            
            // Обновляем прогресс-бары
            const progressBar = element.closest('.stat-card, .server-details').querySelector('.progress-fill');
            if (progressBar) {
                progressBar.style.width = newValue + '%';
            }
        });
    }
    
    // Обновляем статистику каждые 5 секунд
    setInterval(updateStats, 5000);
    
    // Анимация прогресс-баров при загрузке страницы
    const progressBars = document.querySelectorAll('.progress-fill');
    progressBars.forEach(bar => {
        const width = bar.style.width;
        bar.style.width = '0';
        setTimeout(() => {
            bar.style.width = width;
        }, 300);
    });
    
    // Фильтры логов
    const logFilterButtons = document.querySelectorAll('.log-filters .btn');
    const logEntries = document.querySelectorAll('.log-entry');
    
    logFilterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Удаляем активный класс у всех кнопок
            logFilterButtons.forEach(btn => btn.classList.remove('active'));
            
            // Добавляем активный класс к текущей кнопке
            this.classList.add('active');
            
            const filter = this.textContent.trim();
            
            logEntries.forEach(entry => {
                if (filter === 'Все') {
                    entry.style.display = 'flex';
                } else if (filter === 'Предупреждения' && entry.classList.contains('log-warning')) {
                    entry.style.display = 'flex';
                } else if (filter === 'Ошибки' && entry.classList.contains('log-error')) {
                    entry.style.display = 'flex';
                } else if (filter === 'Все' || !entry.classList.contains('log-warning') && !entry.classList.contains('log-error')) {
                    entry.style.display = 'flex';
                } else {
                    entry.style.display = 'none';
                }
            });
        });
    });
    
    // Инициализация графиков (имитация)
    initializeCharts();
});

// Инициализация графиков
function initializeCharts() {
    // Имитация данных для графиков
    const charts = document.querySelectorAll('.chart-placeholder');
    charts.forEach(chart => {
        chart.innerHTML = '<p>График в реальном времени</p>';
        
        // Создаем имитацию обновления графиков
        setInterval(() => {
            const value = Math.floor(Math.random() * 100);
            chart.innerHTML = `<p>Значение: ${value}%</p>`;
        }, 3000);
    });
}

// Функция для загрузки логов
function loadLogs() {
    const logViewer = document.getElementById('log-viewer');
    if (logViewer) {
        logViewer.innerHTML = `
            <div class="log-entry log-info">
                <span class="log-time">[2025-07-27 10:00:00]</span>
                <span class="log-type">[INFO]</span>
                <span class="log-message">Сервер запущен</span>
            </div>
            <div class="log-entry log-warning">
                <span class="log-time">[2025-07-27 10:05:23]</span>
                <span class="log-type">[WARN]</span>
                <span class="log-message">Низкая память</span>
            </div>
            <div class="log-entry log-info">
                <span class="log-time">[2025-07-27 10:10:11]</span>
                <span class="log-type">[INFO]</span>
                <span class="log-message">Игрок подключился</span>
            </div>
            <div class="log-entry log-error">
                <span class="log-time">[2025-07-27 10:15:33]</span>
                <span class="log-type">[ERROR]</span>
                <span class="log-message">Ошибка плагина</span>
            </div>
            <div class="log-entry log-info">
                <span class="log-time">[2025-07-27 10:20:45]</span>
                <span class="log-type">[INFO]</span>
                <span class="log-message">Резервная копия создана</span>
            </div>
        `;
    }
}

// Загружаем логи при открытии страницы логов
if (window.location.search.includes('page=logs')) {
    loadLogs();
}

// Обработка всплытия контента
window.addEventListener('load', function() {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.style.opacity = '0';
        page.style.transform = 'translateY(20px)';
    });
    
    setTimeout(() => {
        const activePage = document.querySelector('.page.active');
        if (activePage) {
            activePage.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            activePage.style.opacity = '1';
            activePage.style.transform = 'translateY(0)';
        }
    }, 100);
});'''
            
            # Загружаем файлы на сервер
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.php') as f:
                f.write(index_content)
                temp_index_path = f.name
            self.sftp.put(temp_index_path, "/var/www/sparkpanel/public/index.php")
            os.unlink(temp_index_path)
            
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.php') as f:
                f.write(auth_content)
                temp_auth_path = f.name
            self.sftp.put(temp_auth_path, "/var/www/sparkpanel/app/auth.php")
            os.unlink(temp_auth_path)
            
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.php') as f:
                f.write(server_manager_content)
                temp_server_manager_path = f.name
            self.sftp.put(temp_server_manager_path, "/var/www/sparkpanel/app/server_manager.php")
            os.unlink(temp_server_manager_path)
            
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.php') as f:
                f.write(db_content)
                temp_db_path = f.name
            self.sftp.put(temp_db_path, "/var/www/sparkpanel/config/db.php")
            os.unlink(temp_db_path)
            
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.sh') as f:
                f.write(setup_content)
                temp_setup_path = f.name
            self.sftp.put(temp_setup_path, "/var/www/sparkpanel/install/setup.sh")
            os.unlink(temp_setup_path)
            
            # Загружаем ассеты
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.css') as f:
                f.write(style_content)
                temp_style_path = f.name
            self.sftp.put(temp_style_path, "/var/www/sparkpanel/public/assets/style.css")
            os.unlink(temp_style_path)
            
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.js') as f:
                f.write(script_content)
                temp_script_path = f.name
            self.sftp.put(temp_script_path, "/var/www/sparkpanel/public/assets/script.js")
            os.unlink(temp_script_path)
            
        except Exception as e:
            raise Exception(f"Ошибка развертывания SparkPanel: {str(e)}")

    def configure_webserver(self):
        """Настройка веб-сервера"""
        try:
            # Настраиваем Nginx для работы по IP сервера
            nginx_config = f"""server {{
    listen 80;
    server_name {self.host};
    root /var/www/sparkpanel/public;
    index index.php index.html;
    
    location / {{
        try_files $uri $uri/ /index.php?$query_string;
    }}
    
    location ~ \.php$ {{
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
    }}
}}"""
            
            # Записываем конфигурацию
            with tempfile.NamedTemporaryFile(mode='w', delete=False) as f:
                f.write(nginx_config)
                temp_config_path = f.name
                
            # Загружаем конфиг на сервер
            self.sftp.put(temp_config_path, "/etc/nginx/sites-available/sparkpanel")
            
            # Создаем символическую ссылку
            stdin, stdout, stderr = self.ssh.exec_command(
                "ln -sf /etc/nginx/sites-available/sparkpanel /etc/nginx/sites-enabled/", get_pty=True
            )
            exit_status = stdout.channel.recv_exit_status()
            if exit_status != 0:
                error = stderr.read().decode().strip()
                raise Exception(f"Ошибка создания символической ссылки: {error}")
            
            # Удаляем конфиг по умолчанию
            stdin, stdout, stderr = self.ssh.exec_command(
                "rm -f /etc/nginx/sites-enabled/default", get_pty=True
            )
            exit_status = stdout.channel.recv_exit_status()
            if exit_status != 0:
                error = stderr.read().decode().strip()
                raise Exception(f"Ошибка удаления конфига по умолчанию: {error}")
            
            # Перезапускаем Nginx
            stdin, stdout, stderr = self.ssh.exec_command("systemctl restart nginx", get_pty=True)
            exit_status = stdout.channel.recv_exit_status()
            if exit_status != 0:
                error = stderr.read().decode().strip()
                raise Exception(f"Ошибка перезапуска Nginx: {error}")
            
            # Удаляем временный файл
            os.unlink(temp_config_path)
            
        except Exception as e:
            raise Exception(f"Ошибка настройки веб-сервера: {str(e)}")

    def setup_security(self):
        """Настройка безопасности"""
        try:
            # Настройка UFW (брандмауэр)
            commands = [
                "ufw allow OpenSSH",
                "ufw allow 'Nginx Full'",
                "echo 'y' | ufw enable"
            ]
            
            for command in commands:
                stdin, stdout, stderr = self.ssh.exec_command(f"sudo {command}", get_pty=True)
                exit_status = stdout.channel.recv_exit_status()
                if exit_status != 0:
                    error = stderr.read().decode().strip()
                    raise Exception(f"Ошибка выполнения команды '{command}': {error}")
                    
        except Exception as e:
            raise Exception(f"Ошибка настройки безопасности: {str(e)}")

    def disconnect(self):
        """Отключение от сервера"""
        try:
            if self.sftp:
                self.sftp.close()
            if self.ssh:
                self.ssh.close()
        except:
            pass  # Игнорируем ошибки при закрытии соединений