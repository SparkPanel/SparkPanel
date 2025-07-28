<?php
/**
 * API для интеграции с другими сервисами
 * 
 * Этот файл предоставляет RESTful API для взаимодействия с SparkPanel
 * из внешних приложений и сервисов.
 */

// Проверка User-Agent и API ключа для безопасности
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';

// В реальной реализации здесь будет проверка API ключа
// if (empty($apiKey) || !isValidApiKey($apiKey)) {
//     http_response_code(401);
//     echo json_encode(['error' => 'Неверный или отсутствующий API ключ']);
//     exit;
// }

header('Content-Type: application/json; charset=utf-8');

// Разрешаем CORS для API запросов
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

// Обработка preflight запросов
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Подключаем необходимые файлы
require_once '../../config/db.php';
require_once '../../app/auth.php';
require_once '../../app/server_manager.php';
require_once '../../app/monitoring.php';

// Инициализация базы данных
try {
    $db = getDBConnection();
    $auth = new Auth($db);
    $serverManager = new ServerManager($db);
    $monitor = new ServerMonitor($db);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Ошибка подключения к базе данных']);
    exit;
}

// Определяем маршрут
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = explode('/', $uri);
$endpoint = $uri[3] ?? ''; // /api/v1/{endpoint}

// Обрабатываем запрос в зависимости от метода и конечной точки
switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        handleGetRequest($endpoint, $serverManager, $monitor);
        break;
        
    case 'POST':
        handlePostRequest($endpoint, $serverManager, $auth);
        break;
        
    case 'PUT':
        handlePutRequest($endpoint, $serverManager, $auth);
        break;
        
    case 'DELETE':
        handleDeleteRequest($endpoint, $serverManager, $auth);
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Метод не разрешен']);
        break;
}

/**
 * Обработка GET запросов
 */
function handleGetRequest($endpoint, $serverManager, $monitor) {
    switch ($endpoint) {
        case 'servers':
            // Получить список серверов
            $servers = $serverManager->getServers();
            echo json_encode(['success' => true, 'data' => $servers]);
            break;
            
        case 'servers':
            if (isset($_GET['id'])) {
                // Получить информацию о конкретном сервере
                $server = $serverManager->getServer($_GET['id']);
                if ($server) {
                    echo json_encode(['success' => true, 'data' => $server]);
                } else {
                    http_response_code(404);
                    echo json_encode(['error' => 'Сервер не найден']);
                }
            } else {
                // Получить список всех серверов
                $servers = $serverManager->getServers();
                echo json_encode(['success' => true, 'data' => $servers]);
            }
            break;
            
        case 'plugins':
            if (isset($_GET['server_id'])) {
                // Получить плагины для конкретного сервера
                $plugins = $serverManager->getPlugins($_GET['server_id']);
                echo json_encode(['success' => true, 'data' => $plugins]);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Требуется параметр server_id']);
            }
            break;
            
        case 'backups':
            // Получить список резервных копий
            $backups = $serverManager->getBackups();
            echo json_encode(['success' => true, 'data' => $backups]);
            break;
            
        case 'stats':
            // Получить статистику системы
            $stats = $serverManager->getRealtimeStats();
            echo json_encode($stats);
            break;
            
        case 'metrics':
            // Получить метрики производительности
            $metricType = $_GET['type'] ?? null;
            $limit = intval($_GET['limit'] ?? 100);
            $metrics = $serverManager->getPerformanceMetrics($metricType, $limit);
            echo json_encode(['success' => true, 'data' => $metrics]);
            break;
            
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Конечная точка не найдена']);
            break;
    }
}

/**
 * Обработка POST запросов
 */
