# RealNeed Deployment

RealNeed is a free, open-source BYOK application. The official default never
uses an instance generation key for reports.

## Production requirements

- HTTPS reverse proxy
- PostgreSQL 16+
- Redis shared by all web instances
- Web, Worker, and cleanup scheduler as separate processes
- A 32-byte base64 `API_CREDENTIAL_ENCRYPTION_KEY`

Set `REPORT_GENERATION_API_MODE=USER_PROVIDED_REQUIRED` and
`ALLOW_INSTANCE_API_FOR_REPORTS=false`. Users connect their own search and
generation providers. Do not set platform provider keys for normal operation.

```bash
npm ci
npx prisma migrate deploy
npm run production:preflight
npm run start:production
# separately
npm run worker
npm run cleanup:scheduler
```

Use `docker-compose.yml` as a self-hosting starting point. Do not run
`prisma migrate reset` against any existing deployment.

For Docker Compose, copy `.env.production.example` to `.env.production` and
replace every placeholder, including `DATABASE_URL`. To validate the compose file without creating a
real production file, run:

```bash
REALNEED_ENV_FILE=.env.production.example docker compose --env-file .env.production.example config
```

Before public release, verify a user-owned search and generation credential,
private report links, deletion, link revocation, Worker health, HTTPS headers,
backup restore, and secret scanning against the actual production repository.
