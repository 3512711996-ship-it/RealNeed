# Open-Source Bugs Found

## BUG-001

- Severity: P1
- Status: fixed
- Problem: the clean export copied `package.json` with a local-only video rendering command while intentionally excluding its private video script and media assets.
- Root cause: the release exporter copied the package manifest unchanged.
- Fix: the product manifest no longer includes the local video command or its binary download dependencies. Video rendering stays outside the public RealNeed release surface.
- Regression: release export validation must confirm that `video:realneed` is absent from the public manifest.

## Remaining external verification

No open code defect is currently known from the latest local BYOK run. Production-only checks remain pending because this machine does not own a public repository, hosted PostgreSQL/Redis, HTTPS domain, or deployment target.

## BUG-002

- Severity: P1
- Status: fixed
- Problem: a clean public export installed dependencies but did not generate Prisma Client before type checking or building.
- Root cause: the original workspace already had generated Prisma artifacts, masking the missing lifecycle command.
- Fix: `postinstall` now runs `prisma generate` for every clean `npm ci` installation.
- Regression: validate the clean export from an empty `node_modules` directory before publication.

## BUG-003

- Severity: P1
- Status: fixed
- Problem: the primary Compose file omitted the cleanup scheduler and could not be checked from a safe example environment because it hard-coded `.env.production`.
- Root cause: the production example and primary Compose file had diverged.
- Fix: the primary Compose file now includes the cleanup scheduler, Redis health checks, and a configurable environment file; `.env.production.example` documents every required deployment value.
- Regression: run Compose configuration validation with the example environment before publication.

## BUG-004

- Severity: P1
- Status: fixed
- Problem: a clean public `npm ci` still attempted to download an unrelated FFmpeg binary and failed on a network timeout.
- Root cause: the previous marketing-video dev dependencies remained in the lockfile after the video command was excluded from the release.
- Fix: removed video-only dependencies and regenerated the lockfile for the RealNeed application.
- Regression: run `npm ci` from an empty public export without any video download requirement.

## BUG-005

- Severity: P1
- Status: fixed
- Problem: the allowlisted public export omitted `docker-compose.yml`, so the otherwise valid Docker stack could not be validated or used by a self-hoster.
- Root cause: the release allowlist included Dockerfile but not Compose manifests.
- Fix: both Compose manifests are now allowlisted and the open-source check requires the primary Compose file.
- Regression: validate Compose from the final clean export.

## BUG-006

- Severity: P0
- Status: fixed before publication
- Problem: the original release allowlist copied the whole `docs/` directory, which also contains private LifeOS materials and generated media in this mixed workspace.
- Root cause: an overly broad documentation allowlist.
- Fix: export only named RealNeed documentation files and fail the release check if known LifeOS documentation paths appear.
- Regression: inspect the staged file list of the clean Git repository before the first push.
