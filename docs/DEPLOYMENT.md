# Deploying the Asset Tracking System

How to install the system on a real server, keep it running, and upgrade it.
For running it on your own computer during development, see the root `README.md`.

The quickest route is Docker: see "Docker" below.

## What runs

One Node.js process serves both the API and the web app, on one port. It needs a PostgreSQL database
and a folder on disk for uploaded slips.

```
browser ──HTTPS──> reverse proxy (nginx / IIS) ──HTTP──> Node app (port 3000) ──> PostgreSQL
                                                              └──> backend/uploads/slips
```

## Requirements

- Node.js 20 or newer, npm 10 or newer
- PostgreSQL 15 or newer
- A reverse proxy that provides HTTPS (nginx, IIS, Caddy…)
- The server's time zone set to **Africa/Addis_Ababa**. "Today's date" on slips and in the audit log
  comes from the server's clock. Set the machine's time zone, or start the app with `TZ=Africa/Addis_Ababa`.

## Two ways to install

- **With Docker** (next section): one command starts the app and its database. Nothing else is installed
  on the server apart from Docker itself.
- **Directly on the server** (sections 1 to 4): Node.js and PostgreSQL are installed on the server and the
  app is kept running with a process manager.

Both run the same code and need the same reverse proxy for HTTPS. Pick one; do not mix them on one server.

## Docker

### What you need

- Docker Engine 24 or newer with the Compose plugin (`docker compose version` should answer)
- A reverse proxy on the server that provides HTTPS, as in the "HTTPS" section below

### First start

```bash
git clone https://github.com/MoA-Eth/asset-tracking-system.git
cd asset-tracking-system
cp .env.docker.example .env
```

Open `.env` and fill in:

| Setting | What to put |
| :--- | :--- |
| `POSTGRES_PASSWORD` | A long random password for the database (letters and numbers) |
| `JWT_SECRET` | A random value of at least 32 characters; the file shows a command that makes one |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The first System Administrator. The password needs 12 or more characters with letters and numbers |
| `APP_BIND` | Leave `127.0.0.1:3000` when a reverse proxy on the same server provides HTTPS |

Then:

```bash
docker compose up -d --build
docker compose logs -f app      # wait for "REST API running", then Ctrl+C
```

The first start creates the database tables and the administrator. The administrator signs in with the
email and password from `.env` and is asked to choose a new password straight away. After that first
sign-in, remove `ADMIN_PASSWORD` from `.env`; it is not used again.

Point the reverse proxy at `http://127.0.0.1:3000` (the nginx example under "HTTPS" applies unchanged),
then continue with "2. First steps in the app".

### Day-to-day

```bash
docker compose ps               # both services should say "healthy"
docker compose logs --tail 100 app
docker compose restart app
docker compose down             # stop; the data stays
```

Never run `docker compose down -v`: the `-v` deletes the database and the scanned slips.

### Backups

Two things hold data: the database, and the scanned slips. Back up both, at the same time.

```bash
# database
docker compose exec -T db pg_dump -U moa_ams -Fc moa_ams > moa_ams-$(date +%F).dump
# scanned slips
docker compose cp app:/app/backend/uploads ./slips-$(date +%F)
```

To restore onto a fresh installation: start it once, then

```bash
docker compose exec -T db pg_restore -U moa_ams -d moa_ams --clean --if-exists < moa_ams-2026-10-02.dump
docker compose cp ./slips-2026-10-02/. app:/app/backend/uploads
docker compose restart app
```

### Updating

```bash
git pull
docker compose up -d --build
```

Take a backup first. On start, the app brings the database tables up to date by itself when the change
only adds things. If a version needs a change that could lose data, the app refuses to start and says so
in `docker compose logs app`; run the upgrade script named in that version's notes (the files are under `backend/prisma/migrations`), for example

```bash
docker compose run --rm --entrypoint "" app npx prisma db execute \n  --file prisma/migrations/202610050001_system_settings/migration.sql --schema prisma/schema.prisma
docker compose up -d
```

### Time zone

The containers run in `Africa/Addis_Ababa`, so "today" on slips and in the audit log is the Ethiopian
day. To change it, set `TZ` in `.env`.

## 1. First installation

```bash
git clone https://github.com/MoA-Eth/asset-tracking-system.git
cd asset-tracking-system
npm run install:all
```

### Settings

Create `backend/.env` (never commit it):

```bash
PORT=3000
NODE_ENV=production
DATABASE_URL="postgresql://<user>:<password>@<host>:5432/moa_ams?schema=public"
JWT_SECRET="<64 random hex characters>"
TRUST_PROXY=1
CORS_ORIGIN=""
```

