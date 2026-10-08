# On-premise server setup

How to install the Asset Tracking System on a new Ministry server, step by step. The servers have **no internet access**, so everything they need is prepared on a machine that has it and copied over. Once a server runs, releases go out through Jenkins: see [CI-CD.md](CI-CD.md). Background and options are in [DEPLOYMENT.md](DEPLOYMENT.md).

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
                                              runs 3 containers: db, backend, nginx
```

The build machine can be a developer PC with Docker Desktop, or the Jenkins server.

## Key facts

| Item | Production | Staging |
|---|---|---|
| Address | 10.10.20.155 (`ams.moa.gov.et`) | 10.10.20.156 (`ams-staging.moa.gov.et`) |
| Host name | `moaasset` | `moaasset-stg` |
| Account | `assetmgtp` | `assetmgts` |
| `APP_ENV` | `prod` | `stage` |
| App folder | `/opt/moa-ams` | `/opt/moa-ams` |
| Health check | `https://<address>/api/health` | same |

Requirements: Ubuntu 24.04, 4+ CPUs, 8 GB RAM (4 GB is enough for staging), 50 GB+ free disk, and an account with `sudo`.

---

## Steps

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

**(build)** Download the five packages for Ubuntu 24.04 from `https://download.docker.com/linux/ubuntu/dists/noble/pool/stable/amd64/` (newest versions of each):

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
3. In the app: **Settings → Stores**, **Employees** (HR import), **Users**.

Never run `npm run db:seed` against a server: it loads demo accounts with known passwords.

### 9. Connect Jenkins

Add the Jenkins public key to `~/.ssh/authorized_keys` and run a staging deploy: [CI-CD.md](CI-CD.md), steps 2–5.

---

## Maintenance

| Task | How (in `/opt/moa-ams`) |
|---|---|
| Status / logs | `docker compose ps` · `docker compose logs -f backend` |
| Running version | `curl -sk https://localhost/api/health` → `commit` |
| Restart | `docker compose restart` |
| Replace the certificate | New `fullchain.pem` + `privkey.pem` in `ssl/`, then `docker compose restart nginx` |
| Deploy a new version | Jenkins ([CI-CD.md](CI-CD.md)) |
| Stop | `docker compose down`, **never** with `-v` (it deletes the database and scanned slips) |
| Backups | [DEPLOYMENT.md](DEPLOYMENT.md) §7 |

## Troubleshooting

| Symptom | Fix |
|---|---|
| Password prompt on `ssh` | Key not in `~/.ssh/authorized_keys2`, or wrong account name. |
| `docker: permission denied` | Log out and in again after `usermod -aG docker`. |
| Backend restarts, log says `JWT_SECRET must be…` or database errors | `.env` has Windows line endings or empty secrets: repeat step 5. |
| nginx won't start | Missing or mismatched files in `ssl/`: check with `docker compose logs nginx`. |
| Wrong dates in the app | Server clock: step 2. |
| Docker Desktop on the build PC stuck on "starting" | `docker desktop stop --force`, `wsl --shutdown`, start Docker Desktop again. |
