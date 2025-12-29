# Документация по плагинам для SparkPanel v1.3

## Обзор

Система плагинов позволяет расширять функциональность SparkPanel без изменения основного кода. Плагины могут быть написаны на JavaScript/TypeScript, Python или Java (JAR).

## Поддерживаемые типы плагинов

1. **JavaScript/TypeScript** (`.js`, `.ts`) - рекомендуемый тип для большинства плагинов
2. **Python** (`.py`) - требует установленный Python3
3. **Java** (`.jar`) - требует установленную Java

## Структура плагина

Каждый плагин должен находиться в отдельной папке внутри директории `plugins/`:

```
plugins/
  my-plugin/
    manifest.json      # Обязательный файл с метаданными
    index.js          # Основной файл плагина (зависит от типа)
```

## Манифест плагина (manifest.json)

Обязательный файл с информацией о плагине:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Описание функциональности плагина",
  "author": "Ваше имя",
  "type": "javascript",
  "enabled": false,
  "main": "index.js",
  "hooks": ["server_start", "server_stop"]
}
```

### Поля манифеста:

- **id** (string) - уникальный идентификатор плагина (только латиница, без пробелов)
- **name** (string) - отображаемое имя плагина
- **version** (string) - версия плагина (например, "1.0.0")
- **description** (string) - описание функциональности
- **author** (string) - имя автора
- **type** (string) - тип плагина: `"javascript"`, `"typescript"`, `"python"` или `"jar"`
- **enabled** (boolean) - включен ли плагин (по умолчанию `false`)
- **main** (string) - имя основного файла (например, `"index.js"`)
- **hooks** (array, опционально) - список хуков, которые использует плагин

## Создание плагина на JavaScript/TypeScript

### Пример простого плагина:

**plugins/hello-world/manifest.json:**
```json
{
  "id": "hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "Простой плагин для демонстрации",
  "author": "Your Name",
  "type": "javascript",
  "enabled": false,
  "main": "index.js"
}
```

**plugins/hello-world/index.js:**
```javascript
/**
 * Инициализация плагина
 * @param {PluginManager} pluginManager - Менеджер плагинов
 */
async function initialize(pluginManager) {
  console.log("Hello World plugin initialized!");
  
  // Регистрируем хук для события запуска сервера
  pluginManager.registerHook("server_start", async (serverId, serverInfo) => {
    console.log(`Server ${serverId} started!`, serverInfo);
    // Ваш код здесь
  }, "hello-world");
  
  // Регистрируем хук для события остановки сервера
  pluginManager.registerHook("server_stop", async (serverId) => {
    console.log(`Server ${serverId} stopped!`);
    // Ваш код здесь
  }, "hello-world");
}

// Экспортируем функцию initialize
module.exports = {
  default: { initialize }
};
```

### Доступные хуки (события):

Плагины могут регистрироваться на следующие события:

- **`server_start`** - вызывается при запуске сервера
  - Параметры: `serverId` (string), `serverInfo` (object)
  
- **`server_stop`** - вызывается при остановке сервера
  - Параметры: `serverId` (string)
  
- **`server_restart`** - вызывается при перезапуске сервера
  - Параметры: `serverId` (string)
  
- **`server_create`** - вызывается при создании нового сервера
  - Параметры: `server` (object) - информация о сервере
  
- **`server_delete`** - вызывается при удалении сервера
  - Параметры: `serverId` (string)

### Пример использования хуков:

```javascript
async function initialize(pluginManager) {
  // Регистрируем обработчик запуска сервера
  pluginManager.registerHook("server_start", async (serverId, serverInfo) => {
    console.log(`[My Plugin] Server ${serverId} started`);
    console.log(`[My Plugin] Server info:`, serverInfo);
    
    // Можно выполнить дополнительные действия
    // Например, отправить уведомление, обновить статистику и т.д.
  }, "my-plugin-id");
  
  // Регистрируем обработчик остановки сервера
  pluginManager.registerHook("server_stop", async (serverId) => {
    console.log(`[My Plugin] Server ${serverId} stopped`);
  }, "my-plugin-id");
}
```

## Создание плагина на Python

**plugins/python-example/manifest.json:**
```json
{
  "id": "python-example",
  "name": "Python Example",
  "version": "1.0.0",
  "description": "Пример Python плагина",
  "author": "Your Name",
  "type": "python",
  "enabled": false,
  "main": "main.py"
}
```

**plugins/python-example/main.py:**
```python
#!/usr/bin/env python3
import sys
import json

# Плагин будет запущен как отдельный процесс
# Можете читать из stdin или использовать другие методы коммуникации

print("Python plugin started", file=sys.stderr)

