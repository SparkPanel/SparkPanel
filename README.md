[![i-1-png-(1).png](https://i.postimg.cc/htcDhVpt/i-1-png-(1).png)](https://postimg.cc/0bXRBMTT)

# SparkPanel

**Панель управления игровыми серверами**

**Версия: 1.3**

## Плагины

SparkPanel поддерживает систему плагинов для расширения функциональности. Пользователи могут создавать и загружать собственные плагины через веб-интерфейс.

**Поддерживаемые типы плагинов:**
- JavaScript/TypeScript (`.js`, `.ts`)
- Python (`.py`)
- Java (`.jar`)

**Документация:** См. `PLUGINS_README.md` для подробной документации по созданию плагинов.

**Примеры плагинов:** См. папку `plugins/example-plugin/` для примера.

## Overview

SparkPanel is a professional game server management platform that enables users to manage Docker-based game servers through a modern web interface. The application provides real-time monitoring, console access, file management, and resource control for multiple game server types including Minecraft, CS:GO, Rust, ARK, Valheim, Terraria, and Garry's Mod.

The system follows a three-tier architecture with a React frontend, Express backend, and PostgreSQL database, designed for operational efficiency and information density in managing containerized game servers.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript, built using Vite for fast development and optimized production builds.

**UI Component System**: shadcn/ui component library (New York style variant) built on Radix UI primitives. This provides:
- Accessible, headless components with full keyboard navigation
- Consistent design system through Tailwind CSS with custom theming
- Material Design-inspired approach optimized for data-heavy applications

**State Management**: 
- TanStack Query (React Query) for server state management with automatic caching and refetching
- React hooks for local component state
- Session-based authentication state

**Routing**: Wouter for lightweight, hook-based client-side routing

**Key Features**:
- Real-time server statistics with polling (3-5 second intervals)
- WebSocket-based console streaming for live log output
- Responsive sidebar navigation with mobile sheet drawer
- Dark/light theme support through CSS variables
- Form validation using react-hook-form with Zod schemas

### Backend Architecture

**Framework**: Express.js with TypeScript running on Node.js

**API Design**: RESTful JSON API with session-based authentication. Key endpoints:
- `/api/auth/*` - Authentication (login, logout, password management)
- `/api/servers/*` - Server CRUD and control operations
- `/api/nodes/*` - Node management
- `/api/stats/*` - Real-time statistics

**Docker Integration**: Uses Dockerode library to communicate with Docker Engine. Supports:
- **Local Docker**: Unix socket (`/var/run/docker.sock`) for local connections
- **Remote Docker Nodes**: HTTP/HTTPS connections to remote Docker daemons (ports 2375/2376)
- Container lifecycle management (start, stop, restart) on specified nodes
- **Real-time statistics collection**: CPU, memory, network metrics from Docker stats API
- **Console log streaming**: Real-time log streaming via container attach API
- **File system operations**: File listing and management through container exec
- **Multi-node support**: Manage containers across multiple Docker nodes

**Session Management**: 
- express-session middleware with in-memory store (memorystore)
- HTTP-only cookies with secure flag and SameSite=none for cross-origin support
- 7-day session duration

**Storage Layer**: Abstract storage interface (`IStorage`) with in-memory implementation (`MemStorage`). Designed for future database integration while maintaining testability and flexibility. Current implementation:
- In-memory Maps for users, servers, nodes
- Separate statistics cache for real-time metrics
- Default admin user (username: adplayer, password: 0000)

**Real-time Communication**: 
- WebSocket server with session authentication for console streaming
- Real-time log streaming directly from Docker containers via attach API
- Multiple clients can subscribe to server logs simultaneously
- Automatic log stream management (start/stop based on subscriptions)

### Data Storage Solutions

**Database**: PostgreSQL configured through Drizzle ORM
- Schema defined in `shared/schema.ts` using drizzle-orm/pg-core
- Neon serverless PostgreSQL client (@neondatabase/serverless)
- Type-safe schema with Zod validation

**Schema Design**:
- `users` table: Authentication and user management
- `nodes` table: Physical/virtual server infrastructure
- `servers` table: Game server instances with configuration (linked to nodes, includes Docker container IDs, resource limits, game type)

**Migration Strategy**: Drizzle Kit for schema migrations with `drizzle-kit push` command

**Current Implementation Note**: While database schema is defined, the application currently uses in-memory storage (`MemStorage`) as the active implementation. This allows for rapid development and testing while maintaining a clear path to database integration.

### Authentication and Authorization

**Authentication Method**: Session-based with bcrypt password hashing
- Password hashing using bcryptjs (10 salt rounds)
- Session cookies stored with HTTP-only, secure, and SameSite flags
- Authentication middleware (`requireAuth`) protects all API routes except auth endpoints

**User Management**:
- Single-user system (designed for self-hosted deployments)
- Password change functionality with current password verification
- Default credentials for initial setup

**Security Considerations**:
- Mandatory rate limiting for login attempts (5 / 15 min per IP) and console commands (30 / min per IP)
- Strict input validation: UUID checks, command sanitization, path whitelisting, HTML escaping
- SESSION_SECRET environment variable for production (auto-generated fallback only in development)
- Secure cookies required (HTTPS) with configurable `FORCE_HTTPS`
- Cross-origin cookie support for cross-domain development environments
- WebSocket session verification with the same middleware as HTTP routes

## External Dependencies

### Third-Party Services

**Neon Database**: Serverless PostgreSQL hosting
- Connection via DATABASE_URL environment variable
- Used through @neondatabase/serverless client
- WebSocket-based connection pooling

**Docker Engine**: Core infrastructure dependency
- Requires Docker daemon running on host
- Accessed via Unix socket at `/var/run/docker.sock`
- Container orchestration and lifecycle management

### Key Libraries

**Frontend**:
- Radix UI: Accessible component primitives (22+ components)
- TanStack Query: Server state management and caching
- Tailwind CSS: Utility-first styling
- Wouter: Lightweight routing
- Zod: Schema validation

**Backend**:
- Dockerode: Docker Engine API client
- Drizzle ORM: Type-safe database toolkit
- bcryptjs: Password hashing
- express-session: Session management
- ws (WebSocket): Real-time communication

**Development**:
- Vite: Build tool and dev server
- TypeScript: Type safety across full stack
- ESBuild: Production bundling for server code

### Environment Configuration

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string (optional, uses in-memory storage by default)
- `SESSION_SECRET`: Secret key for session encryption (REQUIRED in production; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` )
- `NODE_ENV`: Environment mode (development/production)
- `FORCE_HTTPS`: Set to `"true"` if using HTTPS via reverse proxy (optional, defaults to `false`)
- `PORT`: Server port (optional, defaults to `5000`)

Optional environment variables for hardened deployments:
- `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` / `LOGIN_RATE_LIMIT_WINDOW_MS`
- `COMMAND_RATE_LIMIT_MAX_ATTEMPTS` / `COMMAND_RATE_LIMIT_WINDOW_MS`

### Build and Deployment

**Development**: Vite dev server with HMR, running Express backend via tsx
**Production**: 
- Frontend: Vite build to `dist/public`
- Backend: ESBuild bundle to `dist/index.js`
- Single Node.js process serves both static files and API

## Installation Guide

SparkPanel is a professional game server management platform for Docker-based servers.

## Requirements

- **Operating System**: Linux (Ubuntu 20.04+ recommended)
- **Docker**: Version 20.10 or higher
- **Node.js**: Version 18 or higher
- **NPM**: Version 8 or higher
- **PostgreSQL**: Version 14 or higher (optional, uses in-memory storage by default)

## Installation from GitHub

### 0. Install Prerequisites on Ubuntu

First, update your system and install required dependencies:

```bash
# Update package list
sudo apt update

# Install build essentials (required for native modules)
sudo apt install -y build-essential curl git

# Install Node.js 18.x (using NodeSource repository)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js and NPM installation
node --version  # Should be 18.x or higher
npm --version   # Should be 8.x or higher

# Install Docker
sudo apt install -y ca-certificates gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start and enable Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Verify Docker installation
docker --version  # Should be 20.10 or higher
sudo systemctl status docker

# (Optional) Install PostgreSQL if you want to use database instead of in-memory storage
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 1. Check Prerequisites

Verify all required software is installed:

```bash
# Check Node.js version (should be 18 or higher)
node --version

# Check NPM version (should be 8 or higher)
npm --version

# Check Docker version (should be 20.10 or higher)
docker --version

# Verify Docker daemon is running
sudo systemctl status docker
```

### 2. Clone the Repository

```bash
git clone https://github.com/SparkPanel/SparkPanel.git
cd SparkPanel
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Optional: PostgreSQL database connection
# DATABASE_URL=postgresql://user:password@localhost:5432/sparkpanel

# REQUIRED: Session secret (generate a random string – DO NOT use defaults in production)
SESSION_SECRET=your-random-secret-key-here

# Node environment
NODE_ENV=production

# Optional: Force HTTPS for cookies (set to 'true' if using HTTPS via reverse proxy)
# FORCE_HTTPS=false

# Optional: Rate limiting overrides (defaults are safe for most setups)
# LOGIN_RATE_LIMIT_MAX_ATTEMPTS=5
# LOGIN_RATE_LIMIT_WINDOW_MS=900000
# COMMAND_RATE_LIMIT_MAX_ATTEMPTS=30
# COMMAND_RATE_LIMIT_WINDOW_MS=60000

# Port (default: 5000)
# PORT=5000
```

To generate a secure session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Build the Application

```bash
npm run build
```

This will:
- Build the frontend (React + Vite)
- Bundle the backend (Express + TypeScript)
- Output to `dist/` directory

### 6. Configure Docker Access

Ensure the user running SparkPanel has access to Docker:

```bash
# Add current user to docker group
sudo usermod -aG docker $USER

# Apply group changes (or logout and login)
newgrp docker

# Verify Docker access
docker ps
```

### 7. Start the Application

For production:

```bash
npm start
```

The panel will be available at `http://your-server-ip:5000`

**Note**: If you see errors, check:
- Docker is running: `sudo systemctl status docker`
- User has Docker access: `docker ps` (should work without sudo)
- Port 5000 is not in use: `sudo lsof -i :5000` or `sudo netstat -tlnp | grep 5000`

### 8. Default Credentials

- **Username**: `adplayer`
- **Password**: `0000`

⚠️ **Important**: Change the password immediately after first login!

## Running as a System Service (systemd)

Create a systemd service file `/etc/systemd/system/sparkpanel.service`:

```ini
[Unit]
Description=SparkPanel Game Server Management
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=sparkpanel
WorkingDirectory=/opt/sparkpanel
Environment=NODE_ENV=production
EnvironmentFile=/opt/sparkpanel/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
# Create the user and directory (if not already done)
sudo useradd -r -s /bin/false sparkpanel
sudo mkdir -p /opt/sparkpanel
sudo chown -R sparkpanel:sparkpanel /opt/sparkpanel

# Copy your application files to /opt/sparkpanel
# (or clone directly there)

# Make sure .env file exists at /opt/sparkpanel/.env
# Make sure dist/ directory exists (run npm run build first)

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable sparkpanel

# Start the service
sudo systemctl start sparkpanel

# Check status
sudo systemctl status sparkpanel

# View logs if needed
sudo journalctl -u sparkpanel -f
```

## Reverse Proxy with Nginx

For production use, configure Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support for console
    location /ws {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

Enable SSL with Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

**Important**: After enabling HTTPS, set `FORCE_HTTPS=true` in your `.env` file and restart the application. This ensures cookies work correctly with HTTPS.

## Development Mode

For development with hot reload:

```bash
npm run dev
```

The application will start at `http://localhost:5000`

## Updating

To update to the latest version:

```bash
cd sparkpanel
git pull
npm install
npm run build
sudo systemctl restart sparkpanel
```

## Troubleshooting

### Docker Connection Issues

```bash
# Check Docker is running
sudo systemctl status docker

# Verify socket permissions
ls -l /var/run/docker.sock

# Test Docker connection
docker ps
```

### Port Already in Use

Change the port in your environment or command:

```bash
PORT=8080 npm start
```

### Session Issues

Clear browser cookies or regenerate SESSION_SECRET in `.env`

**401 Unauthorized errors:**
- Ensure `FORCE_HTTPS=true` in `.env` if using HTTPS via Nginx reverse proxy
- If using HTTP directly (without proxy), leave `FORCE_HTTPS` unset or set to `false`
- Check that `trust proxy` is configured (already set in code for VDS)
- Verify cookies are being sent with `credentials: "include"` in requests

## Implementation Status

✅ **All core features fully implemented:**
- ✅ **Real Docker statistics**: CPU, RAM, Network from `container.stats()` API
- ✅ **Real-time logs**: Streamed via `container.attach()` API (no simulation)
- ✅ **File listing**: Real file system access via `container.exec()` with `ls` command
- ✅ **Disk usage**: Collected via `df` command inside containers
- ✅ **Multi-node support**: Local Docker socket + remote HTTP/HTTPS connections
- ✅ **WebSocket security**: Session authentication via cookies
- ✅ **Auto-monitoring**: Automatic node connection checking every 30 seconds
- ✅ **Resource aggregation**: Node stats calculated from actual server usage

**Note**: Node-level disk usage is calculated from container sizes (SizeRootFs + SizeRw) available through Docker API. For host-level disk usage monitoring, can be extended with SSH agent or host monitoring tools.

## Security Recommendations

1. **Change default credentials** immediately
2. **Use HTTPS** in production (Nginx + Let's Encrypt)
3. **Firewall**: Only expose necessary ports
4. **Regular updates**: Keep dependencies updated
5. **Backups**: Regular backups if using PostgreSQL

## Support

For issues and questions:
- GitHub Issues: https://github.com/sparkpanel/sparkpanel/issues
- Documentation: See architecture documentation for more details
