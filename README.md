# RealNeed

RealNeed is a free, open-source, evidence-first product opportunity validator.
It helps people investigate whether an idea has real user demand before they
build an MVP. It is not a generic idea generator.

## What it does

1. Uses the user's selected search API to find candidate discussions.
2. Verifies URLs, extracts content, filters inaccessible pages and unsafe URLs.
3. Separates search leads from qualifying user evidence.
4. Refuses to produce product opportunities without enough independent evidence.
5. Uses the user's selected generation API to create a free Deep Dive report.

There are two honest report modes:

- `EVIDENCE_EXECUTION`: for a READY judgment with independent qualifying evidence.
- `IDEA_SIGNAL_REPAIR`: for evidence gaps. It creates a search/interview/validation plan and never claims demand is verified.

## BYOK and cost

RealNeed is free. Third-party API calls are billed by the provider directly to
the user's own account. The official default is:

```env
REPORT_GENERATION_API_MODE=USER_PROVIDED_REQUIRED
ALLOW_INSTANCE_API_FOR_REPORTS=false
```

An invalid, expired, revoked, quota-limited, or unauthorized API credential
pauses the job. RealNeed never silently swaps to a platform key or fabricates a
replacement report.

## Quick start

```bash
npm ci
copy .env.example .env.local
npm run byok:setup-encryption
npx prisma migrate deploy
npm run dev
```

Open `http://localhost:3000`. Configure user credentials on `/api-connections`.

## Verification

`npm test` runs integration tests against the PostgreSQL database configured by
`DATABASE_URL`; apply migrations and use an isolated local test database before
running it. Static checks and the public-release allowlist do not require a
database:

```bash
npx tsc --noEmit
npm run lint
npm run open-source:check
```

For production, run a separate Worker and Redis-backed rate limiting:

```bash
npm run worker
npm run production:preflight
```

See [self-hosting](docs/self-hosting.md), [BYOK security](docs/byok-security.md),
[provider system](docs/provider-system.md), and [evidence policy](docs/evidence-policy.md).

## Temporary beta without a domain

For a short private beta on a Docker-enabled Linux server, the repository
includes a Cloudflare quick-tunnel helper. It creates local service credentials
on the server and returns a temporary HTTPS URL. The URL can change when the
tunnel is recreated and is not a substitute for a domain, ICP filing, backups,
or a production deployment.

```bash
git clone https://github.com/3512711996-ship-it/RealNeed.git
cd RealNeed
sudo bash scripts/deploy-beta-tunnel.sh
```

The official production deployment still requires a custom HTTPS domain,
separate operational controls, and the requirements in [DEPLOYMENT.md](DEPLOYMENT.md).

## Safety guarantees

- No invented URLs, Reddit posts, or mock production evidence.
- Search snippets are leads, not evidence.
- Sources that cannot be verified do not enter the evidence wall.
- System failure is reported as system failure, never as lack of demand.
- Report links are private, hashed at rest, expiring, revocable, and `noindex`.
- Users can delete their reports and associated content.

## Support

`/support` is independent from feature access. Any donation or contact option is
configured by the self-hosting instance and is always voluntary; it does not
affect permissions, report quality, quotas, worker priority, or support access.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Do not
commit credentials, user data, report links, source bodies, logs, or local paths.

## Preparing a public repository

This workspace may contain private local files that are not part of RealNeed.
Create a clean export before initializing a public repository:

```bash
npm run release:prepare -- ../realneed-open-source
cd ../realneed-open-source
npm ci
npm run open-source:check
```

The export is allowlisted and refuses to copy environment files, databases,
reports, logs, personal contact/payment assets, video exports, or LifeOS files.
Run a history-aware secret scanner such as `gitleaks detect --redact` after
initializing the new repository and before its first public push.

## License and trademark

RealNeed is licensed under AGPL-3.0-or-later. The license does not grant rights
to use the RealNeed name, logo, or official identity for modified deployments.
