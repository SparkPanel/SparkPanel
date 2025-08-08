# SparkPanel — security hardening

Набор готовых конфигов/скриптов для защиты панели и VDS (Ubuntu 22.04).

Что внутри
- Nginx защита от бурстов/ботов/флуда (`nginx/sparkpanel-security.conf`)
- Fail2Ban jails + фильтр для 429/лимитов (`fail2ban/jail.local`, `fail2ban/filter.d/nginx-req-limit.conf`)
- UFW скрипт (разрешить только нужные порты) (`ufw/setup.sh`)
- Сетевые и системные sysctl-настройки (`sysctl/99-sparkpanel.conf`)
- Доп. защита systemd сервиса backend (`systemd/sparkpanel-backend.hardening.conf`)

Быстрый запуск
1) Скопируйте файлы на сервер (как root):
```bash
cd /opt/SparkPanel/security
```

2) UFW (файрвол)
```bash
bash ufw/setup.sh
```

3) sysctl
```bash
sudo cp sysctl/99-sparkpanel.conf /etc/sysctl.d/99-sparkpanel.conf
sudo sysctl --system
```

4) Nginx
- Установите nginx и включите include:
```bash
sudo apt-get update && sudo apt-get install -y nginx
sudo mkdir -p /etc/nginx/snippets
sudo cp nginx/sparkpanel-security.conf /etc/nginx/snippets/sparkpanel-security.conf
```
- В вашем серверном блоке (см. README раздел prod) добавьте строку внутри `server { ... }`:
```nginx
include snippets/sparkpanel-security.conf;
```
- Перезапуск:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

5) Fail2Ban
```bash
sudo apt-get install -y fail2ban
sudo cp fail2ban/jail.local /etc/fail2ban/jail.local
sudo mkdir -p /etc/fail2ban/filter.d
sudo cp fail2ban/filter.d/nginx-req-limit.conf /etc/fail2ban/filter.d/nginx-req-limit.conf
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
```

6) systemd hardening (backend)
- Если вы используете unit из README, добавьте усиление:
```bash
sudo mkdir -p /etc/systemd/system/sparkpanel-backend.service.d
sudo cp systemd/sparkpanel-backend.hardening.conf /etc/systemd/system/sparkpanel-backend.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl restart sparkpanel-backend
```

Примечания
- Параметры лимитов/скоростей подбирайте под нагрузку.
- Для защиты на уровне провайдера (L4/L7 DDoS) используйте upstream-защиту (Cloudflare/ANTI-DDoS от хостера).
- Для ModSecurity (WAF) можно дополнительно установить libmodsecurity3 + OWASP CRS и включить в nginx.
