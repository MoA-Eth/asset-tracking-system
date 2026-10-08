# Deployment Guide (on-premise)

How to install the Asset Tracking System on a Ministry server, and how to run it afterwards. The servers have **no internet access**, so everything they need is prepared on a machine that has it and copied over. Once a server runs, releases go out through Jenkins: see [CI-CD.md](CI-CD.md).

**Contents:** [How it works](#how-it-works) · [Setup steps](#setup-steps) · [Operations](#operations) · [Backups](#backups) · [Troubleshooting](#troubleshooting)

---

## How it works

```
 Build machine (internet + Docker)            App server (no internet)
 ─────────────────────────────────            ────────────────────────────────
 downloads Docker packages      ── scp ──►    installs Docker
 builds the app images          ── scp ──►    /opt/moa-ams
                                                ├─ docker-compose.yml
                                                ├─ .env      (passwords, settings)
                                                └─ ssl/      (HTTPS certificate)
                                              runs 3 containers:
                                                db (PostgreSQL) · backend (API) · nginx (web app, HTTPS)
```

The build machine can be a developer PC with Docker Desktop, or the Jenkins server. Only nginx is reachable from outside (ports 80 and 443); the API and the database stay inside Docker's network.

| Item | Production | Staging |
|---|---|---|
| Address | 10.10.20.155 (`ams.moa.gov.et`) | 10.10.20.156 (`ams-staging.moa.gov.et`) |
| Host name | `moaasset` | `moaasset-stg` |
| Account | `assetmgtp` | `assetmgts` |
| `APP_ENV` | `prod` | `stage` |
| App folder | `/opt/moa-ams` | `/opt/moa-ams` |
| Health check | `https://<address>/api/health` | same |

**Requirements:** Ubuntu 24.04, 4+ CPUs, 8 GB RAM (4 GB is enough for staging), 50 GB+ free disk, an account with `sudo`, and the HTTPS certificate from IT.

---

## Setup steps

Commands marked **(server)** run on the app server; **(build)** on the build machine. `sudo` commands need the server account's password, so run them yourself in an SSH session.

### 1. SSH access (build)

```bash
ssh-keygen -t ed25519 -C "your-name"                       # once, if you have no key
cat ~/.ssh/id_ed25519.pub | ssh <account>@<server> \
  "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys2 && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys2"
ssh <account>@<server> hostname                            # must not ask for a password
```

On Windows PowerShell, start the second command with `type $env:USERPROFILE\.ssh\id_ed25519.pub |` instead of `cat … |`. Keep people's keys in `authorized_keys2`; `authorized_keys` holds the Jenkins key ([CI-CD.md](CI-CD.md)).

### 2. Clock, time zone and name (server)

Dates on vouchers and in the audit log come from the server clock, so it must be right.

```bash
sudo timedatectl set-timezone Africa/Addis_Ababa
sudo hostnamectl set-hostname moaasset-stg                 # a name that says which server it is
timedatectl                                                # check the time against your PC
```

- If IT gives an internal NTP server: set `NTP=<address>` in `/etc/systemd/timesyncd.conf`, then `sudo systemctl restart systemd-timesyncd`.
- If the time is wrong and there is no NTP server, set it by hand: `sudo date -s "2026-10-08 12:00:00"` (current time in Addis Ababa).

### 3. Install Docker from package files

**(build)** Download the five packages for Ubuntu 24.04 from `https://download.docker.com/linux/ubuntu/dists/noble/pool/stable/amd64/` (newest version of each):

```
containerd.io_*.deb  docker-ce_*.deb  docker-ce-cli_*.deb
docker-buildx-plugin_*.deb  docker-compose-plugin_*.deb
```

```bash
ssh <account>@<server> "mkdir -p ~/moa-deploy/docker-debs"
scp *.deb <account>@<server>:moa-deploy/docker-debs/
```

**(server)**

```bash
cd ~/moa-deploy/docker-debs && sudo dpkg -i *.deb
sudo systemctl enable --now docker
sudo usermod -aG docker <account>                          # log out and in again afterwards
sudo mkdir -p /opt/moa-ams && sudo chown <account>:<account> /opt/moa-ams
docker version                                             # works without sudo after re-login
```

### 4. App images

**(build)** From the repository root:

```bash
POSTGRES_PASSWORD=x JWT_SECRET=x docker compose build      # placeholders: only needed to build
docker pull postgres:16-alpine
docker save moa-ams-backend:latest moa-ams-nginx:latest postgres:16-alpine | gzip > moa-ams-images.tar.gz
scp moa-ams-images.tar.gz docker-compose.yml .env.example <account>@<server>:
```

**(server)**

```bash
docker load -i ~/moa-ams-images.tar.gz
mv ~/docker-compose.yml ~/.env.example /opt/moa-ams/
```

This first copy is the only manual one: after setup, Jenkins sends new images on every deploy.

### 5. Settings: `.env` (server)

```bash
cd /opt/moa-ams
sed -i 's/\r$//' docker-compose.yml .env.example           # remove Windows line endings
umask 077
sed -e "s/^APP_ENV=.*/APP_ENV=stage/" \
    -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" \
    -e "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" \
    -e "s/^ADMIN_EMAIL=.*/ADMIN_EMAIL=admin@moa.gov.et/" \
    -e "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=Moa$(openssl rand -hex 8)7/" \
    .env.example > .env
grep ADMIN_PASSWORD .env                                   # note the temporary password
```

- Use `APP_ENV=prod` on production. Each server gets its own passwords; never copy `.env` between servers.
- Optionally set `ADMIN_EMPLOYEE_ID` to the administrator's 8-digit payroll ID.

### 6. HTTPS certificate (server)

Put two files in `/opt/moa-ams/ssl/`:

| File | Content |
|---|---|
| `fullchain.pem` | The site certificate, then the intermediate certificate (leave out the root) |
| `privkey.pem` | Its private key, plain PEM |

```bash
mkdir -p /opt/moa-ams/ssl && chmod 700 /opt/moa-ams/ssl
# copy the two files in, then:
chmod 600 /opt/moa-ams/ssl/privkey.pem
```

- The Ministry wildcard certificate `*.moa.gov.et` comes from IT. Files exported from Windows can carry extra *Bag Attributes* text; clean them with `openssl x509` (each certificate) and `openssl pkey` (the key).
- Until a real certificate is available, a self-signed one for the IP works (browsers will warn):

  ```bash
  cd /opt/moa-ams/ssl && openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
    -keyout privkey.pem -out fullchain.pem -subj "/CN=<server-ip>" -addext "subjectAltName=IP:<server-ip>"
  ```

### 7. Start (server)

```bash
cd /opt/moa-ams
docker compose up -d --no-build
docker compose ps                                          # db and backend "healthy", nginx "running"
curl -sk https://localhost/api/health                      # "status":"healthy"
```

The first start creates the database tables and the administrator. Containers restart by themselves after a crash or reboot.

### 8. First sign-in

1. Open `https://<server>` and sign in with `admin@moa.gov.et` and the temporary password; choose a new one.
2. On the server, remove the temporary password: `sed -i 's/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=/' /opt/moa-ams/.env`.
3. In the app: **Settings → Stores**, **Employees** (HR import), **Users**, and **System Settings** (whether a scanned slip is required).

Never run `npm run db:seed` against a server: it loads demo accounts with known passwords.

### 9. Connect Jenkins

Add the Jenkins public key to `~/.ssh/authorized_keys` and run a staging deploy: [CI-CD.md](CI-CD.md), steps 2–5.

---

## Operations

All commands run on the server, in `/opt/moa-ams`.

| Task | How |
|---|---|
| Status / logs | `docker compose ps` · `docker compose logs -f backend` (or `nginx`) |
| Running version | `curl -sk https://localhost/api/health` → `commit` |
| Restart | `docker compose restart` |
| Deploy a new version | Jenkins ([CI-CD.md](CI-CD.md)) |
| Stop | `docker compose down`, **never** with `-v` (it deletes the database and scanned slips) |

### Rolling back

Every Jenkins deploy keeps the version it replaced as `:previous`:

```bash
docker tag moa-ams-backend:previous moa-ams-backend:latest
docker tag moa-ams-nginx:previous moa-ams-nginx:latest
docker compose up -d --no-build
```

If the bad release changed data, also restore the `backups/pre-deploy-<date>.dump` taken just before it ([Restoring](#restoring)).

### Database upgrades

On start-up the backend brings the database tables up to date by itself, but **refuses** any change that would delete data. Then the backend stops, the Jenkins health check fails, and `docker compose logs backend` says *"The database needs an upgrade step that is not applied automatically."* Run the upgrade scripts that came with the release, then start again. Each one only adds tables and columns, and running one twice does no harm:

```bash
for m in 202610010001_roles_audit 202610020001_employee_registry 202610030001_reference_data \
         202610040001_password_change 202610050001_system_settings; do
  docker compose run --rm --no-deps --entrypoint "" backend \
    npx prisma db execute --file prisma/migrations/$m/migration.sql --schema prisma/schema.prisma
done
docker compose up -d --no-build
```

A new installation (empty database) never needs these scripts.

### Renewing the certificate

The `*.moa.gov.et` certificate expires (current one: **28 October 2026**). After it expires, browsers block the site. Before that date, get the renewed files from IT and, on staging first, then production:

```bash
# new fullchain.pem and privkey.pem into ssl/ (see step 6), then:
docker compose exec nginx nginx -t && docker compose restart nginx
openssl x509 -in ssl/fullchain.pem -noout -enddate        # shows the new expiry date
```

### Firewall (optional)

Docker publishes only 80 and 443. To also limit SSH to administrators and Jenkins (`10.10.20.126`), allow SSH **before** enabling the firewall, so you don't lock yourself out:

```bash
sudo ufw allow from <admin-subnet> to any port 22 proto tcp
sudo ufw allow from 10.10.20.126 to any port 22 proto tcp
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
```

---

## Backups

Two things hold all the data: the **database** (volume `moa-ams_db-data`) and the **scanned slips** (volume `moa-ams_slip-files`). Jenkins saves a database copy before every deploy in `/opt/moa-ams/backups` (kept 30 days); that doesn't replace a daily backup to another machine.

### Daily backup

Create `/etc/cron.daily/moa-ams-backup` (with `sudo`):

```bash
#!/bin/bash
set -euo pipefail
BACKUP_DIR="/var/backups/moa-ams"
DATE=$(date +%F_%H%M%S)
COMPOSE="docker compose -f /opt/moa-ams/docker-compose.yml"
mkdir -p "$BACKUP_DIR"

$COMPOSE exec -T db pg_dump -U moa_ams -Fc moa_ams > "$BACKUP_DIR/moa_ams_db_$DATE.dump"
$COMPOSE exec -T backend tar -czf - -C /app/backend/uploads . > "$BACKUP_DIR/moa_ams_slips_$DATE.tar.gz"

# Copy to a second machine: a backup that lives only on this server is lost with it
# rsync -a "$BACKUP_DIR/" /mnt/moa-backup/moa-ams/            # e.g. a mounted network share

find "$BACKUP_DIR" -type f -mtime +30 -delete
```

```bash
sudo chmod +x /etc/cron.daily/moa-ams-backup
sudo /etc/cron.daily/moa-ams-backup && ls -lh /var/backups/moa-ams
```

### Restoring

```bash
cd /opt/moa-ams
docker compose exec -T db pg_restore -U moa_ams -d moa_ams --clean --if-exists < /path/to/moa_ams_db_<date>.dump
docker compose exec -T backend tar -xzf - -C /app/backend/uploads < /path/to/moa_ams_slips_<date>.tar.gz
docker compose restart backend
```

Test a restore on staging before relying on backups: restore, sign in, and open an asset with a scanned slip.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Password prompt on `ssh` | Key not in `~/.ssh/authorized_keys2`, or wrong account name. |
| `docker: permission denied` | Log out and in again after `usermod -aG docker`. |
| Backend keeps restarting, database errors in its log | `.env` has Windows line endings or empty secrets: repeat step 5. |
| Backend log: *"The database needs an upgrade step"* | [Database upgrades](#database-upgrades). |
| nginx won't start | Missing or mismatched files in `ssl/`: `docker compose logs nginx`. |
| Browser shows "Not secure" | Opened by IP (the certificate names `*.moa.gov.et`), or the certificate expired. |
| Wrong dates in the app | Server clock: step 2. |
| Docker Desktop on the build PC stuck on "starting" | `docker desktop stop --force`, `wsl --shutdown`, start Docker Desktop again. |
