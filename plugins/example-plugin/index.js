/**
 * Пример плагина для SparkPanel
 * Демонстрирует использование системы хуков
 */

/**
 * Инициализация плагина
 * @param {PluginManager} pluginManager - Менеджер плагинов
 */
async function initialize(pluginManager) {
  console.log("[Example Plugin] Plugin initialized!");
  
  // Регистрируем обработчик запуска сервера
  pluginManager.registerHook("server_start", async (serverId, serverInfo) => {
    console.log(`[Example Plugin] Server ${serverId} started!`);
    console.log(`[Example Plugin] Server name: ${serverInfo?.name || 'Unknown'}`);
    
    // Здесь можно добавить свою логику:
    // - Отправка уведомлений
    // - Логирование
    // - Обновление статистики
    // - Интеграция с внешними сервисами
  }, "example-plugin");
  
  // Регистрируем обработчик остановки сервера
  pluginManager.registerHook("server_stop", async (serverId) => {
    console.log(`[Example Plugin] Server ${serverId} stopped!`);
    
    // Здесь можно добавить свою логику:
    // - Очистка ресурсов
    // - Отправка уведомлений
    // - Логирование
  }, "example-plugin");
  
  // Регистрируем обработчик перезапуска сервера
  pluginManager.registerHook("server_restart", async (serverId) => {
    console.log(`[Example Plugin] Server ${serverId} restarted!`);
  }, "example-plugin");
}

// Экспортируем функцию initialize для Node.js
module.exports = {
  default: { initialize }
};

