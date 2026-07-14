#!/usr/bin/env bash

# Starts a short-lived HTTPS beta instance without a custom domain.
# The generated trycloudflare.com URL changes when the tunnel is recreated.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script with: sudo bash scripts/deploy-beta-tunnel.sh"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Engine and Docker Compose are required. Use a Docker-enabled server image."
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "OpenSSL is required to generate local secrets."
  exit 1
fi

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root_dir"

if [ -f .env.production ]; then
  echo ".env.production already exists. Refusing to overwrite an existing deployment."
  exit 1
fi

if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

postgres_password="$(openssl rand -hex 32)"
redis_password="$(openssl rand -hex 32)"
encryption_key="$(openssl rand -base64 32 | tr -d '\n')"

umask 077
{
  printf '%s\n' 'NODE_ENV=production'
  printf '%s\n' 'PUBLIC_APP_URL=https://pending.trycloudflare.com'
  printf '%s\n' "POSTGRES_PASSWORD=${postgres_password}"
  printf '%s\n' "DATABASE_URL=postgresql://realneed:${postgres_password}@postgres:5432/realneed?schema=public"
  printf '%s\n' "REDIS_PASSWORD=${redis_password}"
  printf '%s\n' "REDIS_URL=redis://:${redis_password}@redis:6379"
  printf '%s\n' 'RATE_LIMIT_PROVIDER=redis'
  printf '%s\n' "API_CREDENTIAL_ENCRYPTION_KEY=${encryption_key}"
  printf '%s\n' 'API_CREDENTIAL_ENCRYPTION_KEY_VERSION=1'
  printf '%s\n' 'REPORT_GENERATION_API_MODE=USER_PROVIDED_REQUIRED'
  printf '%s\n' 'ALLOW_INSTANCE_API_FOR_REPORTS=false'
  printf '%s\n' 'JOB_EXECUTION_MODE=worker'
  printf '%s\n' 'WORKER_ID=realneed-beta-worker-1'
  printf '%s\n' 'JOB_POLL_INTERVAL_MS=1500'
  printf '%s\n' 'JOB_LOCK_TIMEOUT_SECONDS=120'
  printf '%s\n' 'JUDGMENT_JOB_TIMEOUT_SECONDS=480'
  printf '%s\n' 'DEEP_DIVE_JOB_TIMEOUT_SECONDS=300'
  printf '%s\n' 'DATA_CLEANUP_JOB_TIMEOUT_SECONDS=300'
  printf '%s\n' 'REPORT_RETENTION_DAYS=30'
  printf '%s\n' 'REPORT_LINK_RETENTION_DAYS=30'
  printf '%s\n' 'SOURCE_CONTENT_RETENTION_DAYS=7'
  printf '%s\n' 'ANALYTICS_RETENTION_DAYS=180'
  printf '%s\n' 'API_USAGE_RETENTION_DAYS=365'
  printf '%s\n' 'JOB_EVENT_RETENTION_DAYS=30'
} > .env.production
chmod 600 .env.production

compose=(docker compose --env-file .env.production -f docker-compose.production.example.yml -f docker-compose.beta-tunnel.yml)
"${compose[@]}" up -d --build

tunnel_url=''
for _ in $(seq 1 60); do
  tunnel_url="$("${compose[@]}" logs --no-color --tail 100 cloudflared 2>&1 | grep -oE 'https://[-a-z0-9]+\.trycloudflare\.com' | tail -n 1 || true)"
  if [ -n "$tunnel_url" ]; then
    break
  fi
  sleep 2
done

if [ -z "$tunnel_url" ]; then
  echo "The beta tunnel did not provide a URL. Inspect it with: docker compose -f docker-compose.production.example.yml -f docker-compose.beta-tunnel.yml logs cloudflared"
  exit 1
fi

sed -i "s|^PUBLIC_APP_URL=.*$|PUBLIC_APP_URL=${tunnel_url}|" .env.production
"${compose[@]}" up -d --force-recreate web worker cleanup-scheduler

for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:3000/api/health/live >/dev/null; then
    echo "RealNeed beta is ready: ${tunnel_url}"
    echo "This temporary URL can change if the cloudflared container is recreated. It is not a production domain."
    exit 0
  fi
  sleep 2
done

echo "The containers started, but the local health check did not pass. Inspect status with: ${compose[*]} ps"
exit 1