function handlePostRequest($endpoint, $serverManager, $auth) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    switch ($endpoint) {
        case 'servers':
            // Создать новый сервер
            if (!isset($input['name']) || !isset($input['ip']) || !isset($input['port'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Требуются параметры: name, ip, port']);
                return;
            }
            
            $result = $serverManager->addServer($input['name'], $input['ip'], $input['port']);
            if ($result['success']) {
                http_response_code(201);
            } else {
                http_response_code(400);
            }
            echo json_encode($result);
            break;
            
        case 'servers':
            if (isset($input['action'])) {
                switch ($input['action']) {
                    case 'start':
                        if (!isset($input['id'])) {
                            http_response_code(400);
                            echo json_encode(['error' => 'Требуется параметр id']);
                            return;
                        }
                        $result = $serverManager->startServer($input['id']);
                        echo json_encode($result);
                        break;
                        
                    case 'stop':
                        if (!isset($input['id'])) {
                            http_response_code(400);
                            echo json_encode(['error' => 'Требуется параметр id']);
                            return;
                        }
                        $result = $serverManager->stopServer($input['id']);
                        echo json_encode($result);
                        break;
                        
                    case 'restart':
                        if (!isset($input['id'])) {
                            http_response_code(400);
                            echo json_encode(['error' => 'Требуется параметр id']);
                            return;
                        }
                        // Сначала останавливаем сервер
                        $serverManager->stopServer($input['id']);
                        // Затем запускаем
                        $result = $serverManager->startServer($input['id']);
                        echo json_encode($result);
                        break;
                        
                    default:
                        http_response_code(400);
                        echo json_encode(['error' => 'Неизвестное действие']);
                        break;
                }
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Требуется параметр action']);
            }
            break;
            
        case 'plugins':
            // Добавить плагин
            if (!isset($input['server_id']) || !isset($input['name']) || !isset($input['version']) || !isset($input['author'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Требуются параметры: server_id, name, version, author']);
                return;
            }
            
            $result = $serverManager->addPlugin($input['server_id'], $input['name'], $input['version'], $input['author']);
            if ($result['success']) {
                http_response_code(201);
            } else {
                http_response_code(400);
            }
            echo json_encode($result);
            break;
            
        case 'backups':
            // Создать резервную копию
            if (!isset($input['server_id'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Требуется параметр server_id']);
                return;
            }
            
            // Добавляем задачу в очередь вместо немедленного выполнения
            $payload = [
                'server_id' => $input['server_id'],
                'user_id' => 0 // API пользователь
            ];
            $jobId = $serverManager->addBackgroundJob('backup_server', $payload, 1);
            
            if ($jobId) {
                http_response_code(202);
                echo json_encode([
                    'success' => true, 
                    'message' => 'Задача резервного копирования добавлена в очередь',
                    'job_id' => $jobId
                ]);
            } else {
                http_response_code(500);
                echo json_encode([
                    'success' => false, 
                    'message' => 'Не удалось добавить задачу в очередь'
                ]);
            }
            break;
            
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Конечная точка не найдена']);
            break;
    }
}

/**
 * Обработка PUT запросов
 */
function handlePutRequest($endpoint, $serverManager, $auth) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    switch ($endpoint) {
        case 'plugins':
            if (!isset($input['id'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Требуется параметр id']);
                return;
            }
            
            // Включить плагин
            $result = $serverManager->enablePlugin($input['id']);
            echo json_encode($result);
            break;
            
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Конечная точка не найдена']);
            break;
    }
}

/**
 * Обработка DELETE запросов
 */
function handleDeleteRequest($endpoint, $serverManager, $auth) {
    switch ($endpoint) {
        case 'servers':
            if (!isset($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Требуется параметр id']);
                return;
            }
            
            $result = $serverManager->deleteServer($_GET['id']);
            echo json_encode($result);
            break;
            
        case 'plugins':
            if (!isset($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Требуется параметр id']);
                return;
            }
            
            $result = $serverManager->deletePlugin($_GET['id']);
            echo json_encode($result);
            break;
            
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Конечная точка не найдена']);
            break;
    }
}
?>