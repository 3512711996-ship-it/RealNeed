# Self-hosting

1. Copy `.env.example` to `.env.local` and set PostgreSQL plus an encryption key.
2. Run `npm ci`, `npx prisma migrate deploy`, and `npm run dev`.
3. For production set `JOB_EXECUTION_MODE=worker`, use Redis, and start both web
   and `npm run worker`.
4. Keep `REPORT_GENERATION_API_MODE=USER_PROVIDED_REQUIRED` and
   `ALLOW_INSTANCE_API_FOR_REPORTS=false` unless you explicitly accept the cost
   and security responsibilities of providing an instance API.