| Setting | What it is |
| :--- | :--- |
| `NODE_ENV=production` | Required. Turns off query logging and the demo seed, and makes `JWT_SECRET` mandatory. |
| `DATABASE_URL` | Use a database user with its own strong password, not `postgres:postgres`. |
| `JWT_SECRET` | Signs sign-in sessions. Generate with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. The server refuses to start in production without one. Changing it signs everyone out. |
| `TRUST_PROXY=1` | Set when the app is behind one reverse proxy, so the sign-in limit sees each person's real address. |
| `CORS_ORIGIN` | Leave empty. The API then only answers the app's own pages. List other addresses (comma-separated) only if a separate website must call the API. |

The frontend needs no settings for production: it calls `/api` on the same address it was loaded from.

### Database and first administrator

```bash
cd backend
npm run db:push                     # creates the tables in an empty database

ADMIN_EMAIL="admin@moa.gov.et" \
ADMIN_PASSWORD="<at least 12 characters, letters and numbers>" \
ADMIN_NAME="<full name>" \
ADMIN_EMPLOYEE_ID="<employee ID>" \
npm run db:seed:production
```

`db:seed:production` creates one System Administrator and nothing else: no demo items, no demo staff, no shared
password. The administrator is asked to choose a new password at first sign-in. Running it again changes nothing.

Do **not** run `npm run db:seed` or `npm run db:setup` on a real installation. They load demo data and are
refused when `NODE_ENV=production`.

### Build and start

```bash
cd ..            # repository root
npm run build    # builds backend/dist and frontend/dist
cd backend
npm start        # node dist/server.js
```

Run it under a process manager so it restarts after a crash or a reboot, for example:

```bash
npm install -g pm2
pm2 start dist/server.js --name asset-tracking --cwd /path/to/asset-tracking-system/backend
pm2 save && pm2 startup
```

Check it: `curl http://localhost:3000/api/health` should answer `"status":"healthy"`.

### HTTPS

Put the app behind a reverse proxy with a certificate, and do not expose port 3000 to the network.
Sign-in passwords and sessions travel in every request, so plain HTTP is not acceptable. Example for nginx:

```nginx
server {
  listen 443 ssl;
  server_name assets.moa.gov.et;
  ssl_certificate     /etc/ssl/certs/assets.crt;
  ssl_certificate_key /etc/ssl/private/assets.key;

  client_max_body_size 12m;          # slips are up to 10 MB

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
server { listen 80; server_name assets.moa.gov.et; return 301 https://$host$request_uri; }
```

## 2. First steps in the app

Sign in as the administrator, choose a new password, then:

1. **Settings → Stores**: add each store and the locations inside it.
2. **Settings → Employees**: import HR's staff list (Import from Excel), or add staff by hand. Departments are created from this data.
3. **Settings → Users → Add user**: give sign-in to the Data Encoder, Team Leader, Department Head and Manager.
   Each gets a temporary password and must choose their own at first sign-in.
4. **Settings → Roles**: review what each role is allowed to do.

## 3. Backups

Two things hold the data. Back up both, every day, to a different machine:

```bash
pg_dump -Fc "$DATABASE_URL" > moa_ams-$(date +%F).dump     # the database
tar czf slips-$(date +%F).tar.gz backend/uploads/slips      # scanned slips
```

To restore: `pg_restore --clean --dbname "$DATABASE_URL" moa_ams-<date>.dump`, and unpack the slips archive
back into `backend/uploads/slips`. Test a restore once before going live.

## 4. Upgrading to a new version

```bash
pg_dump -Fc "$DATABASE_URL" > before-upgrade.dump    # always back up first
git pull
npm run install:all
cd backend
# run the upgrade scripts added since your version, oldest first (see the table below)
cd .. && npm run build
pm2 restart asset-tracking
```

Database upgrade scripts, in order. Each is safe to run more than once:

| Script | Adds |
| :--- | :--- |
| `npm run db:upgrade:roles` | Saved permission matrix, user audit entries |
| `npm run db:upgrade:employees` | Staff without sign-in, job title, unit, gender, deactivation |
| `npm run db:upgrade:reference` | Stores that contain locations (converts existing locations) |
| `npm run db:upgrade:passwords` | Temporary passwords |
| `npm run db:upgrade:settings` | System settings (whether a scanned slip is required) |

Use these scripts on a database that already has data. `npm run db:push` is only for a new, empty database:
on an existing one it can drop columns without converting what was in them.

## 5. What the system protects, and what it doesn't

- Passwords are stored hashed. A password set by an administrator is temporary and must be replaced at first sign-in.
- After 5 wrong passwords for one account (or 30 from one address) in 15 minutes, sign-in is refused for the rest of that window.
  This count is kept in memory: it resets if the app restarts, and it is per server.
- Sessions last 8 hours. Deactivating someone or removing their sign-in ends their session at their next action.
- Uploaded slips are only served to signed-in people.
- The app does not provide HTTPS, backups or a firewall. Those come from the server it runs on.