# Простой пример - плагин работает в фоне
while True:
    try:
        line = input()
        if line:
            # Обработка входных данных
            data = json.loads(line)
            print(f"Received: {data}", file=sys.stderr)
    except EOFError:
        break
    except KeyboardInterrupt:
        break

print("Python plugin stopped", file=sys.stderr)
```

**Примечание:** Python плагины запускаются как отдельные процессы. Для взаимодействия с панелью нужно использовать стандартные потоки ввода/вывода или другие механизмы межпроцессного взаимодействия.

## Создание плагина на Java (JAR)

**plugins/java-example/manifest.json:**
```json
{
  "id": "java-example",
  "name": "Java Example",
  "version": "1.0.0",
  "description": "Пример Java плагина",
  "author": "Your Name",
  "type": "jar",
  "enabled": false,
  "main": "plugin.jar"
}
```

**Примечание:** JAR плагины должны быть скомпилированы с правильным `Main-Class` в манифесте. Они запускаются как: `java -jar plugin.jar`

## Загрузка плагинов

### Через веб-интерфейс:

1. Откройте панель SparkPanel
2. Перейдите в раздел "Plugins"
3. Нажмите кнопку "Upload Plugin"
4. Выберите файл плагина (`.js`, `.ts`, `.py`, `.jar`)
5. Заполните информацию:
   - Plugin ID (уникальный идентификатор)
   - Name (отображаемое имя)
   - Version
   - Author
   - Description
   - Type (автоматически определяется по расширению)
6. Нажмите "Upload"

### Включение/отключение плагинов:

- Используйте переключатель на карточке плагина
- Или через API: `POST /api/plugins/:id/enable` или `/disable`

## Безопасность

⚠️ **Важно:**

1. **Плагины выполняются с правами сервера** - убедитесь, что доверяете источнику плагина
2. **Проверяйте код плагинов** перед загрузкой на production сервер
3. **JavaScript плагины** имеют полный доступ к Node.js API и могут выполнять любые операции
4. **Python/JAR плагины** запускаются как отдельные процессы, но также имеют доступ к системе

### Рекомендации по безопасности:

- Загружайте плагины только из проверенных источников
- Просматривайте исходный код перед загрузкой
- Тестируйте плагины на тестовом сервере перед production
- Регулярно обновляйте плагины

## Разработка плагинов

### Локальная разработка:

1. Создайте папку для плагина в `plugins/`
2. Создайте `manifest.json` с необходимыми полями
3. Напишите код плагина
4. Протестируйте локально (плагин будет автоматически загружен при следующем запуске панели)
5. Создайте архив для распространения (если нужно)

### Отладка:

- Используйте `console.log()` для вывода отладочной информации
- Логи JavaScript плагинов будут видны в логах сервера
- Логи Python/JAR плагинов можно просматривать через `stderr`

## Примеры плагинов

### Плагин уведомлений при запуске сервера:

```javascript
async function initialize(pluginManager) {
  pluginManager.registerHook("server_start", async (serverId, serverInfo) => {
    // Отправляем уведомление (пример)
    console.log(`[Notifications] Server ${serverInfo.name} (${serverId}) has started!`);
    // Здесь можно добавить отправку email, webhook, Discord и т.д.
  }, "server-notifications");
}
```

### Плагин логирования действий:

```javascript
async function initialize(pluginManager) {
  const fs = require('fs').promises;
  const path = require('path');
  
  const logFile = path.join(__dirname, 'activity.log');
  
  pluginManager.registerHook("server_start", async (serverId, serverInfo) => {
    const logEntry = `${new Date().toISOString()} - Server started: ${serverId}\n`;
    await fs.appendFile(logFile, logEntry);
  }, "activity-logger");
  
  pluginManager.registerHook("server_stop", async (serverId) => {
    const logEntry = `${new Date().toISOString()} - Server stopped: ${serverId}\n`;
    await fs.appendFile(logFile, logEntry);
  }, "activity-logger");
}
```

## API для разработчиков плагинов

Плагины имеют доступ к объекту `pluginManager`, который предоставляет следующие методы:

- `registerHook(hookName, callback, pluginId)` - регистрация обработчика события
- `callHook(hookName, ...args)` - вызов хука (для взаимодействия между плагинами)
- `getAllPlugins()` - получить список всех плагинов (асинхронно)

## Ограничения

- Максимальный размер файла плагина: 100MB
- JavaScript плагины выполняются в контексте Node.js сервера
- Python плагины требуют Python3
- JAR плагины требуют Java (JDK или JRE)

## Поддержка

Если у вас есть вопросы по разработке плагинов:

1. Проверьте примеры плагинов в документации
2. Изучите исходный код `server/plugins/plugin-manager.ts`
3. Создайте issue на GitHub с описанием проблемы

## Лицензия

Плагины могут использовать любую лицензию. SparkPanel не накладывает ограничений на лицензирование плагинов.

