# MajesticToolkit 2.4.0 — Team & Cloud GA

## Changes implemented in 2.4.0

This is an executable release of the pre-existing Team & Cloud application, not a contract or generated endpoint skeleton. All previous 2.3.9 identity, team, sync, directory, Knowledge, Tactical, Cloud File and Operations services remain in use. In 2.4.0 the following reliability defects and acceptance gaps were addressed:

1. **Evidence privacy:** only the owning account can read historical file revisions marked `private`, including their metadata and binary contents. Publishing a newer team-visible revision never changes the visibility of prior private revisions. Team Owner/Admin cannot override this boundary. Existing callers requesting old private revisions now correctly receive HTTP 404. Current team-visible versions remain available.
2. **Verified recovery:** `cloud:backup`, `cloud:verify-backup` and `cloud:restore` now validate the bytes, lengths and SHA-256 of every stored Cloud File blob, verify that all Cloud File revisions and current file metadata have matching blobs, and verify every stored Tactical map image's hash and length. SQLite `integrity_check`, `foreign_key_check` and snapshot SHA-256 remain mandatory. Valid 2.3.9 backup manifests remain compatible.
3. **Cross-service acceptance:** `npm run test:cloud:ga` runs a real HTTP/SQLite test spanning account creation, team invitations and roles, remote sync, Knowledge review/publication, private/shared evidence and attachment links, audit and notifications, revocation, persistence, backup and verified offline restore. Additional regression tests cover disclosure of private historical binary versions and detection of content-level database corruption.
4. **Reproducible artifacts:** version 2.4.0 in all four browser manifests, package metadata and CI artifact names; `npm run verify` builds and validates all four browser packages and SHA-256 sums. The Cloud GA integration suite is run separately in CI as well as through `npm test`.

## Install / upgrade

Apply *only changed files* over a **complete 2.3.9** checkout. Before any migration, take and verify an external backup of the server database (do not put this database or tokens in the browser extension ZIP).

```bash
npm run cloud:backup -- ./cloud-identity/data/identity.sqlite ./backup-before-240.sqlite
npm run cloud:verify-backup -- ./backup-before-240.sqlite
npm run verify
npm run test:cloud:ga
npm run cloud:load
npm run cloud:identity
```

The server continues using the 2.3.9 SQLite schema. No data-destructive schema migration is required. The extension keeps its existing local data and remains functional without cloud login. Team operations and sync continue to require explicit account/team authentication and per-profile opt-in.

For restore, stop the server first, ensure no WAL or SHM files remain, and run:

```bash
npm run cloud:restore -- ./backup-before-240.sqlite ./cloud-identity/data/identity.sqlite --yes
```

A failed consistency check **must block recovery**, not silently restore corrupt evidence. Prior destination files are preserved for recovery. A `.sha256.json` sidecar is integrity metadata, **not an authenticated digital signature**: store backups in access-controlled locations with separate protection.

## Production deployment gates not covered by local automated checks

- Provision and operate a trusted **HTTPS** endpoint with an appropriate certificate/key pair; configure `CLOUD_HOST`, `CLOUD_PORT`, `CLOUD_TLS_CERT_FILE`, `CLOUD_TLS_KEY_FILE`, `CLOUD_ALLOWED_ORIGINS`, `CLOUD_DB_PATH`, and the protected `CLOUD_OPERATIONS_TOKEN` as described in the 2.3.9 operations notes. Public plain HTTP is not supported.
- Verify real installed Chromium, Firefox, Firefox Android and Safari extensions, including browser-specific permissions, identity, storage durability and network recovery. CI DOM fixtures do not replace device acceptance, and Safari packaging/signing requires Apple tooling.
- Conduct an independent security review, prolonged representative load testing, external backup scheduling, off-host disaster-recovery drills and measure operational RPO/RTO. Current `cloud:load` is a **local concurrency smoke test**, not a production throughput SLA.
- Audit server host security (database permissions, filesystem backups, certificate rotation, secret access), support/incident runbooks and customer data policy before exposing the service to untrusted users.

**Scope:** Server-side cloud storage is self-hosted and requires deployment. Cloud sync covers families, organizations and product catalog; Tactical Workspace remains explicitly published/pulled, not a real-time multiuser editor. Files remain SQLite-backed with existing 32 MiB per-file and 256 MiB per-profile limits. No external hosted SaaS deployment, 24x7 monitoring or app-store signing is claimed by this release.
