# MoA-ATS Production Deployment Guide

A step-by-step guide for deploying the Ministry of Agriculture Fixed Asset Tracking System (**MoA-ATS**) on an on-premise Linux server. The layout matches the Ministry's other systems (e.g. moa_budget): an **nginx** container, a **backend** container and a **PostgreSQL** container, deployed by **Jenkins**.

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
- **The domain name**: `ams.moa.gov.et` is set in `nginx/nginx.conf`. Change `server_name` there if you use another name.
- **Where the certificate comes from**: the Ministry's certificate authority, or Let's Encrypt ([§5](#5-https-certificate)).
- **Deployments by Jenkins** ([§9](#9-automated-deployment-with-jenkins)) or by hand ([§8](#8-updating-to-a-new-release)).

---

## 2. Architecture Overview

```
Client (Desktop / Mobile PWA)
           │
      HTTPS (Port 443)
           ▼
[ nginx container ]  ── serves the web app (React PWA) from the image,
     │                  terminates HTTPS with ./ssl, redirects 80 → 443
     │  /api/  →  http://backend:3000  (Docker network only)
     ▼
[ backend container (Node 22 / Express API) ]
     ├── Volume slip-files: /app/backend/uploads (scanned slips / PDFs)
     └── Internal TCP 5432
           ▼
[ db container (PostgreSQL 16) ]
     └── Volume db-data: /var/lib/postgresql/data
```

| Repository file | Purpose |
| :--- | :--- |
| `docker-compose.yml` | The three services, their volumes and the ports (80, 443) |
| `nginx/Dockerfile`, `nginx/nginx.conf` | Builds the web app and serves it; HTTPS; forwards `/api/` to the backend |
| `backend/Dockerfile`, `backend/docker-entrypoint.sh` | The API image; on start-up it prepares the database and creates the first administrator |
| `.env.example` | Template for the server's `.env` (passwords, first administrator) |
| `Jenkinsfile` | Automated deployment to the server over SSH |

---

## 3. Firewall, Ports & Clock

Configure the Linux firewall (`ufw` on Ubuntu or `firewalld` on RHEL):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH (restrict to the IT management subnet and the Jenkins server)
sudo ufw allow 80/tcp    # HTTP (redirects to HTTPS)
sudo ufw allow 443/tcp   # HTTPS (web app & PWA)
sudo ufw enable
```

Only the nginx container publishes ports (80 and 443). The backend (3000) and the database (5432) are reachable only inside Docker's network.

Set the timezone and make sure the clock is synchronised. A wrong clock puts wrong dates on Model 19/22 slips and in the audit log:

```bash
sudo timedatectl set-timezone Africa/Addis_Ababa
sudo timedatectl set-ntp true
timedatectl status    # expect "Time zone: Africa/Addis_Ababa" and "System clock synchronized: yes"
```

If the server can't reach public time servers, point it at the Ministry's internal NTP server (`/etc/systemd/timesyncd.conf`, `NTP=`).

---

## 4. Installation

### 4A. Standard installation (server with internet access)

#### Step 1: Install Docker and create the deploy account
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo useradd -m -s /bin/bash ams          # the account that runs and deploys the app
sudo usermod -aG docker ams
sudo mkdir -p /opt/moa-ams && sudo chown ams:ams /opt/moa-ams
sudo -iu ams                               # continue as this user
```

#### Step 2: Get the code & create `.env`
```bash
git clone https://github.com/MoA-Eth/asset-tracking-system.git /opt/moa-ams
cd /opt/moa-ams
cp .env.example .env
chmod 600 .env               # it holds passwords
```

> To install a fixed release by hand, `git checkout v1.0.0`. Jenkins (§9) doesn't use this clone: it builds the images itself and replaces them on the server.
>
> Keep the folder name `/opt/moa-ams`. Docker names the data volumes after it (`moa-ams_db-data`, `moa-ams_slip-files`).

#### Step 3: Configure `.env`
Generate the secrets on the server:

```bash
openssl rand -hex 24    # POSTGRES_PASSWORD
openssl rand -hex 32    # JWT_SECRET
```

Then fill in `/opt/moa-ams/.env`:

```ini
APP_ENV=prod
TZ=Africa/Addis_Ababa

# Letters and numbers only (it becomes part of the database address, so ! @ # / : break the connection)
POSTGRES_PASSWORD=3f9c0e...

# At least 32 characters
JWT_SECRET=a71b4d...

# nginx is the one proxy in front of the API
TRUST_PROXY=1
CORS_ORIGIN=

# Initial System Administrator (used ONLY on first launch)
ADMIN_EMAIL=admin@moa.gov.et
ADMIN_PASSWORD=ChooseAnInitialPassword2026
ADMIN_NAME=System Administrator
# The administrator's real 8-digit HR payroll ID, the same format every other employee must use
ADMIN_EMPLOYEE_ID=00123456
```

`ADMIN_PASSWORD` must be at least 12 characters with letters and numbers; the administrator is asked to replace it at the first sign-in.

#### Step 4: Install the certificate
nginx won't start without one. Get it as described in [§5](#5-https-certificate) and place it as:

```
/opt/moa-ams/ssl/fullchain.pem    # the certificate, followed by any intermediate certificates
/opt/moa-ams/ssl/privkey.pem      # its private key
```

```bash
chmod 700 /opt/moa-ams/ssl && chmod 600 /opt/moa-ams/ssl/privkey.pem
```

The `ssl/` folder is ignored by git, so `git pull` never touches it.

#### Step 5: Build & Launch
```bash
cd /opt/moa-ams
docker compose up -d --build
docker compose ps                          # db, backend and nginx should be running / healthy
curl -skf https://localhost/api/health     # -k: the certificate names ams.moa.gov.et, not localhost
```

Then continue with [§6 First sign-in](#6-first-sign-in--setup).

### 4B. Offline installation (server without internet)

Building the images downloads Node.js, npm packages and base images, so a server without internet can't build them. Build on a machine that has internet and Docker, then copy them over.

**On the build machine:**
```bash
git clone https://github.com/MoA-Eth/asset-tracking-system.git moa-ams
cd moa-ams
git checkout v1.0.0            # or stay on main
docker compose build           # builds moa-ams-backend and moa-ams-nginx
docker pull postgres:16-alpine
docker save moa-ams-backend:latest moa-ams-nginx:latest postgres:16-alpine | gzip > moa-ams-images.tar.gz
```

Copy `moa-ams-images.tar.gz`, `docker-compose.yml` and `.env.example` to the server (USB drive or internal file share). Docker itself must also be installed on the server. If it has no internet, use your distribution's offline packages.

**On the server:**
```bash
cd /opt/moa-ams
# place docker-compose.yml and .env.example here
docker load -i /path/to/moa-ams-images.tar.gz
cp .env.example .env && chmod 600 .env     # fill in as in §4A Step 3
# certificate in ./ssl as in §4A Step 4
docker compose up -d --no-build
docker compose ps
curl -skf https://localhost/api/health
```

`--no-build` makes Compose use the loaded images instead of trying to build them. The upgrade scripts (§8) are inside the backend image, so the server needs no source code. Jenkins (§9) works the same way: it builds the images and sends them to the server, so later releases need no USB drive or file share.

> If the server reaches the internet only through a proxy, you can use §4A: configure the proxy for Docker (`/etc/systemd/system/docker.service.d/http-proxy.conf`) and for git.

---

## 5. HTTPS Certificate

The app must be served over HTTPS: browsers only install the mobile app (PWA) and use the camera scanner on secure pages. nginx reads the certificate from `./ssl/fullchain.pem` and `./ssl/privkey.pem`.

**Option A: Ministry certificate authority (internal servers, the usual case on-premise).**
Let's Encrypt can't issue certificates for names that aren't reachable from the internet, so request one from the Ministry's IT/PKI team:

```bash
mkdir -p /opt/moa-ams/ssl && cd /opt/moa-ams/ssl
openssl req -new -newkey rsa:2048 -nodes \
  -keyout privkey.pem -out ams.csr \
  -subj "/CN=ams.moa.gov.et" \
  -addext "subjectAltName=DNS:ams.moa.gov.et"
chmod 600 privkey.pem
```

Send `ams.csr` to the PKI team. Save the certificate they return, followed by any intermediate certificates, as `/opt/moa-ams/ssl/fullchain.pem`. Ministry computers and phones must trust the Ministry root certificate; if they don't, users see a security warning.

*Users reach the server only by IP address?* Use `-subj "/CN=10.0.0.15"` and `-addext "subjectAltName=IP:10.0.0.15"` with the server's address, and set `server_name` in `nginx/nginx.conf` to match. A DNS name is still recommended, because it survives a change of server.

**Option B: Let's Encrypt (only if the name is publicly reachable).**
The nginx container holds port 80, so stop it while certbot answers the challenge:

```bash
sudo apt install -y certbot
docker compose stop nginx          # skip on the very first install
sudo certbot certonly --standalone -d ams.moa.gov.et
sudo cp -L /etc/letsencrypt/live/ams.moa.gov.et/fullchain.pem /etc/letsencrypt/live/ams.moa.gov.et/privkey.pem /opt/moa-ams/ssl/
sudo chown ams:ams /opt/moa-ams/ssl/*.pem
docker compose start nginx
```

Let's Encrypt certificates last 90 days; renew with the same steps (or a certbot `--pre-hook`/`--post-hook` that stops and starts nginx and copies the files).

**Replacing a certificate** (renewal, either option): put the new files in `./ssl`, then `docker compose restart nginx`.

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

Jenkins also saves a database copy before every deploy in `/opt/moa-ams/backups` (kept 30 days). That doesn't replace the daily backup below.

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

# 2. Archive uploaded vouchers (read through the backend container, so it doesn't depend on Docker's volume paths)
$COMPOSE exec -T backend tar -czf - -C /app/backend/uploads . > "$BACKUP_DIR/moa_ams_slips_$DATE.tar.gz"

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
docker compose exec -T backend tar -xzf - -C /app/backend/uploads < /path/to/moa_ams_slips_YYYY-MM-DD.tar.gz

# Restart the API
docker compose restart backend
```

**Test a restore before go-live**, on a spare machine or a test installation: restore the latest backup, sign in, and open an asset with a scanned slip. A backup that has never been restored isn't known to work.

---

## 8. Updating to a New Release

With Jenkins ([§9](#9-automated-deployment-with-jenkins)) this happens on every deploy. By hand, it is the same few steps. **Always take a backup first.**

```bash
cd /opt/moa-ams
sudo /etc/cron.daily/moa-ams-backup          # 1. backup

git pull origin main                          # 2. get the new version (or: git fetch --tags && git checkout v1.1.0)
docker compose up -d --build                  # 3. rebuild and restart the containers that changed

docker compose ps                             # 4. check
curl -skf https://localhost/api/health
```

*Offline server:* build and `docker save` the new images on the build machine (§4B), then on the server: backup → `docker load -i moa-ams-images.tar.gz` → `docker compose up -d --no-build`.

On start-up the backend brings the database tables up to date by itself. It **refuses** any change that would delete data. If that happens, the `backend` container stops and its log (`docker compose logs backend`) says:

> The database needs an upgrade step that is not applied automatically.

Run the upgrade scripts that came with the release, then start again. Each script only adds tables and columns and keeps every row, and running one twice does no harm, so if unsure run all of them in order:

```bash
cd /opt/moa-ams
for m in 202610010001_roles_audit 202610020001_employee_registry 202610030001_reference_data \
         202610040001_password_change 202610050001_system_settings; do
  docker compose run --rm --no-deps --entrypoint "" backend \
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

If an update goes wrong, go back to the previous version (`git checkout <previous commit or tag>`, then `docker compose up -d --build`; after a Jenkins deploy, use the `:previous` images as in §9). If the database was changed, also restore the backup taken in step 1.

---

## 9. Automated Deployment with Jenkins

`Jenkinsfile` deploys the `main` branch to one of two servers. Choose it in **Build with Parameters → TARGET**:

| TARGET | Server | SSH account |
|---|---|---|
| `staging` (default) | `10.10.20.156` | `assetmgts` |
| `production` | `10.10.20.155` | `assetmgtp` |

The servers have no internet access, so Jenkins does the building and the servers only receive finished images. New commits on `main` reach staging by themselves within about 5 minutes; check the release there, then run the job with `production`. Each run:

1. **Build Images**: builds `moa-ams-backend` and `moa-ams-nginx` on Jenkins from the checked-out `main`.
2. **Backup Database**: saves `pg_dump` output in `/opt/moa-ams/backups/pre-deploy-<date>.dump` on the server (skipped on the very first deploy) and removes copies older than 30 days.
3. **Send Images**: tags the running images `:previous`, streams the new ones to the server (`docker save | ssh … docker load`), sends the database image only if the server lacks it, and copies `docker-compose.yml`.
4. **Deploy**: `docker compose up -d --no-build --remove-orphans`, which replaces only the containers whose image changed; the database keeps running.
5. **Health Check**: calls `https://localhost/api/health` on the server for up to 2 minutes; if it never answers, prints the backend and nginx logs and fails the build.

**Rolling back** a release that misbehaves, on the server:

```bash
cd /opt/moa-ams
docker tag moa-ams-backend:previous moa-ams-backend:latest
docker tag moa-ams-nginx:previous moa-ams-nginx:latest
docker compose up -d --no-build
```

If the database was changed, also restore the `pre-deploy` backup (§7, *Restoring from Backup*).

### One-time setup

**On each server** (as in §4B): Docker, `/opt/moa-ams` owned by the SSH account, with `.env` and the certificate in `./ssl`. No source code or internet is needed there.

**SSH key:** the public key goes in the SSH account's `~/.ssh/authorized_keys` on both servers. Keep administrators' own keys in `~/.ssh/authorized_keys2`, which sshd also reads, so the two are managed separately.

**In Jenkins:**
- Plugins: **Pipeline**, **Git**, **SSH Agent**, **Timestamper**. The job runs on the node labelled `docker`, which needs Docker with Compose v2 and internet access to GitHub, npm, Docker Hub and `deb.debian.org`.
- Credential `moa-ams-deploy-ssh`: "SSH Username with private key", holding the private half of the key above. The repository is public, so checkout needs no credential.
- Create a **Pipeline** job, "Pipeline script from SCM", pointing at `https://github.com/MoA-Eth/asset-tracking-system.git`, branch `*/main`, script path `Jenkinsfile`. Its first run deploys to staging; after that Jenkins shows **Build with Parameters**.
- **Staging deploys itself:** the `Jenkinsfile` has Jenkins check GitHub every 5 minutes, and new commits on `main` start a run with the default TARGET, `staging`. The check is registered by the first run of a `Jenkinsfile` that contains it.
- **Production is always by hand:** **Build with Parameters → TARGET `production`**, after checking staging.
- To change a server address or account, edit `DEPLOY_HOST` / `DEPLOY_USER` in `Jenkinsfile`.

Run the first Jenkins deployment only after the manual install in §4B has succeeded once on that server.

---

## 10. Routine Operations & Maintenance

| Action | Command (in `/opt/moa-ams`) |
| :--- | :--- |
| **Check service status** | `docker compose ps` |
| **View live logs** | `docker compose logs -f backend` (API) · `docker compose logs -f nginx` (web/HTTPS) |
| **Health check API** | `curl -skf https://localhost/api/health` |
| **Restart services** | `docker compose restart` |
| **Replace the certificate** | new files in `./ssl`, then `docker compose restart nginx` |
| **Which version is running** | `curl -sk https://localhost/api/health`: `commit` is the Git commit the running image was built from |
| **Update to new release** | Jenkins, or see [§8](#8-updating-to-a-new-release) |
| **Run backup now** | `sudo /etc/cron.daily/moa-ams-backup` |
| **Stop application** | `docker compose down` *(Never add `-v`: it deletes the database and scanned slips)* |
