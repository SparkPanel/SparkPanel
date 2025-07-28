content = '''<?php
// Проверка User-Agent для безопасности
$userAgent = $_SERVER['HTTP_USER_AGENT'];
if (!str_contains($userAgent, 'PooClient')) {
    http_response_code(403);
    echo "Access denied.";
    exit;
}

// Если проверка пройдена, показываем панель
// require_once '../app/auth.php';
// require_once '../app/server_manager.php';

// Здесь будет основной интерфейс панели
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SparkPanel - Панель управления серверами</title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body>
    <header>
        <h1>SparkPanel</h1>
        <nav>
            <ul>
                <li><a href="?page=servers">Серверы</a></li>
                <li><a href="?page=stats">Статистика</a></li>
                <li><a href="?page=logs">Логи</a></li>
                <li><a href="?action=logout">Выход</a></li>
            </ul>
        </nav>
    </header>
    
    <main>
        <h2>Панель управления Minecraft-серверами</h2>
        
        <?php if (!isset($_GET['page']) || $_GET['page'] == 'servers'): ?>
        <section id="servers">
            <h3>Управление серверами</h3>
            <button id="add-server">Добавить сервер</button>
            <div id="server-list">
                <!-- Список серверов будет здесь -->
                <div class="server-item">
                    <h4>Minecraft Server #1</h4>
                    <p>IP: 123.45.67.89</p>
                    <p>Порт: 25565</p>
                    <p>Статус: <span style="color: green;">Онлайн</span></p>
                    <p>Игроки: 12/20</p>
                    <div class="server-actions">
                        <button class="stop">Остановить</button>
                        <button class="delete">Удалить</button>
                    </div>
                </div>
                <div class="server-item">
                    <h4>Minecraft Server #2</h4>
                    <p>IP: 123.45.67.89</p>
                    <p>Порт: 25566</p>
                    <p>Статус: <span style="color: red;">Оффлайн</span></p>
                    <p>Игроки: 0/15</p>
                    <div class="server-actions">
                        <button class="start">Запустить</button>
                        <button class="delete">Удалить</button>
                    </div>
                </div>
            </div>
        </section>
        <?php elseif ($_GET['page'] == 'stats'): ?>
        <section id="stats">
            <h3>Статистика</h3>
            <div class="stats-grid">
                <div class="stat-card">
                    <h4>Загрузка CPU</h4>
                    <div class="stat-value">42%</div>
                </div>
                <div class="stat-card">
                    <h4>Использование RAM</h4>
                    <div class="stat-value">6.2 GB</div>
                </div>
                <div class="stat-card">
                    <h4>Активные серверы</h4>
                    <div class="stat-value">1</div>
                </div>
                <div class="stat-card">
                    <h4>Всего игроков</h4>
                    <div class="stat-value">12</div>
                </div>
            </div>
        </section>
        <?php elseif ($_GET['page'] == 'logs'): ?>
        <section id="logs">
            <h3>Логи</h3>
            <div id="log-viewer">
                <div class="log-entry">[2025-07-27 10:00:00] [INFO] Сервер запущен</div>
                <div class="log-entry">[2025-07-27 10:05:23] [INFO] Игрок Alex подключился</div>
                <div class="log-entry warning">[2025-07-27 10:15:42] [WARN] Низкая память: 85%</div>
                <div class="log-entry">[2025-07-27 10:20:11] [INFO] Игрок Alex отключился</div>
                <div class="log-entry error">[2025-07-27 10:25:33] [ERROR] Ошибка плагина WorldEdit</div>
            </div>
        </section>
        <?php endif; ?>
    </main>
    
    <footer>
        <p>&copy; 2025 SparkPanel. Все права защищены.</p>
    </footer>
    
    <script src="assets/script.js"></script>
</body>
</html>'''