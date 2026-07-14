# RealNeed Security Notes

## Secrets

- Do not expose user API keys, `DATABASE_URL`, encryption keys, recovery tokens, or `ADMIN_PASSWORD` to the browser.
- Do not add `NEXT_PUBLIC_` to server secrets.
- Do not print API keys, admin password, recovery tokens, or Deep Dive tokens in logs.

## Source Verification

`lib/source-verifier.ts` defends against SSRF by normalizing URLs, rejecting unsupported protocols, and checking host/IP resolution before fetch.

Rules:

- No `file:`, `ftp:`, private IP, localhost, or metadata service fetches.
- Fetches use timeout, byte limit, redirect limit, global concurrency, per-host concurrency, and total budget.
- Blocked, timed out, or unverified pages cannot become valid evidence.

## Prompt Injection

Fetched page text is treated as untrusted evidence material. It can be summarized or classified, but it must not override system/developer instructions. `trust-analysis` flags obvious prompt-injection strings and lowers confidence.

## Admin

Admin login uses an HttpOnly cookie. Admin routes must call `getAdminSession()`.

Admin cannot confirm payment, inspect API key plaintext, manually deliver reports, or use payment state to control reports. Historical orders are read-only.

Admin must not see raw recovery tokens. A Deep Dive raw token is returned only once to the report owner when a link is generated.

## Rate Limits

`POST /api/judgments` uses a memory rate limiter by IP in local mode. Production can replace it with Redis through `RATE_LIMIT_PROVIDER=redis`.

## Link Revocation

Deep Dive links are stored as hashes in `ReportAccessLink`. Revoking a link changes its status to `REVOKED`; the page checks status before rendering.
