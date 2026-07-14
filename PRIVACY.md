# RealNeed Privacy Notes

## What Is Stored

RealNeed stores:

- original idea
- interpreted idea summary
- judgment JSON
- source verification metadata and short excerpts
- evidence clusters
- job events
- API usage records

Manual pasted content is used for evidence extraction. Persisted source records store short excerpts, not an unlimited full copy.

## Recovery

Users receive a recovery URL after creating a judgment. The token is only stored as a hash. If the user loses the token, RealNeed cannot reconstruct it.

## Deletion

`DELETE /api/reports/:reportId` accepts the recovery token and soft-deletes the judgment. Active Deep Dive links for that report are revoked.

## Retention

Configurable retention:

- `REPORT_RETENTION_DAYS`
- `SOURCE_CONTENT_RETENTION_DAYS`
- `ANALYTICS_RETENTION_DAYS`

The current implementation records expiry dates for reports. Scheduled cleanup can be run by a worker task in a later deployment.

## External Verification

Automatic sources are externally verified by server fetch where possible. Manual paste is not externally verified and must be labeled as user-provided content.
