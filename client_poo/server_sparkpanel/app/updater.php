<?php
/**
 * Система обновлений SparkPanel
 * 
 * Этот файл предоставляет функциональность для проверки и установки обновлений панели.
 */

class Updater {
    private $currentVersion;
    private $updateServer;
    private $tempDir;
    private $logFile;
    
    public function __construct($currentVersion = '1.0.0') {
        $this->currentVersion = $currentVersion;
        $this->updateServer = 'https://github.com/SparkPanel/SparkPanel'; // В реальной реализации заменить на реальный сервер
        $this->tempDir = __DIR__ . '/../tmp';
        $this->logFile = __DIR__ . '/../logs/update.log';
        
        // Создаем директории, если они не существуют
        if (!is_dir($this->tempDir)) {
            mkdir($this->tempDir, 0755, true);
        }
        
        if (!is_dir(dirname($this->logFile))) {
            mkdir(dirname($this->logFile), 0755, true);
        }
    }
    
    /**
     * Проверить наличие обновлений
     */
    public function checkForUpdates() {
        try {
            $this->log("Проверка обновлений...");
            
            // В реальной реализации здесь будет запрос к серверу обновлений
            // $response = file_get_contents($this->updateServer . '/api/latest?current=' . $this->currentVersion);
            // $updateInfo = json_decode($response, true);
            
            // Для демонстрации возвращаем фиктивные данные
            $updateInfo = [
                'available' => true,
                'version' => '1.1.0',
                'release_date' => date('Y-m-d'),
                'changelog' => [
                    'Добавлена система обновлений',
                    'Улучшена производительность',
                    'Исправлены ошибки безопасности'
                ],
                'download_url' => $this->updateServer . '/downloads/sparkpanel-1.1.0.zip',
                'checksum' => 'abc123def456' // В реальной реализации это будет хэш файла
            ];
            
            $this->log("Проверка обновлений завершена");
            
            return [
                'success' => true,
                'update_available' => $updateInfo['available'],
                'version' => $updateInfo['version'],
                'release_date' => $updateInfo['release_date'],
                'changelog' => $updateInfo['changelog']
            ];
        } catch (Exception $e) {
            $this->log("Ошибка проверки обновлений: " . $e->getMessage());
            return [
                'success' => false,
                'message' => 'Ошибка проверки обновлений: ' . $e->getMessage()
            ];
        }
    }
    
    /**
     * Скачать обновление
     */
    public function downloadUpdate($version) {
        try {
            $this->log("Скачивание обновления v$version...");
            
            // В реальной реализации здесь будет скачивание файла обновления
            // $downloadUrl = $this->updateServer . '/downloads/sparkpanel-' . $version . '.zip';
            // $tempFile = $this->tempDir . '/update-' . $version . '.zip';
            // file_put_contents($tempFile, file_get_contents($downloadUrl));
            
            // Для демонстрации создаем фиктивный файл
            $tempFile = $this->tempDir . '/update-' . $version . '.zip';
            file_put_contents($tempFile, "Фиктивный файл обновления v$version");
            
            $this->log("Обновление скачано: $tempFile");
            
            return [
                'success' => true,
                'file_path' => $tempFile
            ];
        } catch (Exception $e) {
            $this->log("Ошибка скачивания обновления: " . $e->getMessage());
            return [
                'success' => false,
                'message' => 'Ошибка скачивания обновления: ' . $e->getMessage()
            ];
        }
    }
    
    /**
     * Установить обновление
     */
    public function installUpdate($filePath) {
        try {
            $this->log("Установка обновления из $filePath...");
            
            // Проверяем, существует ли файл
            if (!file_exists($filePath)) {
                throw new Exception("Файл обновления не найден: $filePath");
            }
            
            // В реальной реализации здесь будет распаковка архива и замена файлов
            // $zip = new ZipArchive();
            // if ($zip->open($filePath) === TRUE) {
            //     $zip->extractTo(__DIR__ . '/../');
            //     $zip->close();
            // } else {
            //     throw new Exception("Не удалось открыть архив обновления");
            // }
            
            // Для демонстрации просто имитируем установку
            sleep(3); // Имитируем время установки
            
            // Обновляем версию в файле конфигурации
            // $this->updateVersionFile();
            
            $this->log("Обновление успешно установлено");
            
            return [
                'success' => true,
                'message' => 'Обновление успешно установлено'
            ];
        } catch (Exception $e) {
            $this->log("Ошибка установки обновления: " . $e->getMessage());
            return [
                'success' => false,
                'message' => 'Ошибка установки обновления: ' . $e->getMessage()
            ];
        }
    }
    
    /**
     * Получить текущую версию
     */
    public function getCurrentVersion() {
        return $this->currentVersion;
    }
    
    /**
     * Получить историю обновлений
     */
    public function getUpdateHistory() {
        // В реальной реализации здесь будет получение истории обновлений из БД или файла
        return [
            [
                'version' => '1.0.0',
                'date' => '2025-01-15',
                'changelog' => [
                    'Первый релиз SparkPanel',
                    'Базовая функциональность управления серверами'
                ]
            ],
            [
                'version' => '1.0.1',
                'date' => '2025-02-01',
                'changelog' => [
                    'Исправлены ошибки авторизации',
                    'Добавлены метрики производительности'
                ]
            ]
        ];
    }
    
    /**
     * Обновить файл версии
     */
    private function updateVersionFile() {
        // В реальной реализации здесь будет обновление файла с версией
        $versionFile = __DIR__ . '/../config/version.php';
        $content = "<?php\n// Версия SparkPanel\nreturn '" . $this->currentVersion . "';\n";
        file_put_contents($versionFile, $content);
    }
    
    /**
     * Записать сообщение в лог
     */
    private function log($message) {
        $timestamp = date('Y-m-d H:i:s');
        $logMessage = "[$timestamp] $message\n";
        file_put_contents($this->logFile, $logMessage, FILE_APPEND | LOCK_EX);
    }
    
    /**
     * Очистить временные файлы
     */
    public function cleanup() {
        $this->log("Очистка временных файлов...");
        
        // Удаляем временные файлы обновлений
        $files = glob($this->tempDir . '/update-*');
        foreach ($files as $file) {
            unlink($file);
        }
        
        $this->log("Очистка завершена");
    }
}
?>