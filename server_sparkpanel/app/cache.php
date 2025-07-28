<?php
/**
 * Система кэширования SparkPanel
 */

class Cache {
    private $cacheDir;
    private $defaultTTL;
    
    public function __construct($cacheDir = null, $defaultTTL = 300) {
        $this->cacheDir = $cacheDir ?: __DIR__ . '/../cache';
        $this->defaultTTL = $defaultTTL;
        
        // Создаем директорию для кэша, если она не существует
        if (!is_dir($this->cacheDir)) {
            mkdir($this->cacheDir, 0755, true);
        }
    }
    
    /**
     * Получить данные из кэша
     */
    public function get($key) {
        $cacheFile = $this->getCacheFilePath($key);
        
        // Проверяем, существует ли файл кэша
        if (!file_exists($cacheFile)) {
            return null;
        }
        
        // Проверяем, не истекло ли время жизни кэша
        if (time() - filemtime($cacheFile) > $this->defaultTTL) {
            unlink($cacheFile); // Удаляем устаревший кэш
            return null;
        }
        
        // Читаем данные из кэша
        $data = file_get_contents($cacheFile);
        return json_decode($data, true);
    }
    
    /**
     * Сохранить данные в кэш
     */
    public function set($key, $data, $ttl = null) {
        $cacheFile = $this->getCacheFilePath($key);
        $ttl = $ttl ?: $this->defaultTTL;
        
        // Сохраняем данные в кэш
        $encodedData = json_encode($data);
        file_put_contents($cacheFile, $encodedData);
        
        // Устанавливаем время жизни файла
        touch($cacheFile, time() + $ttl);
        
        return true;
    }
    
    /**
     * Удалить данные из кэша
     */
    public function delete($key) {
        $cacheFile = $this->getCacheFilePath($key);
        
        if (file_exists($cacheFile)) {
            unlink($cacheFile);
            return true;
        }
        
        return false;
    }
    
    /**
     * Очистить весь кэш
     */
    public function clear() {
        $files = glob($this->cacheDir . '/*');
        foreach ($files as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
        
        return true;
    }
    
    /**
     * Получить путь к файлу кэша
     */
    private function getCacheFilePath($key) {
        $filename = md5($key) . '.cache';
        return $this->cacheDir . '/' . $filename;
    }
    
    /**
     * Получить статистику использования кэша
     */
    public function getStats() {
        $files = glob($this->cacheDir . '/*');
        $totalSize = 0;
        $fileCount = 0;
        
        foreach ($files as $file) {
            if (is_file($file)) {
                $totalSize += filesize($file);
                $fileCount++;
            }
        }
        
        return [
            'file_count' => $fileCount,
            'total_size' => $totalSize,
            'cache_dir' => $this->cacheDir
        ];
    }
}