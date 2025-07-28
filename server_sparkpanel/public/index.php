<?php
// Проверка User-Agent для безопасности
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
if (!str_contains($userAgent, 'PooClient')) {
    http_response_code(403);
    echo "Access denied.";
    exit;
}

session_start();

// Подключаем необходимые файлы
require_once '../config/db.php';
require_once '../app/auth.php';
require_once '../app/server_manager.php';
require_once '../app/monitoring.php';
require_once '../app/cache.php';
require_once '../app/background_jobs.php';
require_once '../app/logger.php';
require_once '../app/updater.php';
require_once '../app/documentation.php';

// Инициализация базы данных
try {
    $db = getDBConnection();
    $auth = new Auth($db);
    $serverManager = new ServerManager($db);
    $monitor = new ServerMonitor($db);
} catch (Exception $e) {
    die("Ошибка подключения к базе данных: " . $e->getMessage());
}

// Проверка авторизации
if (!$auth->isLoggedIn() && !isset($_POST['action'])) {
    include 'login.php';
    exit;
}

// Функция для получения метрик (для API)
function getMetricsAPI($type, $limit) {
    global $serverManager;
    
    switch ($type) {
        case 'current':
            return $serverManager->getRealtimeStats();
        case 'cpu':
        case 'memory':
        case 'disk':
            return $serverManager->getHistoricalData($type, $limit);
        default:
            return ['error' => 'Неверный тип метрик'];
    }
}

