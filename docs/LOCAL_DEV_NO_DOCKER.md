# Local Development Without Docker

For contributors who do not have Docker installed. This guide covers the three backing services the backend requires beyond PostgreSQL: **Redis**, **MinIO** (object storage), and the **`.env`** wiring for both.

PostgreSQL setup is covered separately — this guide assumes your database is already running with PostGIS enabled.

---

## Prerequisites

- PostgreSQL 16+ with PostGIS extension already configured
- Node.js 20+
- pnpm installed (`npm install -g pnpm`)

---

## 1. Redis

Redis is used for caching and BullMQ background jobs (SMS, push notifications, SLA escalation, ETA, analytics).

### Windows

The official Redis build does not ship for Windows. Use one of these options:

**Option A — Memurai (recommended for Windows)**

1. Download the installer from [memurai.com](https://www.memurai.com/get-memurai)
2. Run the installer — it registers as a Windows service and starts automatically
3. Verify: open a terminal and run `memurai-cli ping` → should return `PONG`

**Option B — WSL2 + Ubuntu**

```bash
# Inside your WSL2 terminal
sudo apt update && sudo apt install redis-server -y
sudo service redis-server start

# Verify
redis-cli ping
```

### macOS

```bash
brew install redis
brew services start redis

# Verify
redis-cli ping
```

### Linux

```bash
sudo apt update && sudo apt install redis-server -y
sudo systemctl enable --now redis-server

# Verify
redis-cli ping
```

### `.env` setting

The default port is `6379`. Add this to your `.env`:

```env
REDIS_URL=redis://localhost:6379
```

---

## 2. MinIO (Object Storage)

MinIO is the local S3-compatible store for incident photos and media uploads (MOD-10). It exposes the same API as AWS S3, so the backend's S3 SDK works unchanged.

> **Only needed if you are working on photo/media upload features.** You can skip MinIO and leave the storage env vars empty if your work does not touch MOD-10.

### Windows

1. Download `minio.exe` from the [MinIO Windows quickstart](https://min.io/docs/minio/windows/index.html)
2. Place it somewhere on your `PATH` (e.g. `C:\tools\`)
3. Create a data directory and start the server:

```powershell
mkdir C:\minio-data
minio.exe server C:\minio-data --address ":9000" --console-address ":9001"
```

### macOS

```bash
brew install minio/stable/minio
mkdir ~/minio-data
minio server ~/minio-data --address :9000 --console-address :9001
```

### Linux

```bash
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
sudo mv minio /usr/local/bin/

mkdir ~/minio-data
minio server ~/minio-data --address :9000 --console-address :9001
```

### Create the bucket

After MinIO starts, open the console at `http://localhost:9001` and log in with the credentials you will set in `.env` below. Create a bucket named `agap-media`.

Alternatively, create it via the CLI using [`mc` (MinIO Client)](https://min.io/docs/minio/linux/reference/minio-mc.html):

```bash
mc alias set local http://localhost:9000 agap agap_secret
mc mb local/agap-media
```

### `.env` settings

```env
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=agap-media
STORAGE_ACCESS_KEY=agap
STORAGE_SECRET_KEY=agap_secret
STORAGE_REGION=us-east-1
```

> The `STORAGE_REGION` value does not affect local MinIO behaviour — it is required by the S3 SDK client. `us-east-1` is the safe default.

---

## 3. Cloud-hosted alternatives (zero local install)

If you prefer not to install Redis or MinIO locally, free-tier cloud services are a practical substitute for development.

| Service | Provider | Notes |
|---|---|---|
| Redis | [Upstash](https://upstash.com) | Free tier; copy the `redis://...` connection string into `REDIS_URL` |
| Object storage | [Supabase Storage](https://supabase.com) | S3-compatible; update all `STORAGE_*` vars |
| Object storage | [Cloudflare R2](https://www.cloudflare.com/r2/) | S3-compatible; generous free tier |

---

## 4. Full `.env` reference for a no-Docker setup

Below is the minimum set of variables needed to run the backend locally against native services. Copy `.env.example` to `.env` in the repo root and fill in the values marked with `←`.

```env
# Database (PostgreSQL already configured)
DATABASE_URL=postgresql://agap_user:agap_password@127.0.0.1:5432/agap_db?schema=public

# Redis
REDIS_URL=redis://localhost:6379          # ← adjust port if Memurai/WSL2 uses a different one

# Object storage (MinIO local)
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=agap-media
STORAGE_ACCESS_KEY=agap                   # ← must match what you set when starting MinIO
STORAGE_SECRET_KEY=agap_secret            # ← must match what you set when starting MinIO
STORAGE_REGION=us-east-1

# Backend
BACKEND_PORT=3000
BACKEND_HOST=0.0.0.0
NODE_ENV=development
CORS_ORIGIN=http://localhost:3001

# JWT (generate any random string for dev)
JWT_SECRET=dev_jwt_secret_change_in_prod
JWT_REFRESH_SECRET=dev_refresh_secret_change_in_prod
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

The remaining variables (`FCM_*`, `TEXTBEE_*`, `MAP_API_KEY`, etc.) are only required when working on the specific features they support. The backend starts and runs core incident flow without them.

---

## 5. Start the backend

Once all services are running:

```bash
# Install workspace dependencies
pnpm install

# Run Prisma migrations
cd backend && pnpm prisma migrate dev

# Seed the database (creates admin user and reference data)
cd backend && pnpm prisma db seed

# Start the backend in watch mode
cd backend && pnpm start:dev
```

The backend will be available at `http://localhost:3000`. The Swagger UI is at `http://localhost:3000/api`.

---

## 6. Service checklist before starting

| Service | Default port | Quick check |
|---|---|---|
| PostgreSQL | `5432` | `psql -U agap_user -d agap_db -c "SELECT PostGIS_version();"` |
| Redis | `6379` | `redis-cli ping` → `PONG` |
| MinIO | `9000` | Open `http://localhost:9000` in a browser |

All three must respond before running `pnpm start:dev`. The backend performs a health check on startup and will exit with an error message if a connection fails.
