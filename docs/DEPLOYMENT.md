# Deployment with Docker Compose

```
Browser ──► :WEB_PORT caddy ─┬─ /api/*, /auth/*, /docs, /openapi.json, /health* ──► backend:8000 (FastAPI + extraction worker)
                             └─ everything else ──────────────────────────────────► frontend:3000 (Next.js standalone)
backend ──► db:5432 (postgres:18-alpine, volume postgres-data, never published publicly)
```

Only Caddy publishes a port. The browser calls the API on the same origin, so the same
images work on `http://localhost` and on any EC2 IP without rebuilding.

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Production stack (used as-is on EC2) |
| `docker-compose.dev.yml` | Local hot-reload override; never use on EC2 |
| `deploy/Caddyfile` | Reverse-proxy routing |
| `backend/Dockerfile`, `backend/docker-entrypoint.sh` | API image; validates config and runs `alembic upgrade head` on start |
| `frontend/Dockerfile` | Next.js image (`dev` and `runner` targets) |
| `.env` (from `.env.example`) | Compose variables: DB credentials, `WEB_PORT`, `NEXT_PUBLIC_API_URL` |
| `backend/.env` | Application settings: from `backend/.env.example` locally, from `backend/.env.production.example` on EC2 |

### AWS regions per environment

| Setting | Local (`backend/.env.example`) | EC2 (`backend/.env.production.example`) |
| --- | --- | --- |
| `AWS_REGION`, `BEDROCK_REGION` | `ap-southeast-1` | `us-east-1` |
| `BEDROCK_MODEL_ID`, `BEDROCK_CHAT_MODEL_ID` | `apac.amazon.nova-lite-v1:0` | `us.amazon.nova-lite-v1:0` |
| `S3_REGION` (bucket) | `ap-southeast-1` | `ap-southeast-1` |
| `BEDROCK_KNOWLEDGE_BASE_REGION` | `ap-southeast-1` | `ap-southeast-1` |
| AWS credentials | access keys in `backend/.env` | none (instance IAM role) |

## Strict configuration

Nothing falls back to a default value:

- `docker compose` stops if a variable from `.env` is missing (`${VAR:?...}`).
- The backend validates every setting at startup and exits with a list of all missing or
  invalid keys, including any value still containing `CHANGE_ME`. Check a file without
  starting anything:
  `docker compose run --rm --no-deps --entrypoint python backend -c "import core.config"`.
- The frontend build fails if `NEXT_PUBLIC_API_URL` is not defined (an empty value is
  valid and means same-origin).
- `scripts.seed_dev` has no default password, and needs `--force` inside compose.

## Local

```bash
cp .env.example .env                    # set DB_PASSWORD
cp backend/.env.example backend/.env    # set DB_PASSWORD, JWT_SECRET_KEY (openssl rand -hex 32), AWS keys
```

Development (hot reload for backend and frontend; DB on `127.0.0.1:$DB_HOST_PORT`, API also on `127.0.0.1:8000`):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Production-like:

```bash
docker compose up -d --build
```

Seed demo users (first run only), then open `http://localhost`:

```bash
docker compose exec backend python -m scripts.seed_dev --password '<password>' --force
```

Without AWS credentials locally, set `EXTRACTION_MODE=fixture` in `backend/.env`.

## EC2 (Amazon Linux 2023, Session Manager)

The security group opens port 80, so `WEB_PORT=80`. Access is `http://PUBLIC-IP`, without
https, and the IP changes after every stop/start.

1. Launch the server from the template and connect through Session Manager:
   ```bash
   sudo su - ec2-user
   cloud-init status --wait          # must print: status: done
   ```
2. Add 2 GB of swap (the server has 1 GB RAM; builds get `Killed` without it):
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
   free -h
   ```
3. Install Docker with the Compose and Buildx plugins:
   ```bash
   sudo dnf install -y docker git
   sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user && newgrp docker
   sudo mkdir -p /usr/local/lib/docker/cli-plugins
   sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
     -o /usr/local/lib/docker/cli-plugins/docker-compose
   BUILDX=$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4)
   ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
   sudo curl -fsSL "https://github.com/docker/buildx/releases/download/${BUILDX}/buildx-${BUILDX}.linux-${ARCH}" \
     -o /usr/local/lib/docker/cli-plugins/docker-buildx
   sudo chmod +x /usr/local/lib/docker/cli-plugins/*
   docker compose version && docker buildx version
   ```
4. Get the code and create the env files:
   ```bash
   git clone https://github.com/<USERNAME_GITHUB>/<NAMA_REPO>.git && cd <NAMA_REPO>
   cp .env.example .env && cp backend/.env.production.example backend/.env
   ```
   - `.env`: a strong `DB_PASSWORD`, `WEB_PORT=80`, `NEXT_PUBLIC_API_URL=` (empty).
   - `backend/.env`: replace both `CHANGE_ME` values. Use the same `DB_PASSWORD`, and
     `JWT_SECRET_KEY=$(openssl rand -hex 32)`. Everything else is already set for
     production (Bedrock in `us-east-1` with `us.` model IDs, S3 and KB in `ap-southeast-1`,
     docs off, no CORS). **Do not add AWS access keys**, because the instance IAM role
     provides them.
5. Build and start:
   ```bash
   docker compose up -d --build
   docker compose ps                 # all services up, backend healthy
   ```
   If the build gets `Killed`, check `free -h` (swap active?) and run it again.
6. Seed the login users with a strong password:
   ```bash
   docker compose exec backend python -m scripts.seed_dev --password '<strong password>' --force
   ```
7. Check that the containers can use the IAM role:
   ```bash
   docker compose exec backend python -m scripts.check_aws
   ```
   - **No credentials found**: containers sit one network hop behind the host, so the
     IMDSv2 hop limit must be 2. Run
     `aws ec2 modify-instance-metadata-options --instance-id <id> --http-put-response-hop-limit 2 --http-endpoint enabled`
     (or ask the mentor), then `docker compose restart backend`.
   - **AccessDenied on Bedrock**: check that both model IDs use the `us.` prefix and
     `BEDROCK_REGION=us-east-1`.
   - **AccessDenied on S3**: the role needs `s3:PutObject/GetObject/DeleteObject` on the
     ap-southeast-1 bucket (cross-region access only needs bucket permissions). Invoice
     uploads and voucher downloads depend on it.
   - The chatbot retrieves from the Knowledge Base in `ap-southeast-1`. If the role is denied
     there, the chatbot fails, but extraction and the rest of the app keep working.
8. Test it: `curl -I http://localhost` on the server (200), then `http://PUBLIC-IP` from the laptop.

### Operations

```bash
git pull && docker compose up -d --build        # update
docker compose logs -f backend                  # logs (backend | frontend | caddy | db)
docker compose restart backend                  # after editing backend/.env
docker compose down                             # stop (data stays in the postgres-data volume)
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql   # backup
```

Push the code to GitHub before you terminate the instance. The disk and the database are deleted with it.
