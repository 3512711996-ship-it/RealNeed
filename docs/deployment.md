# Deployment

Use `docker-compose.yml` or the production example as a starting point. Set a
real PostgreSQL URL, Redis URL, HTTPS `PUBLIC_APP_URL`, encryption key, and
`JOB_EXECUTION_MODE=worker`. Run migrations once, then run the web process and
the Worker as separate services. Do not configure platform report credentials
unless you deliberately enable instance API mode in a self-hosted deployment.
