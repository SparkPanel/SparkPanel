# Плагины SparkPanel

Плагины расширяют панель без изменения её кода: реагируют на события (запуск сервера, создание пользователя, бэкап и т.д.) и выполняют свою логику — уведомления, интеграции, журналирование.

Поддерживаемые типы:

| Тип | Файл | Как запускается |
|-----|------|-----------------|
| `javascript` | `.js`, `.mjs`, `.cjs` | внутри процесса панели (ES-модуль или CommonJS `.cjs`) |
| `typescript` | `.js` (скомпилированный) | как `javascript`; исходники `.ts` нужно предварительно собрать |
| `python` | `.py` | отдельный процесс `python3` (на Windows — `python`; в Docker-образе панели Python уже установлен) |
| `jar` | `.jar` | отдельный процесс `java -jar` (Java должна быть установлена на хосте панели) |

Путь к интерпретаторам можно задать переменными окружения `PYTHON_BIN` и `JAVA_BIN`.

## Структура

```
plugins/
  my-plugin/
    manifest.json
    index.js
```

Каталог плагинов задаётся переменной `PLUGINS_DIR` (по умолчанию `./plugins`, в Docker — том `/app/plugins`).

### manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Что делает плагин",
  "author": "Ваше имя",
  "type": "javascript",
  "enabled": false,
  "main": "index.js",
  "hooks": ["server_start", "server_stop"]
}
```

- `id` — латиница, цифры, `.`, `_`, `-` (до 100 символов), совпадает с именем папки;
- `main` — основной файл относительно папки плагина;
- `enabled` — панель сохраняет сюда состояние переключателя; включённые плагины запускаются при старте панели;
- `hooks` — справочное поле для пользователей (какие события использует плагин).

## JavaScript-плагин

```javascript
// plugins/hello-world/index.js
export async function initialize(context) {
  context.log("Hello World plugin initialized");

  context.registerHook("server_start", async (serverId, server) => {
    context.log(`Server ${server.name} (${serverId}) started`);
  });

  context.registerHook("backup_create", async (serverId, info) => {
    context.log(`Backup ${info.backupName}: ${info.backupSize} bytes`);
  });
}

// Необязательно: вызывается при отключении/удалении плагина и остановке панели.
export async function shutdown() {}

export default { initialize, shutdown };
```

`context` — API плагина:

- `context.pluginId` — идентификатор плагина;
- `context.registerHook(name, callback)` — подписка на событие (подписки автоматически снимаются при отключении плагина);
- `context.log(...args)` — запись в журнал панели с префиксом `[plugin:<id>]`.

Ошибки внутри обработчиков перехватываются и не влияют на работу панели. Если плагин не удалось запустить, причина показывается на его карточке в разделе «Plugins».

## Python и JAR плагины

Панель запускает процесс и передаёт ему события **в stdin — по одному JSON на строку**:

```json
{"hook": "server_start", "args": ["<serverId>", {"id": "...", "name": "...", "gameType": "minecraft", "nodeId": "..."}]}
```

В stdout плагин может писать строки JSON вида `{"log": "текст"}` — они попадут в журнал панели (обычные строки тоже выводятся). stderr выводится как ошибки.

```python
#!/usr/bin/env python3
import json, sys

def log(text):
    print(json.dumps({"log": text}), flush=True)

log("Python plugin started")
for line in sys.stdin:
    event = json.loads(line)
    if event["hook"] == "server_start":
        server_id, info = event["args"]
        log(f"Server {info['name']} started")
```

JAR-плагин работает так же: читает строки из `System.in`, пишет в `System.out`. Файл должен содержать `Main-Class` в манифесте.

## События (хуки)

Первый аргумент — идентификатор объекта (сервера, пользователя, плагина и т.д.), второй — объект с подробностями.

| Событие | Когда |
|---------|-------|
| `server_create`, `server_delete` | создание / удаление сервера |
| `server_start`, `server_stop`, `server_restart` | успешный запуск / остановка / перезапуск |
| `file_upload` | загрузка файла в файловом менеджере |
| `backup_create`, `backup_restore`, `backup_delete` | операции с резервными копиями |
| `port_create`, `port_delete` | дополнительные порты сервера |
| `sftp_user_create`, `sftp_user_update`, `sftp_user_delete` | SFTP-пользователи |
| `node_create`, `node_delete` | ноды |
| `user_login_attempt`, `user_logout`, `user_create`, `user_update` | пользователи (`user_login_attempt` содержит `success`) |
| `password_change`, `2fa_enable`, `2fa_disable` | безопасность учётной записи (`2fa_disable` содержит `resetBy`, если 2FA сбросил администратор) |
| `api_key_create`, `api_key_delete` | API-ключи |
| `plugin_upload`, `plugin_enable`, `plugin_disable`, `plugin_delete` | плагины |

## Загрузка

Через веб-интерфейс: «Plugins» → «Upload Plugin». Принимаются:

- одиночный файл (`.js`, `.mjs`, `.cjs`, `.ts`, `.py`, `.jar`) — манифест создаётся из полей формы;
- архив `.zip` или `.tar.gz`/`.tgz` с `manifest.json` в корне или в единственной папке верхнего уровня.

Архив проверяется на выход путей за пределы папки плагина. Максимальный размер — 100 МБ. После загрузки плагин выключен — включите его переключателем.

API: `POST /api/plugins/upload` (multipart, поле `plugin`), `POST /api/plugins/:id/enable`, `POST /api/plugins/:id/disable`, `DELETE /api/plugins/:id`.

## Безопасность

JavaScript-плагины выполняются внутри процесса панели и имеют полный доступ к Node.js; Python/JAR — к системе с правами панели. Устанавливайте только плагины из доверенных источников и проверяйте их код. Управлять плагинами может только пользователь с правом `plugins.manage`.

Пример — папка `plugins/example-plugin/`.
