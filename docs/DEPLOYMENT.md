# MoA-ATS Production Deployment Guide

A step-by-step guide for deploying the Ministry of Agriculture Fixed Asset Tracking System (**MoA-ATS**) on an on-premise Linux server.

---

## 1. Server Specifications & Requirements

| Resource | Minimum (Staging / Pilot) | Recommended (Production) | Notes |
| :--- | :--- | :--- | :--- |
| **Operating System** | Ubuntu Server 22.04 LTS | **Ubuntu Server 24.04 LTS** (or RHEL 9 / Rocky 9) | 64-bit x86_64 Linux |
| **Compute (vCPU)** | 2 vCPUs | **4 vCPUs** | 2.4 GHz+ |
| **Memory (RAM)** | 4 GB | **8 GB** | Node.js + PostgreSQL buffer cache |
| **Disk Storage** | 50 GB SSD | **100 GB – 150 GB NVMe / SSD** | System + DB + scanned slips + local backups |
| **Timezone** | `Africa/Addis_Ababa` | **`Africa/Addis_Ababa`** (UTC+3), clock synchronised (NTP) | Dates on slips, Ethiopian calendar conversion and the audit log come from this clock |
| **Runtimes** | Docker Engine 24+ & Docker Compose v2 | **Docker Engine 26+ & Compose v2** | Standard container runtime |
| **Backup target** | — | **A second machine or network share** | Backups must not live only on the application server |

