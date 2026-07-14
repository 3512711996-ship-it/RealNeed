# Open-Source Release Checklist

Use this checklist on the clean export directory, not the surrounding private workspace.

## Repository contents

- [ ] `LICENSE`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md` are present.
- [ ] `CHANGELOG.md` and release notes are current.
- [ ] `.env.example` contains only empty/example values.
- [ ] No local database dump, report, log, user content, contact asset, payment asset, video export, or absolute local path is present.
- [ ] `docker-compose.yml`, `.env.production.example`, Dockerfile, Prisma migrations, Worker, Redis configuration, and cleanup scripts are present.
- [ ] GitHub issue and pull-request templates are present.

## Product guarantees

- [ ] Reports are free and require a user-selected API credential in the official configuration.
- [ ] The application does not silently fall back to an instance provider key.
- [ ] Payment, manual delivery, refunds, and support status cannot control report access.
- [ ] `/support` is voluntary and independent from every feature.
- [ ] Evidence failures and provider failures remain distinct in the UI and API.

## Verification

- [ ] Run `npm ci`.
- [ ] Run `npx prisma migrate deploy` against a disposable PostgreSQL database.
- [ ] Run `npx prisma generate`, `npm run db:check`, `npm run lint`, `npx tsc --noEmit`, `npm test`, and `npm run build`.
- [ ] Run browser and mobile Playwright tests when their service dependencies are available.
- [ ] Run `npm run open-source:check` and a history-aware scan such as `gitleaks detect --redact` after initializing the clean repository.
- [ ] Run `docker compose config`; start a disposable stack and check web, Worker, and cleanup health.
- [ ] Verify a real user-owned search and generation credential on the deployed environment.

## Before publishing

- [ ] Rotate any key ever pasted into chat, a terminal, or a local file.
- [ ] Set repository description, topics, issue labels, and release notes manually.
- [ ] Configure HTTPS, PostgreSQL backups, Redis, a separate Worker, alerting, and a production domain.
- [ ] Do not make a repository public until every previous item is complete.
