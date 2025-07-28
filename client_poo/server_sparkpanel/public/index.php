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
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SparkPanel - Вход</title>
        <link rel="stylesheet" href="assets/style.css">
    </head>
    <body class="light-theme">
        <div class="theme-toggle">
            <input type="checkbox" id="theme-switch" />
            <label for="theme-switch">Темная тема</label>
        </div>
        
        <header>
            <div class="container">
                <h1>SparkPanel</h1>
            </div>
        </header>
        
        <main class="container">
            <div class="card" style="max-width: 500px; margin: 2rem auto;">
                <div class="card-header">
                    <h3>Вход в панель управления</h3>
                </div>
                <div class="card-body">
                    <form id="login-form">
                        <div class="form-group">
                            <label for="username">Имя пользователя:</label>
                            <input type="text" id="username" name="username" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label for="password">Пароль:</label>
                            <input type="password" id="password" name="password" class="form-control" required>
                        </div>
                        <div id="twofa-field" class="form-group" style="display: none;">
                            <label for="twofa_code">Код двухфакторной аутентификации:</label>
                            <input type="text" id="twofa_code" name="twofa_code" class="form-control" maxlength="6">
                        </div>
                        <button type="submit" class="btn btn-primary">Войти</button>
                    </form>
                    <div id="login-message" class="mt-3"></div>
                </div>
            </div>
        </main>
        
        <footer>
            <p>&copy; 2025 SparkPanel. Все права защищены.</p>
        </footer>
        
        <script src="assets/script.js"></script>
        <script>
            document.getElementById('login-form').addEventListener('submit', function(e) {
                e.preventDefault();
                
                const formData = new FormData(this);
                const xhr = new XMLHttpRequest();
                xhr.open('POST', 'login.php', true);
                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        const response = JSON.parse(xhr.responseText);
                        const messageDiv = document.getElementById('login-message');
                        
                        if (response.success) {
                            messageDiv.innerHTML = '<div class="alert alert-success">' + response.message + '</div>';
                            setTimeout(() => {
                                window.location.reload();
                            }, 1000);
                        } else {
                            if (response.twofa_required) {
                                document.getElementById('twofa-field').style.display = 'block';
                                messageDiv.innerHTML = '<div class="alert alert-info">' + response.message + '</div>';
                            } else {
                                document.getElementById('twofa-field').style.display = 'none';
                                messageDiv.innerHTML = '<div class="alert alert-danger">' + response.message + '</div>';
                            }
                        }
                    }
                };
                xhr.send(formData);
            });
        </script>
    </body>
    </html>
    <?php
    exit;
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
                $result = $auth->deleteUser($_POST['id']);
                echo json_encode($result);
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
</head>
<body class="light-theme">
    <header>
        <h1>SparkPanel</h1>
        <nav>
            <ul>
                <li><a href="?page=servers">Серверы</a></li>
                <li><a href="?page=plugins">Плагины</a></li>
                <li><a href="?page=backup">Резервные копии</a></li>
                <li><a href="?page=scheduler">Планировщик</a></li>
                <li><a href="?page=notifications">Уведомления</a></li>
                <li><a href="?page=security">Безопасность</a></li>
                <li><a href="?page=stats">Статистика</a></li>
                <li><a href="?page=docs">Документация</a></li>
                <li><a href="?page=logs">Логи</a></li>
                <?php if ($auth->hasRole('admin')): ?>
                <li><a href="?page=updates">Обновления</a></li>
                <?php endif; ?>
                <li><a href="?action=logout">Выход (<?= htmlspecialchars($_SESSION['username'] ?? 'Гость') ?>)</a></li>
            </ul>
        </nav>
        <div class="theme-toggle">
            <button id="toggle-theme">🌙</button>
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
                                        <?php echo $task['status'] == 'enabled' ? 'Активна' : 'Отключена'; ?>
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
                
                <div class="card">
                    <div class="card-header">
                        <h3>Добавить новую задачу</h3>
                    </div>
                    <div class="card-body">
                        <form id="add-task-form">
                            <div class="form-group">
                                <label>Название задачи:</label>
                                <input type="text" class="form-control" name="name" placeholder="Например: Ежедневный перезапуск" required>
                            </div>
                            <div class="form-group">
                                <label>Тип задачи:</label>
                                <select class="form-control" name="type" required>
                                    <option value="restart">Перезапуск сервера</option>
                                    <option value="backup">Резервное копирование</option>
                                    <option value="command">Выполнение команды</option>
                                    <option value="notification">Отправка уведомления</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Сервер:</label>
                                <select class="form-control" name="server_id">
                                    <option value="">Все серверы</option>
                                    <?php foreach ($servers as $server): ?>
                                    <option value="<?php echo $server['id']; ?>"><?php echo htmlspecialchars($server['name']); ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Расписание (cron):</label>
                                <input type="text" class="form-control" name="schedule" placeholder="0 5 * * *" required>
                            </div>
                            <button type="submit" class="btn btn-primary">Добавить задачу</button>
                        </form>
                    </div>
                </div>
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
                                    <input type="email" class="form-control" name="email_address" value="<?php echo htmlspecialchars($notificationSettings['email_address']); ?>">
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" name="telegram_enabled" <?php echo $notificationSettings['telegram_enabled'] ? 'checked' : ''; ?>> 
                                        Уведомления в Telegram
                                    </label>
                                </div>
                                <div class="form-group">
                                    <label>Telegram Bot Token:</label>
                                    <input type="text" class="form-control" name="telegram_token" value="<?php echo htmlspecialchars($notificationSettings['telegram_token']); ?>">
                                </div>
                                <div class="form-group">
                                    <label>Chat ID:</label>
                                    <input type="text" class="form-control" name="telegram_chat_id" value="<?php echo htmlspecialchars($notificationSettings['telegram_chat_id']); ?>">
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" name="discord_enabled" <?php echo $notificationSettings['discord_enabled'] ? 'checked' : ''; ?>> 
                                        Уведомления в Discord
                                    </label>
                                </div>
                                <div class="form-group">
                                    <label>Discord Webhook URL:</label>
                                    <input type="text" class="form-control" name="discord_webhook" value="<?php echo htmlspecialchars($notificationSettings['discord_webhook']); ?>" placeholder="https://discord.com/api/webhooks/...">
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
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" name="notifications[server_status]" <?php echo ($notificationSettings['notifications']['server_status'] ?? true) ? 'checked' : ''; ?>> 
                                    Уведомления о запуске/остановке сервера
                                </label>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" name="notifications[errors]" <?php echo ($notificationSettings['notifications']['errors'] ?? true) ? 'checked' : ''; ?>> 
                                    Уведомления об ошибках
                                </label>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" name="notifications[high_load]" <?php echo ($notificationSettings['notifications']['high_load'] ?? true) ? 'checked' : ''; ?>> 
                                    Уведомления о высокой нагрузке
                                </label>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" name="notifications[backups]" <?php echo ($notificationSettings['notifications']['backups'] ?? false) ? 'checked' : ''; ?>> 
                                    Уведомления о резервном копировании
                                </label>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" name="notifications[player_connections]" <?php echo ($notificationSettings['notifications']['player_connections'] ?? false) ? 'checked' : ''; ?>> 
                                    Уведомления о подключении игроков
                                </label>
                            </div>
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
                                    <input type="checkbox" id="ip-restriction-toggle" <?php echo !empty($auth->getAllowedIPs($_SESSION['user_id'])) ? 'checked' : ''; ?>> 
                                    Ограничить доступ по IP-адресам
                                </label>
                            </div>
                            
                            <div id="ip-restriction-setup" style="display: <?php echo !empty($auth->getAllowedIPs($_SESSION['user_id'])) ? 'block' : 'none'; ?>;">
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
                                        <?php 
                                        $allowedIPs = $auth->getAllowedIPs($_SESSION['user_id']);
                                        foreach ($allowedIPs as $ip): ?>
                                        <li><?php echo htmlspecialchars($ip); ?> <button class="btn btn-sm btn-danger remove-ip" data-ip="<?php echo htmlspecialchars($ip); ?>">Удалить</button></li>
                                        <?php endforeach; ?>
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
                                    echo $roles[$_SESSION['role']] ?? 'Неизвестная роль';
                                ?></strong></label>
                            </div>
                            
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
                                            <td><?php echo date('Y-m-d H:i:s', strtotime($log['created_at'])); ?></td>
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
            
            <?php elseif ($_GET['page'] == 'docs'): ?>
            <section id="docs" class="page <?php echo ($_GET['page'] == 'docs') ? 'active' : ''; ?>">
                <h2>Документация и справка</h2>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Разделы документации</h3>
                    </div>
                    <div class="card-body">
                        <div class="docs-grid">
                            <?php foreach ($docSections as $section): ?>
                            <div class="doc-card" data-section="<?php echo $section['id']; ?>">
                                <div class="doc-icon"><?php echo $section['icon']; ?></div>
                                <div class="doc-info">
                                    <h4><?php echo htmlspecialchars($section['title']); ?></h4>
                                    <p><?php echo htmlspecialchars($section['description']); ?></p>
                                </div>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Поиск по документации</h3>
                    </div>
                    <div class="card-body">
                        <div class="search-box">
                            <input type="text" id="docs-search" class="form-control" placeholder="Введите поисковый запрос...">
                            <button id="search-docs-btn" class="btn btn-primary">Поиск</button>
                        </div>
                        <div id="search-results" class="search-results"></div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Часто задаваемые вопросы</h3>
                    </div>
                    <div class="card-body">
                        <div class="faq-list">
                            <?php foreach ($faqItems as $faq): ?>
                            <div class="faq-item">
                                <div class="faq-question">
                                    <h4><?php echo htmlspecialchars($faq['question']); ?></h4>
                                </div>
                                <div class="faq-answer">
                                    <p><?php echo htmlspecialchars($faq['answer']); ?></p>
                                </div>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Руководство пользователя</h3>
                    </div>
                    <div class="card-body">
                        <div class="manual-download">
                            <p>Скачайте полное руководство пользователя в формате PDF:</p>
                            <a href="/docs/user_manual.pdf" class="btn btn-primary" download>Скачать руководство (2.5 MB)</a>
                        </div>
                    </div>
                </div>
            </section>
            
            <?php elseif ($_GET['page'] == 'updates' && $auth->hasRole('admin')): ?>
            <section id="updates" class="page <?php echo ($_GET['page'] == 'updates') ? 'active' : ''; ?>">
                <h2>Система обновлений</h2>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Текущая версия</h3>
                    </div>
                    <div class="card-body">
                        <div class="version-info">
                            <p><strong>Установленная версия:</strong> <span id="current-version">1.0.0</span></p>
                            <button id="check-updates" class="btn btn-primary">Проверить обновления</button>
                        </div>
                    </div>
                </div>
                
                <div class="card" id="update-available" style="display: none;">
                    <div class="card-header">
                        <h3>Доступно обновление</h3>
                    </div>
                    <div class="card-body">
                        <div class="update-info">
                            <p><strong>Новая версия:</strong> <span id="new-version"></span></p>
                            <p><strong>Дата релиза:</strong> <span id="release-date"></span></p>
                            <div class="changelog">
                                <h4>Список изменений:</h4>
                                <ul id="changelog-list"></ul>
                            </div>
                            <div class="update-actions">
                                <button id="download-update" class="btn btn-success">Скачать и установить</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>История обновлений</h3>
                    </div>
                    <div class="card-body">
                        <div class="update-history">
                            <div class="history-item">
                                <h4>Версия 1.0.1</h4>
                                <p class="release-date">Дата релиза: 2025-02-01</p>
                                <ul>
                                    <li>Исправлены ошибки авторизации</li>
                                    <li>Добавлены метрики производительности</li>
                                </ul>
                            </div>
                            <div class="history-item">
                                <h4>Версия 1.0.0</h4>
                                <p class="release-date">Дата релиза: 2025-01-15</p>
                                <ul>
                                    <li>Первый релиз SparkPanel</li>
                                    <li>Базовая функциональность управления серверами</li>
                                </ul>
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
        // ... existing scripts ...
        
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