Before you start, know the answers to:
- **Does the server have internet access** (directly or through a proxy)? If not, follow [§4B Offline installation](#4b-offline-installation-server-without-internet).
- **How will users reach it**: a domain name (e.g. `ams.moa.gov.et`) or only an internal IP address? This decides the certificate in [§5](#5-nginx-reverse-proxy--https).
- **Which version** you are installing: a release tag such as `v1.0.0` (recommended) or the latest `main`.

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

## 3. Firewall, Ports & Clock

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

Set the timezone and make sure the clock is synchronised. A wrong clock puts wrong dates on Model 19/22 slips and in the audit log:

```bash
sudo timedatectl set-timezone Africa/Addis_Ababa
sudo timedatectl set-ntp true
timedatectl status    # expect "Time zone: Africa/Addis_Ababa" and "System clock synchronized: yes"
```

If the server can't reach public time servers, point it at the Ministry's internal NTP server (`/etc/systemd/timesyncd.conf`, `NTP=`).

---

## 4. Production Deployment with Docker

### 4A. Standard installation (server with internet access)

#### Step 1: Install Docker on the Linux Host
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

#### Step 2: Get the release & create `.env`
Install a tagged release so you always know which version is running. Use `main` only if no release has been tagged yet.

```bash
git clone https://github.com/MoA-Eth/asset-tracking-system.git /opt/moa-ams
cd /opt/moa-ams
git checkout v1.0.0          # the release to install; skip if installing the latest main
cp .env.docker.example .env
chmod 600 .env               # it holds passwords
```

> Keep the folder name `/opt/moa-ams`. Docker names the data volumes after it (`moa-ams_db-data`, `moa-ams_slip-files`).

#### Step 3: Configure `.env`
Generate the secrets on the server:

```bash
openssl rand -hex 24    # POSTGRES_PASSWORD
openssl rand -hex 32    # JWT_SECRET
```

Then fill in `/opt/moa-ams/.env`:

```ini
# Environment Tier
APP_ENV=prod
TZ=Africa/Addis_Ababa

# Database password: letters and numbers only (it becomes part of the database address,
# so characters such as ! @ # / : break the connection). Paste the first value generated above.
POSTGRES_PASSWORD=3f9c0e...   

# Session signing key: at least 32 characters. Paste the second value generated above.
JWT_SECRET=a71b4d...

# Initial System Administrator (used ONLY on first launch)
ADMIN_EMAIL=admin@moa.gov.et
ADMIN_PASSWORD=ChooseAnInitialPassword2026
ADMIN_NAME=System Administrator
# The administrator's real 8-digit HR payroll ID, the same format every other employee must use
ADMIN_EMPLOYEE_ID=00123456

# Bind address: keep local for Nginx reverse proxy
APP_BIND=127.0.0.1:3000
TRUST_PROXY=1
CORS_ORIGIN=
```

`ADMIN_PASSWORD` must be at least 12 characters with letters and numbers; the administrator is asked to replace it at the first sign-in.

#### Step 4: Build & Launch
```bash
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:3000/api/health
```
*Both `app` and `db` services should report `healthy`, and the health check should answer.*

Then continue with [§5](#5-nginx-reverse-proxy--https) and [§6 First sign-in](#6-first-sign-in--setup).

### 4B. Offline installation (server without internet)

Building the image downloads Node.js, npm packages and the Debian base image, so a server without internet can't build it. Build it on a machine that has internet and Docker, then copy it over.

**On the build machine:**
```bash
git clone https://github.com/MoA-Eth/asset-tracking-system.git moa-ams
cd moa-ams
git checkout v1.0.0
docker compose build
docker pull postgres:16-alpine
docker save moa-asset-tracking:latest postgres:16-alpine | gzip > moa-ats-v1.0.0.tar.gz
```

Copy `moa-ats-v1.0.0.tar.gz`, `docker-compose.yml` and `.env.docker.example` to the server (USB drive or internal file share). Docker itself must also be installed on the server. If it has no internet, use your distribution's offline packages.

**On the server:**
```bash
sudo mkdir -p /opt/moa-ams && cd /opt/moa-ams
# place docker-compose.yml and .env.docker.example here
docker load -i /path/to/moa-ats-v1.0.0.tar.gz
cp .env.docker.example .env && chmod 600 .env
# fill in .env as in §4A Step 3
docker compose up -d --no-build
docker compose ps
curl -f http://127.0.0.1:3000/api/health
```

`--no-build` makes Compose use the loaded image instead of trying to build one. The upgrade scripts (§8) are inside the image, so the server needs no source code.

> If the server reaches the internet only through a proxy, you can use §4A instead: configure the proxy for Docker (`/etc/systemd/system/docker.service.d/http-proxy.conf`) and pass it to the build with `HTTP_PROXY`/`HTTPS_PROXY` build arguments.

---

## 5. Nginx Reverse Proxy & HTTPS

The app must be served over HTTPS: browsers only install the mobile app (PWA) and use the camera scanner on secure pages.

### Step 1: Install Nginx
```bash
sudo apt update && sudo apt install -y nginx
```

### Step 2: Get a certificate

Pick **one** of the options below.

**Option A: Ministry certificate authority (internal servers, the usual case on-premise).**
Let's Encrypt can't issue certificates for names that aren't reachable from the internet, so request one from the Ministry's IT/PKI team:

```bash
sudo mkdir -p /etc/ssl/moa-ams && cd /etc/ssl/moa-ams
sudo openssl req -new -newkey rsa:2048 -nodes \
  -keyout ams.key -out ams.csr \
  -subj "/CN=ams.moa.gov.et" \
  -addext "subjectAltName=DNS:ams.moa.gov.et"
sudo chmod 600 ams.key
```

Send `ams.csr` to the PKI team. Save the certificate they return, followed by any intermediate certificates, as `/etc/ssl/moa-ams/ams.crt`. Ministry computers and phones must trust the Ministry root certificate; if they don't, users see a security warning.

*Users reach the server only by IP address?* Use `-subj "/CN=10.0.0.15"` and `-addext "subjectAltName=IP:10.0.0.15"` with the server's address. A DNS name is still recommended, because it survives a change of server.

**Option B: Let's Encrypt (only if the name is publicly reachable).**
```bash
sudo apt install -y certbot python3-certbot-nginx
# after Step 3 below:
sudo certbot --nginx -d ams.moa.gov.et
```

### Step 3: Create Site Configuration
Create `/etc/nginx/sites-available/moa-ams.conf`:

```nginx
server {
    listen 80;
    server_name ams.moa.gov.et; # Replace with your Ministry domain (or the server IP)
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ams.moa.gov.et; # Replace with your Ministry domain (or the server IP)

    # Option A (Ministry CA):
    ssl_certificate     /etc/ssl/moa-ams/ams.crt;
    ssl_certificate_key /etc/ssl/moa-ams/ams.key;
    # Option B (Let's Encrypt) - certbot writes these lines for you:
    # ssl_certificate /etc/letsencrypt/live/ams.moa.gov.et/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/ams.moa.gov.et/privkey.pem;

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

### Step 4: Enable Site
```bash
sudo ln -sf /etc/nginx/sites-available/moa-ams.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Open `https://ams.moa.gov.et` from a Ministry computer. The page should load with no certificate warning.

---

## 6. First Sign-in & Setup

The production start-up creates **only** the System Administrator. It adds no stores, staff or sample data.

> **Never run `npm run db:seed` (or `prisma/seed.ts`) on production.** That script loads demo accounts with known passwords and sample assets.

1. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then choose a new password when prompted.
2. Remove the `ADMIN_PASSWORD` line from `/opt/moa-ams/.env`. It is ignored from now on, but shouldn't stay on disk.
3. **Settings → Stores**: add the stores and their locations.
4. **Settings → Employees**: import HR's staff list (Excel). Employee IDs are 8-digit payroll IDs, e.g. `00123456`.
5. **Settings → Users**: give sign-in to the Data Encoders, Team Leaders, Department Heads and Managers. Each department can have only one Team Leader, one Department Head and one Manager.
6. **Settings → System Settings**: choose whether a scanned slip must be attached to every voucher.

---

## 7. Daily Backups & Disaster Recovery

Two places hold all critical data:
1. **PostgreSQL Database** (`db-data` volume)
2. **Scanned Voucher Files** (`slip-files` volume: `/app/backend/uploads`)

### Automated Daily Backup Cron Job
Create `/etc/cron.daily/moa-ams-backup`:

```bash
#!/bin/bash
set -euo pipefail
BACKUP_DIR="/var/backups/moa-ams"
DATE=$(date +%F_%H%M%S)
COMPOSE="docker compose -f /opt/moa-ams/docker-compose.yml"
mkdir -p "$BACKUP_DIR"

# 1. Export database snapshot
$COMPOSE exec -T db pg_dump -U moa_ams -Fc moa_ams > "$BACKUP_DIR/moa_ams_db_$DATE.dump"

# 2. Archive uploaded vouchers (read through the app container, so it doesn't depend on Docker's volume paths)
$COMPOSE exec -T app tar -czf - -C /app/backend/uploads . > "$BACKUP_DIR/moa_ams_slips_$DATE.tar.gz"

# 3. Copy to a second machine: a backup that lives only on this server is lost with it.
#    Use whichever the Ministry provides, for example a mounted network share:
#      rsync -a "$BACKUP_DIR/" /mnt/moa-backup/moa-ams/
#    or another server over SSH (with a key set up for root):
#      rsync -a "$BACKUP_DIR/" backup@backup-server:/srv/backups/moa-ams/

# 4. Purge local backups older than 30 days (keep the off-server copies longer)
find "$BACKUP_DIR" -type f -mtime +30 -delete
```

Make it executable, run it once by hand, and check that both files appear on the server **and** on the second machine:
```bash
sudo chmod +x /etc/cron.daily/moa-ams-backup
sudo /etc/cron.daily/moa-ams-backup
ls -lh /var/backups/moa-ams
```

### Restoring from Backup
```bash
cd /opt/moa-ams

# Restore Database
docker compose exec -T db pg_restore -U moa_ams -d moa_ams --clean --if-exists < /path/to/moa_ams_db_YYYY-MM-DD.dump

# Restore Voucher Attachments
docker compose exec -T app tar -xzf - -C /app/backend/uploads < /path/to/moa_ams_slips_YYYY-MM-DD.tar.gz

# Restart Application
docker compose restart app
```

**Test a restore before go-live**, on a spare machine or a test installation: restore the latest backup, sign in, and open an asset with a scanned slip. A backup that has never been restored isn't known to work.

---

## 8. Updating to a New Release

Every update is the same few steps. **Always take a backup first.**

```bash
cd /opt/moa-ams
sudo /etc/cron.daily/moa-ams-backup          # 1. backup

git fetch --tags                              # 2. get the new release
git checkout v1.1.0
docker compose up -d --build                  # 3. rebuild and restart

docker compose ps                             # 4. check
curl -f http://127.0.0.1:3000/api/health
```

*Offline server:* build and `docker save` the new version on the build machine (§4B), then on the server: backup → `docker load -i moa-ats-v1.1.0.tar.gz` → `docker compose up -d --no-build`.

On start-up the app brings the database tables up to date by itself. It **refuses** any change that would delete data. If that happens, the `app` container stops and its log (`docker compose logs app`) says:

> The database needs an upgrade step that is not applied automatically.

Run the upgrade scripts that came with the release, then start again. Each script only adds tables and columns and keeps every row, and running one twice does no harm, so if unsure run all of them in order:

```bash
cd /opt/moa-ams
for m in 202610010001_roles_audit 202610020001_employee_registry 202610030001_reference_data \
         202610040001_password_change 202610050001_system_settings; do
  docker compose run --rm --no-deps --entrypoint "" app \
    npx prisma db execute --file prisma/migrations/$m/migration.sql --schema prisma/schema.prisma
done
docker compose up -d
```

| Script | What it adds |
| :--- | :--- |
| `202610010001_roles_audit` | Audit entries for users; saved role permissions |
| `202610020001_employee_registry` | Staff without sign-in, job title, unit, gender, deactivation |
| `202610030001_reference_data` | Stores containing locations (existing locations are kept and grouped by site) |
| `202610040001_password_change` | Temporary passwords that must be changed at first sign-in |
| `202610050001_system_settings` | System settings (e.g. whether a scanned slip is required) |

A new installation (empty database) never needs these scripts.

If an update goes wrong, return to the previous version with `git checkout <previous tag>` and `docker compose up -d --build`. If the database was changed, also restore the backup taken in step 1.

---

## 9. Routine Operations & Maintenance

| Action | Command |
| :--- | :--- |
| **Check service status** | `docker compose ps` |
| **View live logs** | `docker compose logs -f app` |
| **Health check API** | `curl -f http://127.0.0.1:3000/api/health` |
| **Restart services** | `docker compose restart` |
| **Which version is running** | `git -C /opt/moa-ams describe --tags --always` |
| **Update to new release** | See [§8](#8-updating-to-a-new-release) |
| **Run backup now** | `sudo /etc/cron.daily/moa-ams-backup` |
| **Stop application** | `docker compose down` *(Never add `-v`: it deletes the database and scanned slips)* |
