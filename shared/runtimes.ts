/**
 * Каталог сред для серверов типа "custom": какой Docker-образ скачать и какой командой запускать по умолчанию.
 * Команду пользователь может поменять в настройках сервера; рабочая папка — /data (файлы сервера),
 * порт сервера доступен в переменной SERVER_PORT.
 */
export interface RuntimeVersion {
  label: string;
  image: string;
  /** Предварительная сборка (preview/RC): в списке есть, но по умолчанию не выбирается. */
  prerelease?: boolean;
}

/**
 * Откуда брать список версий: теги образа в реестре, подходящие под шаблон.
 * {tag} — тег целиком, {v} — первая группа шаблона (номер версии).
 */
export interface RuntimeVersionSource {
  registry: "docker" | "mcr";
  repository: string;
  tagPattern: string;
  label: string;
  image: string;
}

export interface RuntimeDefinition {
  id: string;
  name: string;
  description: string;
  /** Запасной список на случай, если реестр недоступен. Актуальный загружается из sources. */
  versions: RuntimeVersion[];
  sources: RuntimeVersionSource[];
  /** Команда запуска по умолчанию; у Java её нет — запуск собирается из настроек JAR и памяти. */
  defaultCommand?: string;
}

export const RUNTIMES: RuntimeDefinition[] = [
  {
    id: "java",
    name: "Java (JAR)",
    description: "Runs a JAR file: Minecraft cores, proxies, any Java application",
    sources: [{ registry: "docker", repository: "library/eclipse-temurin", tagPattern: "^(\\d+)-jre$", label: "Java {v}", image: "eclipse-temurin:{tag}" }],
    versions: [
      { label: "Java 25", image: "eclipse-temurin:25-jre" },
      { label: "Java 21", image: "eclipse-temurin:21-jre" },
      { label: "Java 17", image: "eclipse-temurin:17-jre" },
      { label: "Java 11", image: "eclipse-temurin:11-jre" },
      { label: "Java 8", image: "eclipse-temurin:8-jre" },
    ],
  },
  {
    id: "python",
    name: "Python",
    description: "Bots (Telegram, Discord), scripts, web apps",
    sources: [{ registry: "docker", repository: "library/python", tagPattern: "^(\\d+\\.\\d+)-slim$", label: "Python {v}", image: "python:{tag}" }],
    versions: [
      { label: "Python 3.13", image: "python:3.13-slim" },
      { label: "Python 3.12", image: "python:3.12-slim" },
      { label: "Python 3.11", image: "python:3.11-slim" },
    ],
    defaultCommand: "if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi && python main.py",
  },
  {
    id: "node",
    name: "Node.js",
    description: "Bots, web servers and APIs in JavaScript/TypeScript",
    sources: [{ registry: "docker", repository: "library/node", tagPattern: "^(\\d+)-alpine$", label: "Node.js {v}", image: "node:{tag}" }],
    versions: [
      { label: "Node.js 24", image: "node:24-alpine" },
      { label: "Node.js 22", image: "node:22-alpine" },
      { label: "Node.js 20", image: "node:20-alpine" },
    ],
    defaultCommand: "if [ -f package.json ]; then npm install --omit=dev; fi && node index.js",
  },
  {
    id: "php",
    name: "PHP",
    description: "PHP website on the built-in PHP web server",
    sources: [{ registry: "docker", repository: "library/php", tagPattern: "^(\\d+\\.\\d+)-cli$", label: "PHP {v}", image: "php:{tag}" }],
    versions: [
      { label: "PHP 8.4", image: "php:8.4-cli" },
      { label: "PHP 8.3", image: "php:8.3-cli" },
    ],
    defaultCommand: "php -S 0.0.0.0:$SERVER_PORT -t /data",
  },
  {
    id: "static",
    name: "Static website",
    description: "HTML/CSS/JS served by nginx, index.html in the server folder root",
    sources: [{ registry: "docker", repository: "library/nginx", tagPattern: "^(\\d+\\.\\d+)-alpine$", label: "nginx {v}", image: "nginx:{tag}" }],
    versions: [{ label: "nginx (stable)", image: "nginx:stable-alpine" }],
    defaultCommand:
      "printf 'server { listen %s; root /data; index index.html; location / { try_files $uri $uri/ =404; } }\\n' \"$SERVER_PORT\" > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'",
  },
  {
    id: "go",
    name: "Go",
    description: "Builds and runs the Go module from the server folder",
    sources: [{ registry: "docker", repository: "library/golang", tagPattern: "^(\\d+\\.\\d+)$", label: "Go {v}", image: "golang:{tag}" }],
    versions: [
      { label: "Go 1.25", image: "golang:1.25" },
      { label: "Go 1.24", image: "golang:1.24" },
    ],
    defaultCommand: "go run .",
  },
  {
    id: "dotnet",
    name: ".NET",
    description: "Built .NET and ASP.NET Core apps (compiled DLL)",
    sources: [{ registry: "mcr", repository: "dotnet/aspnet", tagPattern: "^(\\d+\\.\\d+)$", label: ".NET {v}", image: "mcr.microsoft.com/dotnet/aspnet:{tag}" }],
    versions: [
      { label: ".NET 10.0", image: "mcr.microsoft.com/dotnet/aspnet:10.0" },
      { label: ".NET 8.0", image: "mcr.microsoft.com/dotnet/aspnet:8.0" },
    ],
    defaultCommand: "dotnet App.dll",
  },
  {
    id: "linux",
    name: "Linux",
    description: "Clean system that runs your start.sh script",
    sources: [
      { registry: "docker", repository: "library/ubuntu", tagPattern: "^(\\d{2}\\.\\d{2})$", label: "Ubuntu {v}", image: "ubuntu:{tag}" },
      { registry: "docker", repository: "library/debian", tagPattern: "^(\\d+)-slim$", label: "Debian {v}", image: "debian:{tag}" },
    ],
    versions: [
      { label: "Ubuntu 24.04", image: "ubuntu:24.04" },
      { label: "Debian 12", image: "debian:12-slim" },
    ],
    defaultCommand: "bash start.sh",
  },
];

export function findRuntime(id?: string): RuntimeDefinition | undefined {
  return RUNTIMES.find((r) => r.id === id);
}
