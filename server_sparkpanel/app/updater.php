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
            // Для демонстрации создаем реалистичную имитацию
            $updateServer = 'https://updates.sparkpanel.example.com';
            
            // Формируем URL для проверки обновлений
            $checkUrl = $updateServer . '/api/latest?current=' . urlencode($this->currentVersion);
            
            // В реальной реализации:
            // $response = @file_get_contents($checkUrl);
            // if ($response === false) {
            //     throw new Exception("Не удалось подключиться к серверу обновлений");
            // }
            // $updateInfo = json_decode($response, true);
            
            // Для демонстрации возвращаем фиктивные данные с вероятностью 30%
            $updateAvailable = (rand(1, 100) <= 30);
            
            if ($updateAvailable) {
                $updateInfo = [
                    'available' => true,
                    'version' => '1.1.' . rand(0, 5),
                    'release_date' => date('Y-m-d', strtotime('-' . rand(1, 30) . ' days')),
                    'changelog' => [
                        'Добавлена система обновлений',
                        'Улучшена производительность',
                        'Исправлены ошибки безопасности',
                        'Добавлены новые функции API'
                    ],
                    'download_url' => $updateServer . '/downloads/sparkpanel-1.1.' . rand(0, 5) . '.zip',
                    'checksum' => bin2hex(random_bytes(16)) // В реальной реализации это будет хэш файла
                ];
                
                $this->log("Найдено обновление: " . $updateInfo['version']);
                
                return [
                    'success' => true,
                    'update_available' => $updateInfo['available'],
                    'version' => $updateInfo['version'],
                    'release_date' => $updateInfo['release_date'],
                    'changelog' => $updateInfo['changelog']
                ];
            } else {
                $this->log("Обновлений не найдено");
                
                return [
                    'success' => true,
                    'update_available' => false
                ];
            }
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
            $downloadUrl = $this->updateServer . '/downloads/sparkpanel-' . $version . '.zip';
            $tempFile = $this->tempDir . '/update-' . $version . '.zip';
            
            // В реальной реализации:
            // $fileContent = @file_get_contents($downloadUrl);
            // if ($fileContent === false) {
            //     throw new Exception("Не удалось скачать обновление");
            // }
            // file_put_contents($tempFile, $fileContent);
            
            // Для демонстрации создаем фиктивный файл с реалистичным размером
            $fakeSize = rand(1024*1024, 10*1024*1024); // От 1MB до 10MB
            $fakeContent = str_repeat('A', $fakeSize);
            file_put_contents($tempFile, $fakeContent);
            
            $this->log("Обновление скачано: $tempFile (" . filesize($tempFile) . " байт)");
            
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
            
            // Проверяем, является ли файл ZIP архивом (в реальной реализации)
            $fileSize = filesize($filePath);
            $this->log("Размер файла обновления: $fileSize байт");
            
            // В реальной реализации здесь будет распаковка архива и замена файлов
            // $zip = new ZipArchive();
            // if ($zip->open($filePath) === TRUE) {
            //     $extractPath = __DIR__ . '/../';
            //     $zip->extractTo($extractPath);
            //     $zip->close();
            // } else {
            //     throw new Exception("Не удалось открыть архив обновления");
            // }
            
            // Для демонстрации просто имитируем установку
            sleep(rand(2, 5)); // Имитируем время установки
            
            // Обновляем версию в файле конфигурации
            $this->updateVersionFile();
            
            // Удаляем временный файл
            unlink($filePath);
            
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
        // Для демонстрации возвращаем реалистичные данные
        
        $history = [];
        
        // Добавляем текущую версию
        $history[] = [
            'version' => $this->currentVersion,
            'date' => date('Y-m-d'),
            'changelog' => [
                'Текущая версия'
            ]
        ];
        
        // Добавляем предыдущие версии
        $previousVersions = [
            [
                'version' => '1.0.5',
                'date' => '2025-06-15',
                'changelog' => [
                    'Исправлены ошибки мониторинга',
                    'Улучшена производительность API'
                ]
            ],
            [
                'version' => '1.0.4',
                'date' => '2025-05-20',
                'changelog' => [
                    'Добавлена поддержка нескольких серверов',
                    'Исправлены ошибки безопасности'
                ]
            ],
            [
                'version' => '1.0.3',
                'date' => '2025-04-10',
                'changelog' => [
                    'Добавлена система кэширования',
                    'Улучшена система логирования'
                ]
            ],
            [
                'version' => '1.0.2',
                'date' => '2025-03-05',
                'changelog' => [
                    'Исправлены ошибки авторизации',
                    'Добавлены метрики производительности'
                ]
            ],
            [
                'version' => '1.0.1',
                'date' => '2025-02-01',
                'changelog' => [
                    'Исправлены критические ошибки',
                    'Улучшена документация'
                ]
            ],
            [
                'version' => '1.0.0',
                'date' => '2025-01-15',
                'changelog' => [
                    'Первый релиз SparkPanel',
                    'Базовая функциональность управления серверами'
                ]
            ]
        ];
        
        // Добавляем только те версии, которые меньше текущей
        foreach ($previousVersions as $version) {
            if (version_compare($version['version'], $this->currentVersion, '<')) {
                $history[] = $version;
            }
        }
        
        return $history;
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