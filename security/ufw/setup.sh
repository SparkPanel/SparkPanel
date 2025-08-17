#!/usr/bin/env bash
set -euo pipefail

# Allow SSH
ufw allow OpenSSH

# Allow HTTP/HTTPS
ufw allow 80
ufw allow 443

# Allow Minecraft default port (adjust as needed)
ufw allow 25565/tcp

# Optional dev ports (uncomment if using dev mode publicly)
# ufw allow 5173
# ufw allow 8080

# Deny everything else and enable
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
ufw status verbose
