# BYOK Security

Credentials are submitted only to server routes, encrypted with AES-256-GCM,
owned by an anonymous session hash, version-bound to jobs, and never returned
through APIs. Invalid, expired, revoked, rate-limited, or unauthorized user
credentials pause the affected job as `WAITING_FOR_CREDENTIAL`; the system does
not silently substitute an instance credential.
