# MoA-ATS Production Deployment Guide

A concise, step-by-step specification for deploying the Ministry of Agriculture Fixed Asset & Store Management System (**MoA-ATS**) on a production Linux server.

---

## 1. Server Specifications & Requirements

| Resource | Minimum (Staging / Pilot) | Recommended (Production) | Notes |
| :--- | :--- | :--- | :--- |
| **Operating System** | Ubuntu Server 22.04 LTS | **Ubuntu Server 24.04 LTS** (or RHEL 9 / Rocky 9) | 64-bit x86_64 Linux |
| **Compute (vCPU)** | 2 vCPUs | **4 vCPUs** | 2.4 GHz+ |
| **Memory (RAM)** | 4 GB | **8 GB** | Node.js + PostgreSQL buffer cache |
| **Disk Storage** | 50 GB SSD | **100 GB – 150 GB NVMe / SSD** | System + DB + PDF voucher uploads |
| **Timezone** | `Africa/Addis_Ababa` | **`Africa/Addis_Ababa`** (UTC+3) | Required for accurate Ethiopian fiscal dates |
| **Runtimes** | Docker Engine 24+ & Docker Compose v2 | **Docker Engine 26+ & Compose v2** | Standard container runtime |

---

## 2. Architecture Overview

```
Client (Desktop / Mobile PWA)
           │
      HTTPS (Port 443)
           ▼
[ Nginx Reverse Proxy / SSL Termination ]
           │
      HTTP (127.0.0.1:3000)
           ▼
[ MoA-ATS App Container (Node 22 / Express / Vite SPA) ]
     ├── Persistent Volume: /app/backend/uploads (Scanned slips / PDFs)
     └── Internal TCP (5432)
           ▼
[ PostgreSQL 16 Container ]
     └── Persistent Volume: /var/lib/postgresql/data
```

---

## 3. Firewall & Ports Configuration

Configure the Linux firewall (`ufw` on Ubuntu or `firewalld` on RHEL):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH (Restrict to IT management subnet if applicable)
sudo ufw allow 80/tcp    # HTTP (Auto-redirect to HTTPS)
sudo ufw allow 443/tcp   # HTTPS (Production Web & PWA traffic)
sudo ufw enable
```

*Ports `3000` (Node.js) and `5432` (PostgreSQL) must remain strictly internal.*

---

## 4. Production Deployment with Docker (Recommended)

### Step 1: Install Docker on the Linux Host
```bash
sudo timedatectl set-timezone Africa/Addis_Ababa
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

### Step 2: Clone Repository & Create `.env`
```bash
git clone -b feat/asset-tracking-portal https://github.com/MoA-Eth/asset-tracking-system.git /opt/moa-ams
cd /opt/moa-ams
cp .env.docker.example .env
```

### Step 3: Configure `.env`
Generate secrets and populate `/opt/moa-ams/.env`:

```ini
# Environment Tier
APP_ENV=prod
TZ=Africa/Addis_Ababa

# Database Password (generate a strong password)
POSTGRES_PASSWORD=SetAStrongRandomPasswordHere123!

# Session Token Secret (generate with: openssl rand -hex 32)
JWT_SECRET=ReplaceWith64CharacterRandomHexSecretGeneratedAbove

# Initial System Administrator (used ONLY on first launch)
ADMIN_EMAIL=admin@moa.gov.et
ADMIN_PASSWORD=InitialAdminPassword123!
ADMIN_NAME=System Administrator
ADMIN_EMPLOYEE_ID=ADMIN-001

# Bind address: keep local for Nginx reverse proxy
APP_BIND=127.0.0.1:3000
TRUST_PROXY=1
CORS_ORIGIN=
```

### Step 4: Build & Launch
```bash
docker compose up -d --build
docker compose ps
```
*Both `app` and `db` services should report status `healthy` or `running`.*

> **Security Note**: Once the administrator completes the initial sign-in, remove `ADMIN_PASSWORD` from `.env`.

---

## 5. Nginx Reverse Proxy & SSL Setup

### Step 1: Install Nginx & Certbot
```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

### Step 2: Create Site Configuration
Create `/etc/nginx/sites-available/moa-ams.conf`:

```nginx
server {
    listen 80;
    server_name ams.moa.gov.et; # Replace with your Ministry domain
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ams.moa.gov.et; # Replace with your Ministry domain

    # SSL Certificates (managed by Certbot or internal Ministry PKI)
    ssl_certificate /etc/letsencrypt/live/ams.moa.gov.et/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ams.moa.gov.et/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Maximum payload for scanned voucher attachments (Model 19, 20, 21, 22)
    client_max_body_size 25M;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Step 3: Enable Site & Issue SSL Certificate
```bash
sudo ln -sf /etc/nginx/sites-available/moa-ams.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo certbot --nginx -d ams.moa.gov.et
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. Daily Backups & Disaster Recovery

Two directories hold all critical data:
1. **PostgreSQL Database** (`db-data` volume)
2. **Scanned Voucher Files** (`slip-files` volume: `/app/backend/uploads`)

### Automated Daily Backup Cron Job
Create `/etc/cron.daily/moa-ams-backup`:

```bash
#!/bin/bash
set -e
BACKUP_DIR="/var/backups/moa-ams"
DATE=$(date +%F_%H%M%S)
mkdir -p "$BACKUP_DIR"

# 1. Export database snapshot
docker compose -f /opt/moa-ams/docker-compose.yml exec -T db pg_dump -U moa_ams -Fc moa_ams > "$BACKUP_DIR/moa_ams_db_$DATE.dump"

# 2. Archive uploaded vouchers
tar -czf "$BACKUP_DIR/moa_ams_slips_$DATE.tar.gz" -C /var/lib/docker/volumes/moa-ams_slip-files/_data .

# 3. Purge backups older than 30 days
find "$BACKUP_DIR" -type f -mtime +30 -delete
```

Make it executable:
```bash
sudo chmod +x /etc/cron.daily/moa-ams-backup
```

### Restoring from Backup
```bash
# Restore Database
docker compose exec -T db pg_restore -U moa_ams -d moa_ams --clean --if-exists < /path/to/moa_ams_db_backup.dump

# Restore Voucher Attachments
docker cp /path/to/slips/. moa-ams-app-1:/app/backend/uploads/

# Restart Application
docker compose restart app
```

---

## 7. Routine Operations & Maintenance

| Action | Command |
| :--- | :--- |
| **Check service status** | `docker compose ps` |
| **View live logs** | `docker compose logs -f app` |
| **Health check API** | `curl -f http://127.0.0.1:3000/api/health` |
| **Restart services** | `docker compose restart` |
| **Update to new release** | `git pull && docker compose up -d --build` |
| **Stop application** | `docker compose down` *(Never run `-v` to preserve data)* |