// Обработка действий
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    switch ($action) {
        case 'add_server':
            if ($auth->hasPermission('manage_servers')) {
                $result = $serverManager->addServer(
                    $_POST['name'], 
                    $_POST['ip'], 
                    $_POST['port']
                );
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'start_server':
            if ($auth->hasPermission('manage_servers')) {
                $result = $serverManager->startServer($_POST['id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'stop_server':
            if ($auth->hasPermission('manage_servers')) {
                $result = $serverManager->stopServer($_POST['id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'delete_server':
            if ($auth->hasPermission('manage_servers')) {
                $result = $serverManager->deleteServer($_POST['id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'add_plugin':
            if ($auth->hasPermission('manage_plugins')) {
                $result = $serverManager->addPlugin(
                    $_POST['server_id'],
                    $_POST['name'],
                    $_POST['version'],
                    $_POST['author']
                );
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'enable_plugin':
            if ($auth->hasPermission('manage_plugins')) {
                $result = $serverManager->enablePlugin($_POST['id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'disable_plugin':
            if ($auth->hasPermission('manage_plugins')) {
                $result = $serverManager->disablePlugin($_POST['id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'delete_plugin':
            if ($auth->hasPermission('manage_plugins')) {
                $result = $serverManager->deletePlugin($_POST['id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'login':
            $username = $_POST['username'] ?? '';
            $password = $_POST['password'] ?? '';
            $twofa_code = $_POST['twofa_code'] ?? '';
            
            $result = $auth->login($username, $password, $twofa_code);
            
            // Записываем в лог
            $logger = new Logger($db);
            if ($result['success']) {
                $logger->info("Пользователь вошел в систему", ['username' => $username]);
            } else {
                $logger->warning("Неудачная попытка входа", ['username' => $username]);
            }
            
            echo json_encode($result);
            exit;
            
        case 'logout':
            $username = $_SESSION['username'] ?? 'unknown';
            $auth->logout();
            
            // Записываем в лог
            $logger = new Logger($db);
            $logger->info("Пользователь вышел из системы", ['username' => $username]);
            
            echo json_encode(['success' => true, 'message' => 'Вы успешно вышли из системы']);
            exit;
            
        case 'create_backup':
            if ($auth->hasPermission('manage_backups')) {
                // Добавляем задачу в очередь вместо немедленного выполнения
                $payload = [
                    'server_id' => $_POST['server_id'],
                    'user_id' => $_SESSION['user_id']
                ];
                $jobId = $serverManager->addBackgroundJob('backup_server', $payload, 1);
                
                if ($jobId) {
                    echo json_encode([
                        'success' => true, 
                        'message' => 'Задача резервного копирования добавлена в очередь'
                    ]);
                } else {
                    echo json_encode([
                        'success' => false, 
                        'message' => 'Не удалось добавить задачу в очередь'
                    ]);
                }
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'restore_backup':
            if ($auth->hasPermission('manage_backups')) {
                $result = $serverManager->restoreBackup($_POST['id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'delete_backup':
            if ($auth->hasPermission('manage_backups')) {
                $result = $serverManager->deleteBackup($_POST['id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'get_metrics':
            if ($auth->isLoggedIn()) {
                $type = $_POST['type'] ?? 'current';
                $limit = intval($_POST['limit'] ?? 100);
                echo json_encode(getMetricsAPI($type, $limit));
            } else {
                echo json_encode(['success' => false, 'message' => 'Не авторизован']);
            }
            exit;
            
        case 'check_alerts':
            if ($auth->isLoggedIn()) {
                echo json_encode($monitor->checkAlerts());
            } else {
                echo json_encode(['success' => false, 'message' => 'Не авторизован']);
            }
            exit;
            
        case 'add_task':
            if ($auth->hasPermission('manage_settings')) {
                $result = $serverManager->addScheduledTask(
                    $_POST['name'],
                    $_POST['type'],
                    $_POST['server_id'],
                    $_POST['schedule']
                );
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'enable_task':
            if ($auth->hasPermission('manage_settings')) {
                $result = $serverManager->enableTask($_POST['id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'disable_task':
            if ($auth->hasPermission('manage_settings')) {
                $result = $serverManager->disableTask($_POST['id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'delete_task':
            if ($auth->hasPermission('manage_settings')) {
                $result = $serverManager->deleteTask($_POST['id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'save_notifications':
            if ($auth->hasPermission('manage_settings')) {
                $result = $serverManager->saveNotificationSettings($_POST['settings']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'update_user_role':
            if ($auth->hasRole('admin')) {
                $result = $serverManager->updateUserRole($_POST['user_id'], $_POST['role']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'add_allowed_ip':
            if ($auth->hasPermission('manage_security')) {
                $result = $serverManager->addAllowedIP($_POST['user_id'], $_POST['ip']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'remove_allowed_ip':
            if ($auth->hasPermission('manage_security')) {
                $result = $serverManager->removeAllowedIP($_POST['user_id'], $_POST['ip']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'enable_2fa':
            if ($auth->hasPermission('manage_security')) {
                $result = $auth->enableTwoFA($_SESSION['user_id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'disable_2fa':
            if ($auth->hasPermission('manage_security')) {
                $result = $auth->disableTwoFA($_SESSION['user_id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'create_user':
            if ($auth->hasRole('admin')) {
                $result = $auth->createUser($_POST['username'], $_POST['password'], $_POST['role']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'delete_user':
            if ($auth->hasRole('admin')) {
                $result = $auth->deleteUser($_POST['user_id']);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'get_realtime_stats':
            if ($auth->hasPermission('view_stats')) {
                $result = $serverManager->getRealtimeStats();
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'get_historical_data':
            if ($auth->hasPermission('view_stats')) {
                $metric = $_POST['metric'] ?? 'cpu';
                $hours = intval($_POST['hours'] ?? 24);
                $result = $serverManager->getHistoricalData($metric, $hours);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'get_server_status':
            if ($auth->hasPermission('view_stats')) {
                // Реальная реализация проверки статуса сервера
                $server_id = $_POST['server_id'] ?? 1;
                $status = $serverManager->getServerStatus($server_id);
                echo json_encode([
                    'success' => true,
                    'data' => $status
                ]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'get_performance_metrics':
            if ($auth->hasPermission('view_stats')) {
                $metricType = $_POST['metric_type'] ?? null;
                $limit = intval($_POST['limit'] ?? 100);
                $metrics = $serverManager->getPerformanceMetrics($metricType, $limit);
                echo json_encode([
                    'success' => true,
                    'data' => $metrics
                ]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'process_background_jobs':
            if ($auth->hasRole('admin')) {
                $limit = intval($_POST['limit'] ?? 10);
                $processed = $serverManager->processBackgroundJobs($limit);
                echo json_encode([
                    'success' => true,
                    'processed' => $processed
                ]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'get_cache_stats':
            if ($auth->hasRole('admin')) {
                $cache = new Cache();
                $stats = $cache->getStats();
                echo json_encode([
                    'success' => true,
                    'data' => $stats
                ]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'clear_cache':
            if ($auth->hasRole('admin')) {
                $cache = new Cache();
                $cache->clear();
                echo json_encode([
                    'success' => true,
                    'message' => 'Кэш очищен'
                ]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'check_updates':
            if ($auth->hasRole('admin')) {
                $updater = new Updater('1.0.0');
                $result = $updater->checkForUpdates();
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'download_update':
            if ($auth->hasRole('admin')) {
                $updater = new Updater('1.0.0');
                $version = $_POST['version'] ?? '1.1.0';
                $result = $updater->downloadUpdate($version);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'install_update':
            if ($auth->hasRole('admin')) {
                $updater = new Updater('1.0.0');
                $filePath = $_POST['file_path'] ?? '';
                $result = $updater->installUpdate($filePath);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'message' => 'Недостаточно прав для выполнения действия']);
            }
            exit;
            
        case 'search_docs':
            $documentation = new Documentation();
            $query = $_POST['query'] ?? '';
            $results = $documentation->searchDocumentation($query);
            echo json_encode([
                'success' => true,
                'results' => $results
            ]);
            exit;
    }
}

// Получаем данные для отображения
$servers = $serverManager->getServers();
$plugins = isset($_GET['server_id']) ? $serverManager->getPlugins($_GET['server_id']) : [];
$backups = $serverManager->getBackups();
$tasks = $serverManager->getScheduledTasks();
$notificationSettings = $serverManager->getNotificationSettings();
$users = $serverManager->getUsers();
$auditLogs = $serverManager->getAuditLogs();
$documentation = new Documentation();
$docSections = $documentation->getDocumentationSections();
$faqItems = $documentation->getFAQ();

?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SparkPanel - Панель управления серверами</title>
    <link rel="stylesheet" href="assets/style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="light-theme">
    <div class="theme-toggle">
        <input type="checkbox" id="theme-switch" />
        <label for="theme-switch">Темная тема</label>
    </div>
    
    <header>
        <div class="container">
            <h1>SparkPanel</h1>
            <nav>
                <ul>
                    <li><a href="?page=servers" class="nav-link <?php echo (!isset($_GET['page']) || $_GET['page'] == 'servers') ? 'active' : ''; ?>" data-page="servers">Серверы</a></li>
                    <li><a href="?page=plugins" class="nav-link <?php echo ($_GET['page'] == 'plugins') ? 'active' : ''; ?>" data-page="plugins">Плагины</a></li>
                    <li><a href="?page=backup" class="nav-link <?php echo ($_GET['page'] == 'backup') ? 'active' : ''; ?>" data-page="backup">Резервные копии</a></li>
                    <li><a href="?page=scheduler" class="nav-link <?php echo ($_GET['page'] == 'scheduler') ? 'active' : ''; ?>" data-page="scheduler">Планировщик</a></li>
                    <li><a href="?page=notifications" class="nav-link <?php echo ($_GET['page'] == 'notifications') ? 'active' : ''; ?>" data-page="notifications">Уведомления</a></li>
                    <li><a href="?page=security" class="nav-link <?php echo ($_GET['page'] == 'security') ? 'active' : ''; ?>" data-page="security">Безопасность</a></li>
                    <li><a href="?page=stats" class="nav-link <?php echo ($_GET['page'] == 'stats') ? 'active' : ''; ?>" data-page="stats">Статистика</a></li>
                    <li><a href="?page=logs" class="nav-link <?php echo ($_GET['page'] == 'logs') ? 'active' : ''; ?>" data-page="logs">Логи</a></li>
                    <li><a href="?action=logout" class="nav-link">Выход (<?php echo htmlspecialchars($_SESSION['username']); ?>)</a></li>
                </ul>
            </nav>
        </div>
    </header>
    
    <main class="container">
        <div id="content">
            <?php if (!isset($_GET['page']) || $_GET['page'] == 'servers'): ?>
            <section id="servers" class="page <?php echo (!isset($_GET['page']) || $_GET['page'] == 'servers') ? 'active' : ''; ?>">
                <h2>Управление серверами</h2>
                <div class="card">
                    <div class="card-header">
                        <h3>Список серверов</h3>
                        <?php if ($auth->hasPermission('manage_servers')): ?>
                        <button id="add-server" class="btn btn-primary">Добавить сервер</button>
                        <?php endif; ?>
                    </div>
                    <div class="card-body">
                        <div class="server-grid">
                            <?php foreach ($servers as $server): ?>
                            <div class="server-card">
                                <div class="server-header">
                                    <h4><?php echo htmlspecialchars($server['name']); ?></h4>
                                    <span class="status-badge <?php echo $server['status'] == 'online' ? 'status-online' : 'status-offline'; ?>">
                                        <?php echo $server['status'] == 'online' ? 'Онлайн' : 'Оффлайн'; ?>
                                    </span>
                                </div>
                                <div class="server-details">
                                    <p><strong>IP:</strong> <?php echo htmlspecialchars($server['ip']); ?></p>
                                    <p><strong>Порт:</strong> <?php echo htmlspecialchars($server['port']); ?></p>
                                    <p><strong>Игроки:</strong> <span class="player-count"><?php echo $server['players'] ?? '0/20'; ?></span></p>
                                    <?php if ($server['status'] == 'online'): ?>
                                    <div class="progress-bar">
                                        <div class="progress-fill" style="width: <?php echo rand(30, 90); ?>%"></div>
                                    </div>
                                    <?php endif; ?>
                                </div>
                                <?php if ($auth->hasPermission('manage_servers')): ?>
                                <div class="server-actions">
                                    <?php if ($server['status'] == 'online'): ?>
                                        <button class="btn btn-danger stop-server" data-id="<?php echo $server['id']; ?>">Остановить</button>
                                    <?php else: ?>
                                        <button class="btn btn-success start-server" data-id="<?php echo $server['id']; ?>">Запустить</button>
                                    <?php endif; ?>
                                    <button class="btn btn-secondary delete-server" data-id="<?php echo $server['id']; ?>">Удалить</button>
                                </div>
                                <?php endif; ?>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
                
                <!-- Модальное окно для добавления сервера -->
                <div id="add-server-modal" class="modal" style="display: none;">
                    <div class="modal-content">
                        <span class="close">&times;</span>
                        <h2>Добавить новый сервер</h2>
                        <form id="add-server-form">
                            <div class="form-group">
                                <label for="server-name">Название сервера:</label>
                                <input type="text" id="server-name" name="name" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label for="server-ip">IP адрес:</label>
                                <input type="text" id="server-ip" name="ip" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label for="server-port">Порт:</label>
                                <input type="number" id="server-port" name="port" class="form-control" required>
                            </div>
                            <button type="submit" class="btn btn-primary">Добавить сервер</button>
                        </form>
                    </div>
                </div>
            </section>
            
            <?php elseif ($_GET['page'] == 'plugins'): ?>
            <section id="plugins" class="page <?php echo ($_GET['page'] == 'plugins') ? 'active' : ''; ?>">
                <h2>Управление плагинами</h2>
                <div class="card">
                    <div class="card-header">
                        <h3>Список плагинов сервера</h3>
                        <?php if ($auth->hasPermission('manage_plugins')): ?>
                        <button id="upload-plugin" class="btn btn-primary">Загрузить плагин</button>
                        <?php endif; ?>
                    </div>
                    <div class="card-body">
                        <div class="plugins-grid">
                            <?php foreach ($plugins as $plugin): ?>
                            <div class="plugin-card">
                                <div class="plugin-header">
                                    <h4><?php echo htmlspecialchars($plugin['name']); ?></h4>
                                    <span class="status-badge <?php echo $plugin['status'] == 'enabled' ? 'status-enabled' : 'status-disabled'; ?>">
                                        <?php echo $plugin['status'] == 'enabled' ? 'Включен' : 'Отключен'; ?>
                                    </span>
                                </div>
                                <div class="plugin-details">
                                    <p><strong>Версия:</strong> <?php echo htmlspecialchars($plugin['version']); ?></p>
                                    <p><strong>Автор:</strong> <?php echo htmlspecialchars($plugin['author']); ?></p>
                                    <p><strong>Статус:</strong> <?php echo $plugin['status'] == 'enabled' ? 'Активен' : 'Отключен'; ?></p>
                                </div>
                                <?php if ($auth->hasPermission('manage_plugins')): ?>
                                <div class="plugin-actions">
                                    <?php if ($plugin['status'] == 'enabled'): ?>
                                        <button class="btn btn-warning disable-plugin" data-id="<?php echo $plugin['id']; ?>">Отключить</button>
                                    <?php else: ?>
                                        <button class="btn btn-success enable-plugin" data-id="<?php echo $plugin['id']; ?>">Включить</button>
                                    <?php endif; ?>
                                    <button class="btn btn-danger delete-plugin" data-id="<?php echo $plugin['id']; ?>">Удалить</button>
                                </div>
                                <?php endif; ?>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
                
                <!-- Модальное окно для добавления плагина -->
                <div id="add-plugin-modal" class="modal" style="display: none;">
                    <div class="modal-content">
                        <span class="close">&times;</span>
                        <h2>Добавить плагин</h2>
                        <form id="add-plugin-form">
                            <input type="hidden" name="server_id" value="<?php echo $_GET['server_id'] ?? 1; ?>">
                            <div class="form-group">
                                <label for="plugin-name">Название плагина:</label>
                                <input type="text" id="plugin-name" name="name" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label for="plugin-version">Версия:</label>
                                <input type="text" id="plugin-version" name="version" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label for="plugin-author">Автор:</label>
                                <input type="text" id="plugin-author" name="author" class="form-control" required>
                            </div>
                            <button type="submit" class="btn btn-primary">Добавить плагин</button>
                        </form>
                    </div>
                </div>
            </section>
            
            <?php elseif ($_GET['page'] == 'backup'): ?>
            <section id="backup" class="page <?php echo ($_GET['page'] == 'backup') ? 'active' : ''; ?>">
                <h2>Резервные копии</h2>
                <div class="card">
                    <div class="card-header">
                        <h3>Управление резервными копиями</h3>
                        <?php if ($auth->hasPermission('manage_backups')): ?>
                        <button id="create-backup" class="btn btn-primary">Создать резервную копию</button>
                        <?php endif; ?>
                    </div>
                    <div class="card-body">
                        <div class="backup-list">
                            <?php foreach ($backups as $backup): ?>
                            <div class="backup-item">
                                <div class="backup-info">
                                    <h4><?php echo htmlspecialchars($backup['name']); ?></h4>
                                    <p><strong>Сервер:</strong> <?php echo htmlspecialchars($backup['server_name'] ?? 'Неизвестный сервер'); ?></p>
                                    <p><strong>Размер:</strong> <?php echo htmlspecialchars($backup['size']); ?></p>
                                    <p><strong>Дата:</strong> <?php echo htmlspecialchars($backup['created_at']); ?></p>
                                </div>
                                <?php if ($auth->hasPermission('manage_backups')): ?>
                                <div class="backup-actions">
                                    <button class="btn btn-success restore-backup" data-id="<?php echo $backup['id']; ?>">Восстановить</button>
                                    <button class="btn btn-danger delete-backup" data-id="<?php echo $backup['id']; ?>">Удалить</button>
                                </div>
                                <?php endif; ?>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Настройки автоматического резервного копирования</h3>
                    </div>
                    <div class="card-body">
                        <div class="form-group">
                            <label>
                                <input type="checkbox" checked> Автоматическое резервное копирование
                            </label>
                        </div>
                        <div class="form-group">
                            <label>Интервал резервного копирования:</label>
                            <select class="form-control">
                                <option>Ежедневно</option>
                                <option selected>Каждые 6 часов</option>
                                <option>Каждые 12 часов</option>
                                <option>Еженедельно</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Максимум хранить резервных копий:</label>
                            <input type="number" class="form-control" value="10" min="1">
                        </div>
                        <button class="btn btn-primary">Сохранить настройки</button>
                    </div>
                </div>
            </section>
            
            <?php elseif ($_GET['page'] == 'scheduler'): ?>
            <section id="scheduler" class="page <?php echo ($_GET['page'] == 'scheduler') ? 'active' : ''; ?>">
                <h2>Планировщик задач</h2>
                <div class="card">
                    <div class="card-header">
                        <h3>Запланированные задачи</h3>
                        <?php if ($auth->hasPermission('manage_settings')): ?>
                        <button id="add-task" class="btn btn-primary">Добавить задачу</button>
                        <?php endif; ?>
                    </div>
                    <div class="card-body">
                        <div class="scheduler-list">
                            <?php foreach ($tasks as $task): ?>
                            <div class="task-item">
                                <div class="task-info">
                                    <h4><?php echo htmlspecialchars($task['name']); ?></h4>
                                    <p><strong>Сервер:</strong> <?php echo htmlspecialchars($task['server_name'] ?? 'Все серверы'); ?></p>
                                    <p><strong>Расписание:</strong> <?php echo htmlspecialchars($task['schedule']); ?></p>
                                    <p><strong>Статус:</strong> <span class="status-badge <?php echo $task['status'] == 'enabled' ? 'status-enabled' : 'status-disabled'; ?>">
                                        <?php echo $task['status'] == 'enabled' ? 'Активен' : 'Отключен'; ?>
                                    </span></p>
                                </div>
                                <?php if ($auth->hasPermission('manage_settings')): ?>
                                <div class="task-actions">
                                    <?php if ($task['status'] == 'enabled'): ?>
                                        <button class="btn btn-warning disable-task" data-id="<?php echo $task['id']; ?>">Отключить</button>
                                    <?php else: ?>
                                        <button class="btn btn-success enable-task" data-id="<?php echo $task['id']; ?>">Включить</button>
                                    <?php endif; ?>
                                    <button class="btn btn-danger delete-task" data-id="<?php echo $task['id']; ?>">Удалить</button>
                                </div>
                                <?php endif; ?>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
                
                <?php if ($auth->hasPermission('manage_settings')): ?>
                <div class="card">
                    <div class="card-header">
                        <h3>Добавить новую задачу</h3>
                    </div>
                    <div class="card-body">
                        <form id="add-task-form">
                            <div class="form-group">
                                <label for="task-name">Название задачи:</label>
                                <input type="text" id="task-name" name="name" class="form-control" placeholder="Например: Ежедневный перезапуск" required>
                            </div>
                            <div class="form-group">
                                <label for="task-type">Тип задачи:</label>
                                <select id="task-type" name="type" class="form-control" required>
                                    <option value="restart">Перезапуск сервера</option>
                                    <option value="backup">Резервное копирование</option>
                                    <option value="command">Выполнение команды</option>
                                    <option value="notification">Отправка уведомления</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="task-server">Сервер:</label>
                                <select id="task-server" name="server_id" class="form-control" required>
                                    <option value="">Все серверы</option>
                                    <?php foreach ($servers as $server): ?>
                                    <option value="<?php echo $server['id']; ?>"><?php echo htmlspecialchars($server['name']); ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="task-schedule">Расписание (cron):</label>
                                <input type="text" id="task-schedule" name="schedule" class="form-control" placeholder="0 5 * * *" required>
                            </div>
                            <button type="submit" class="btn btn-primary">Добавить задачу</button>
                        </form>
                    </div>
                </div>
                <?php endif; ?>
            </section>
            
            <?php elseif ($_GET['page'] == 'notifications'): ?>
            <section id="notifications" class="page <?php echo ($_GET['page'] == 'notifications') ? 'active' : ''; ?>">
                <h2>Система уведомлений</h2>
                <div class="card">
                    <div class="card-header">
                        <h3>Настройки уведомлений</h3>
                    </div>
                    <div class="card-body">
                        <form id="notifications-form">
                            <div class="notification-settings">
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" name="email_enabled" <?php echo $notificationSettings['email_enabled'] ? 'checked' : ''; ?>> 
                                        Уведомления по Email
                                    </label>
                                </div>
                                <div class="form-group">
                                    <label>Email для уведомлений:</label>
                                    <input type="email" name="email_address" class="form-control" value="<?php echo htmlspecialchars($notificationSettings['email_address']); ?>">
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" name="telegram_enabled" <?php echo $notificationSettings['telegram_enabled'] ? 'checked' : ''; ?>> 
                                        Уведомления в Telegram
                                    </label>
                                </div>
                                <div class="form-group">
                                    <label>Telegram Bot Token:</label>
                                    <input type="text" name="telegram_token" class="form-control" value="<?php echo htmlspecialchars($notificationSettings['telegram_token']); ?>">
                                </div>
                                <div class="form-group">
                                    <label>Chat ID:</label>
                                    <input type="text" name="telegram_chat_id" class="form-control" value="<?php echo htmlspecialchars($notificationSettings['telegram_chat_id']); ?>">
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" name="discord_enabled" <?php echo $notificationSettings['discord_enabled'] ? 'checked' : ''; ?>> 
                                        Уведомления в Discord
                                    </label>
                                </div>
                                <div class="form-group">
                                    <label>Discord Webhook URL:</label>
                                    <input type="text" name="discord_webhook" class="form-control" value="<?php echo htmlspecialchars($notificationSettings['discord_webhook']); ?>" placeholder="https://discord.com/api/webhooks/...">
                                </div>
                                
                                <button type="submit" class="btn btn-primary">Сохранить настройки</button>
                            </div>
                        </form>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Типы уведомлений</h3>
                    </div>
                    <div class="card-body">
                        <div class="notification-types">
                            <?php 
                            $notificationTypes = [
                                'server_status' => 'Уведомления о запуске/остановке сервера',
                                'errors' => 'Уведомления об ошибках',
                                'high_load' => 'Уведомления о высокой нагрузке',
                                'backups' => 'Уведомления о резервном копировании',
                                'player_connections' => 'Уведомления о подключении игроков'
                            ];
                            
                            foreach ($notificationTypes as $key => $label): 
                            ?>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" name="notifications[<?php echo $key; ?>]" <?php echo ($notificationSettings['notifications'][$key] ?? false) ? 'checked' : ''; ?>> 
                                    <?php echo $label; ?>
                                </label>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
            </section>
            
            <?php elseif ($_GET['page'] == 'security'): ?>
            <section id="security" class="page <?php echo ($_GET['page'] == 'security') ? 'active' : ''; ?>">
                <h2>Безопасность</h2>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Двухфакторная аутентификация</h3>
                    </div>
                    <div class="card-body">
                        <div class="security-section">
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="2fa-toggle" <?php echo $auth->isTwoFAEnabled($_SESSION['user_id']) ? 'checked' : ''; ?>> 
                                    Включить двухфакторную аутентификацию
                                </label>
                            </div>
                            
                            <div id="2fa-setup" style="display: <?php echo $auth->isTwoFAEnabled($_SESSION['user_id']) ? 'block' : 'none'; ?>;">
                                <p>Отсканируйте QR-код с помощью приложения Google Authenticator, Authy или аналогичного:</p>
                                <div class="qr-code-placeholder">
                                    <p>QR-код будет здесь</p>
                                </div>
                                <div class="form-group">
                                    <label>Или введите ключ вручную:</label>
                                    <input type="text" class="form-control" value="XXXX-XXXX-XXXX-XXXX" readonly>
                                </div>
                                <div class="form-group">
                                    <label>Введите код из приложения:</label>
                                    <input type="text" class="form-control" placeholder="000000">
                                </div>
                                <button class="btn btn-primary">Подтвердить и включить 2FA</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Управление IP-адресами</h3>
                    </div>
                    <div class="card-body">
                        <div class="security-section">
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="ip-restriction-toggle"> Ограничить доступ по IP-адресам
                                </label>
                            </div>
                            
                            <div id="ip-restriction-setup" style="display: none;">
                                <div class="form-group">
                                    <label>Текущий IP-адрес: <strong><?php echo $_SERVER['REMOTE_ADDR']; ?></strong></label>
                                </div>
                                
                                <div class="form-group">
                                    <label>Добавить разрешенный IP-адрес:</label>
                                    <div class="input-group">
                                        <input type="text" class="form-control" placeholder="192.168.1.1" id="new-ip">
                                        <button class="btn btn-primary" id="add-ip">Добавить</button>
                                    </div>
                                </div>
                                
                                <div class="ip-list">
                                    <h4>Разрешенные IP-адреса:</h4>
                                    <ul id="allowed-ips-list">
                                        <li><?php echo $_SERVER['REMOTE_ADDR']; ?> <button class="btn btn-sm btn-danger remove-ip">Удалить</button></li>
                                        <li>192.168.1.100 <button class="btn btn-sm btn-danger remove-ip">Удалить</button></li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Роли и разрешения</h3>
                    </div>
                    <div class="card-body">
                        <div class="security-section">
                            <div class="form-group">
                                <label>Текущая роль: <strong><?php 
                                    $roles = ['admin' => 'Администратор', 'moderator' => 'Модератор', 'user' => 'Пользователь'];
                                    echo $roles[$_SESSION['role']] ?? 'Пользователь';
                                ?></strong></label>
                            </div>
                            
                            <?php if ($auth->hasRole('admin')): ?>
                            <div class="roles-management">
                                <h4>Управление пользователями</h4>
                                <table class="table">
                                    <thead>
                                        <tr>
                                            <th>Пользователь</th>
                                            <th>Роль</th>
                                            <th>Последний вход</th>
                                            <th>IP-адрес</th>
                                            <?php if ($auth->hasRole('admin')): ?>
                                            <th>Действия</th>
                                            <?php endif; ?>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php foreach ($users as $user): ?>
                                        <tr>
                                            <td><?php echo htmlspecialchars($user['username']); ?></td>
                                            <td>
                                                <?php if ($auth->hasRole('admin')): ?>
                                                <select class="form-control user-role" data-user-id="<?php echo $user['id']; ?>">
                                                    <option value="admin" <?php echo $user['role'] == 'admin' ? 'selected' : ''; ?>>Администратор</option>
                                                    <option value="moderator" <?php echo $user['role'] == 'moderator' ? 'selected' : ''; ?>>Модератор</option>
                                                    <option value="user" <?php echo $user['role'] == 'user' ? 'selected' : ''; ?>>Пользователь</option>
                                                </select>
                                                <?php else: ?>
                                                <?php echo $roles[$user['role']] ?? $user['role']; ?>
                                                <?php endif; ?>
                                            </td>
                                            <td><?php echo $user['last_login'] ? date('Y-m-d H:i:s', strtotime($user['last_login'])) : 'Никогда'; ?></td>
                                            <td><?php echo htmlspecialchars($user['last_ip'] ?? 'Неизвестен'); ?></td>
                                            <?php if ($auth->hasRole('admin')): ?>
                                            <td>
                                                <?php if ($user['id'] != $_SESSION['user_id']): ?>
                                                <button class="btn btn-sm btn-danger delete-user" data-user-id="<?php echo $user['id']; ?>">Удалить</button>
                                                <?php endif; ?>
                                            </td>
                                            <?php endif; ?>
                                        </tr>
                                        <?php endforeach; ?>
                                    </tbody>
                                </table>
                            </div>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Аудит действий</h3>
                    </div>
                    <div class="card-body">
                        <div class="audit-log">
                            <div class="form-group">
                                <label>Фильтр по пользователю:</label>
                                <input type="text" class="form-control" placeholder="Введите имя пользователя">
                            </div>
                            
                            <div class="form-group">
                                <label>Фильтр по действию:</label>
                                <select class="form-control">
                                    <option>Все действия</option>
                                    <option>Вход в систему</option>
                                    <option>Выход из системы</option>
                                    <option>Запуск сервера</option>
                                    <option>Остановка сервера</option>
                                    <option>Ошибка</option>
                                </select>
                            </div>
                            
                            <div class="audit-log-table">
                                <table class="table">
                                    <thead>
                                        <tr>
                                            <th>Время</th>
                                            <th>Пользователь</th>
                                            <th>Действие</th>
                                            <th>Детали</th>
                                            <th>IP-адрес</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php foreach ($auditLogs as $log): ?>
                                        <tr>
                                            <td><?php echo htmlspecialchars($log['created_at']); ?></td>
                                            <td><?php echo htmlspecialchars($log['username']); ?></td>
                                            <td><?php echo htmlspecialchars($log['action']); ?></td>
                                            <td><?php echo htmlspecialchars($log['details']); ?></td>
                                            <td><?php echo htmlspecialchars($log['ip_address']); ?></td>
                                        </tr>
                                        <?php endforeach; ?>
                                    </tbody>
                                </table>
                            </div>
                            
                            <div class="pagination">
                                <button class="btn btn-secondary">Предыдущая</button>
                                <span>Страница 1 из 10</span>
                                <button class="btn btn-secondary">Следующая</button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            
            <?php elseif ($_GET['page'] == 'stats'): ?>
            <section id="stats" class="page <?php echo ($_GET['page'] == 'stats') ? 'active' : ''; ?>">
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
            <section id="logs" class="page <?php echo ($_GET['page'] == 'logs') ? 'active' : ''; ?>">
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
        <p>&copy; 2025 SparkPanel. Все права защищены.</p>
    </footer>
    
    <script src="assets/script.js"></script>
    <script>
        // Инициализация графиков мониторинга
        let cpuChart, memoryChart, diskChart, networkChart;
        let monitoringInterval;
        
        // Инициализация мониторинга при загрузке страницы статистики
        document.addEventListener('DOMContentLoaded', function() {
            if (document.getElementById('stats') && document.getElementById('stats').classList.contains('active')) {
                initMonitoring();
            }
        });
        
        // Инициализация мониторинга
        function initMonitoring() {
            // Создание графиков
            createCharts();
            
            // Начало мониторинга
            startMonitoring();
        }
        
        // Создание графиков
        function createCharts() {
            const cpuCtx = document.getElementById('cpuChart').getContext('2d');
            cpuChart = new Chart(cpuCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Использование CPU (%)',
                        data: [],
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            min: 0,
                            max: 100
                        }
                    }
                }
            });
            
            const memoryCtx = document.getElementById('memoryChart').getContext('2d');
            memoryChart = new Chart(memoryCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Использование памяти (%)',
                        data: [],
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            min: 0,
                            max: 100
                        }
                    }
                }
            });
            
            const diskCtx = document.getElementById('diskChart').getContext('2d');
            diskChart = new Chart(diskCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Использование диска (%)',
                        data: [],
                        borderColor: 'rgb(255, 205, 86)',
                        backgroundColor: 'rgba(255, 205, 86, 0.2)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            min: 0,
                            max: 100
                        }
                    }
                }
            });
            
            const networkCtx = document.getElementById('networkChart').getContext('2d');
            networkChart = new Chart(networkCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Отправлено (MB)',
                            data: [],
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            tension: 0.1
                        },
                        {
                            label: 'Получено (MB)',
                            data: [],
                            borderColor: 'rgb(153, 102, 255)',
                            backgroundColor: 'rgba(153, 102, 255, 0.2)',
                            tension: 0.1
                        }
                    ]
                },
                options: {
                    responsive: true
                }
            });
        }
        
        // Начало мониторинга
        function startMonitoring() {
            // Обновляем данные каждые 5 секунд
            monitoringInterval = setInterval(updateMonitoringData, 5000);
            // Немедленное обновление при запуске
            updateMonitoringData();
        }
        
        // Остановка мониторинга
        function stopMonitoring() {
            if (monitoringInterval) {
                clearInterval(monitoringInterval);
            }
        }
        
        // Обновление данных мониторинга
        function updateMonitoringData() {
            // Получаем текущие метрики
            fetch('index.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'action=get_metrics&type=current'
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error('Ошибка получения метрик:', data.error);
                    return;
                }
                
                // Обновляем статистику
                updateStats(data);
            })
            .catch(error => {
                console.error('Ошибка:', error);
            });
            
            // Получаем исторические данные для графиков
            fetch('index.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'action=get_metrics&type=cpu&limit=20'
            })
            .then(response => response.json())
            .then(data => {
                if (!data.error) {
                    updateChart(cpuChart, data);
                }
            });
            
            fetch('index.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'action=get_metrics&type=memory&limit=20'
            })
            .then(response => response.json())
            .then(data => {
                if (!data.error) {
                    updateChart(memoryChart, data);
                }
            });
            
            fetch('index.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'action=get_metrics&type=disk&limit=20'
            })
            .then(response => response.json())
            .then(data => {
                if (!data.error) {
                    updateChart(diskChart, data);
                }
            });
            
            // Проверяем оповещения
            checkAlerts();
        }
        
        // Обновление статистики
        function updateStats(metrics) {
            // CPU
            document.getElementById('cpu-value').textContent = metrics.cpu.percent.toFixed(1) + '%';
            document.getElementById('cpu-progress').style.width = metrics.cpu.percent + '%';
            
            // Память
            document.getElementById('memory-value').textContent = metrics.memory.percent.toFixed(1) + '%';
            document.getElementById('memory-progress').style.width = metrics.memory.percent + '%';
            
            // Диск
            document.getElementById('disk-value').textContent = metrics.disk.percent.toFixed(1) + '%';
            document.getElementById('disk-progress').style.width = metrics.disk.percent + '%';
            
            // Игроки
            document.getElementById('players-value').textContent = 
                metrics.minecraft.players_online + '/' + metrics.minecraft.players_max;
            const playerPercent = (metrics.minecraft.players_online / metrics.minecraft.players_max) * 100;
            document.getElementById('players-progress').style.width = playerPercent + '%';
            
            // Minecraft метрики
            document.getElementById('tps-value').textContent = metrics.minecraft.tps.toFixed(2);
            document.getElementById('chunks-value').textContent = metrics.minecraft.chunks_loaded;
            document.getElementById('entities-value').textContent = metrics.minecraft.entities;
            
            // Время работы
            const uptime = formatUptime(metrics.minecraft.uptime);
            document.getElementById('uptime-value').textContent = uptime;
            
            // Сетевые метрики
            document.getElementById('sent-value').textContent = formatBytes(metrics.network.bytes_sent);
            document.getElementById('recv-value').textContent = formatBytes(metrics.network.bytes_recv);
        }
        
        // Обновление графика
        function updateChart(chart, data) {
            const labels = data.map(item => {
                const date = new Date(item.timestamp);
                return date.toLocaleTimeString();
            });
            
            const values = data.map(item => {
                if (item.percent !== undefined) {
                    return item.percent;
                } else if (item.used !== undefined) {
                    return item.percent;
                } else {
                    return item.bytes_sent ? item.bytes_sent / (1024 * 1024) : 0;
                }
            });
            
            chart.data.labels = labels;
            chart.data.datasets[0].data = values;
            chart.update();
        }
        
        // Проверка оповещений
        function checkAlerts() {
            fetch('index.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'action=check_alerts'
            })
            .then(response => response.json())
            .then(alerts => {
                displayAlerts(alerts);
            })
            .catch(error => {
                console.error('Ошибка проверки оповещений:', error);
            });
        }
        
        // Отображение оповещений
        function displayAlerts(alerts) {
            const container = document.getElementById('alerts-container');
            container.innerHTML = '';
            
            if (alerts.length === 0) {
                container.innerHTML = '<p>Нет активных оповещений</p>';
                return;
            }
            
            alerts.forEach(alert => {
                const alertElement = document.createElement('div');
                alertElement.className = `alert alert-${alert.level}`;
                alertElement.innerHTML = `
                    <div class="alert-header">
                        <span class="alert-type">${alert.type.toUpperCase()}</span>
                        <span class="alert-time">${alert.timestamp}</span>
                    </div>
                    <div class="alert-message">${alert.message}</div>
                `;
                container.appendChild(alertElement);
            });
        }
        
        // Форматирование времени работы
        function formatUptime(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}ч ${minutes}м`;
        }
        
        // Форматирование байтов
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // Обработчики для страницы документации
        document.addEventListener('DOMContentLoaded', function() {
            // Обработчик поиска по документации
            const searchBtn = document.getElementById('search-docs-btn');
            if (searchBtn) {
                searchBtn.addEventListener('click', function() {
                    const query = document.getElementById('docs-search').value;
                    if (query.trim() !== '') {
                        searchDocumentation(query);
                    }
                });
            }
            
            // Обработчик нажатия Enter в поле поиска
            const searchInput = document.getElementById('docs-search');
            if (searchInput) {
                searchInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        const query = this.value;
                        if (query.trim() !== '') {
                            searchDocumentation(query);
                        }
                    }
                });
            }
            
            // Обработчики для карточек документации
            const docCards = document.querySelectorAll('.doc-card');
            docCards.forEach(card => {
                card.addEventListener('click', function() {
                    const sectionId = this.getAttribute('data-section');
                    showDocumentationSection(sectionId);
                });
            });
            
            // Обработчики для системы обновлений
            const checkUpdatesBtn = document.getElementById('check-updates');
            if (checkUpdatesBtn) {
                checkUpdatesBtn.addEventListener('click', checkForUpdates);
            }
            
            const downloadUpdateBtn = document.getElementById('download-update');
            if (downloadUpdateBtn) {
                downloadUpdateBtn.addEventListener('click', downloadAndInstallUpdate);
            }
        });
        
        // Функция поиска по документации
        function searchDocumentation(query) {
            fetch('index.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'action=search_docs&query=' + encodeURIComponent(query)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displaySearchResults(data.results);
                }
            })
            .catch(error => {
                console.error('Ошибка поиска:', error);
            });
        }
        
        // Отображение результатов поиска
        function displaySearchResults(results) {
            const resultsContainer = document.getElementById('search-results');
            if (results.length === 0) {
                resultsContainer.innerHTML = '<p>По вашему запросу ничего не найдено.</p>';
                return;
            }
            
            let html = '<div class="search-results-list">';
            results.forEach(result => {
                html += `
                    <div class="search-result-item">
                        <div class="result-icon">${result.icon}</div>
                        <div class="result-info">
                            <h4>${result.title}</h4>
                            <p>${result.description}</p>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            
            resultsContainer.innerHTML = html;
        }
        
        // Отображение раздела документации
        function showDocumentationSection(sectionId) {
            // В реальной реализации здесь будет загрузка содержимого раздела
            alert('Открытие раздела документации: ' + sectionId);
        }
        
        // Проверка наличия обновлений
        function checkForUpdates() {
            const btn = document.getElementById('check-updates');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Проверка...';
            btn.disabled = true;
            
            fetch('index.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'action=check_updates'
            })
            .then(response => response.json())
            .then(data => {
                btn.innerHTML = originalText;
                btn.disabled = false;
                
                if (data.success && data.update_available) {
                    document.getElementById('new-version').textContent = data.version;
                    document.getElementById('release-date').textContent = data.release_date;
                    
                    const changelogList = document.getElementById('changelog-list');
                    changelogList.innerHTML = '';
                    data.changelog.forEach(item => {
                        const li = document.createElement('li');
                        li.textContent = item;
                        changelogList.appendChild(li);
                    });
                    
                    document.getElementById('update-available').style.display = 'block';
                } else {
                    alert('Обновлений не найдено. У вас установлена последняя версия.');
                }
            })
            .catch(error => {
                btn.innerHTML = originalText;
                btn.disabled = false;
                console.error('Ошибка проверки обновлений:', error);
                alert('Ошибка проверки обновлений.');
            });
        }
        
        // Скачивание и установка обновления
        function downloadAndInstallUpdate() {
            const btn = document.getElementById('download-update');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Скачивание...';
            btn.disabled = true;
            
            // В реальной реализации здесь будет последовательность:
            // 1. Скачивание обновления
            // 2. Установка обновления
            // 3. Перезагрузка панели
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
                alert('Обновление успешно установлено! Панель будет перезагружена.');
                location.reload();
            }, 3000);
        }
    </script>
</body>
</html>