<?php
// Проверка User-Agent для безопасности
$userAgent = $_SERVER['HTTP_USER_AGENT'];
if (!str_contains($userAgent, 'PooClient')) {
    http_response_code(403);
    echo "Access denied.";
    exit;
}

// Подключаем необходимые файлы
require_once '../config/db.php';
require_once '../app/auth.php';

// Инициализация базы данных
try {
    $db = getDBConnection();
    $auth = new Auth($db);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Ошибка подключения к базе данных']);
    exit;
}

// Обработка POST запроса на вход
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';
    $twofa_code = $_POST['twofa_code'] ?? '';
    
    if (empty($username) || empty($password)) {
        echo json_encode(['success' => false, 'message' => 'Заполните все поля']);
        exit;
    }
    
    // Попытка входа
    $result = $auth->login($username, $password, $twofa_code);
    echo json_encode($result);
    exit;
}

// Если это не POST запрос, возвращаем ошибку
echo json_encode(['success' => false, 'message' => 'Неверный метод запроса']);
?>