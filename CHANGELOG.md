# Changelog

All notable changes to RealNeed are documented here.

## Unreleased

- Converted Deep Dive delivery to a free, BYOK-only flow.
- Added encrypted per-user search and generation provider connections.
- Kept evidence-first refusal rules: no verified evidence means no product opportunity.
- Added private, revocable, expiring Deep Dive links with noindex/no-store headers.
- Moved former payment and manual-delivery controls into read-only legacy compatibility paths.
- Added an independent, configurable voluntary support page that cannot unlock features.
- Added a clean open-source export command for workspaces that also contain private files.

## Historical migration note

Older payment records and reports are retained for audit and access continuity. New
reports do not create orders, require payment confirmation, or use payment state to
decide eligibility.
