# Architecture

`app/` provides the Next.js UI and API routes. `lib/` holds evidence policy,
provider adapters, encrypted BYOK storage, source verification, report generation,
and the PostgreSQL-backed job queue. `worker/` claims jobs independently from the
web process. PostgreSQL stores all durable state; Redis is used for production
rate limits.

Job flow: browser session -> encrypted credential binding -> `JUDGMENT` or
`DEEP_DIVE` job -> Worker -> provider calls -> durable `JobEvent`s -> private
report link. A failed user credential pauses with `WAITING_FOR_CREDENTIAL`.
