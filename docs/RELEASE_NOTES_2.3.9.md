# MajesticToolkit 2.3.9 — Cloud Operations & Reliability

Scope: cloud-identity server (Node.js 22, SQLite WAL) + Team & Cloud interface. This is executable functionality, not a schema-only foundation.

## Audit and team notifications

All new team activity, synced records, Knowledge editorial events, shared-file revisions, tactical changes and Knowledge collection operations are recorded in the same SQLite transaction as their source change. On first upgrade, existing 2.3.8 team activity and collaboration logs are backfilled **once** into `cloud_audit`. Only Owner/Admin can read `GET /v1/teams/:id/audit` (50 events per page; `before`, `limit`); responses include actor IDs and resource IDs, never binary evidence, draft content, invite tokens, passwords or session secrets. Private file revisions are excluded from the team audit.

Recipient-specific notifications are saved for significant team activity, tactical changes, selected Knowledge workflow events and **shared** file revisions. Recipients only see their own notifications via `GET /v1/teams/:id/notifications`; `POST /v1/teams/:id/notifications/:seq/read` marks an item read. The browser Team & Cloud page displays the inbox and, for admins, the audit. UI refresh is manual; no push/SMS/email provider is claimed.

## Operational monitoring

- `GET /v1/health`: minimal liveness (no authentication), no secrets.
- `GET /v1/ready`: readiness using a cached SQLite `quick_check` (maximum one check per 30 seconds).
- `GET /v1/operations/metrics`: requires `Authorization: Bearer <CLOUD_OPERATIONS_TOKEN>`; the secret must contain at least 32 characters and is provided only to the server environment. Exposes bounded request counts (2xx/4xx/5xx), sampled latency p50/p95/p99, uptime, RSS, SQLite page/freelist counts, audit count and unread notification count. This endpoint is not a public Prometheus endpoint. Configure TLS when hosting outside loopback; grant no browser access to the operator token.

Set `CLOUD_ALLOWED_ORIGINS` to your **exact** installed extension origin(s); remote deployments require `CLOUD_TLS_CERT_FILE` and `CLOUD_TLS_KEY_FILE`. The server does not trust forwarded proxy identity headers. Changes never send cloud bearer credentials to extension UI.

## Online backup and offline disaster recovery

Run from the project root with Node.js 22. The backup file path must be unique and end in `.sqlite`. It is created with 0600 permissions beside a `.sha256.json` manifest.

```sh
CLOUD_DB_PATH=./cloud-identity/data/identity.sqlite npm run cloud:identity
# In another terminal while the server runs:
node cloud-identity/ops-cli.mjs backup ./cloud-identity/data/identity.sqlite ./backups/cloud-20261120-090000.sqlite
node cloud-identity/ops-cli.mjs verify ./backups/cloud-20261120-090000.sqlite
# Stop the server cleanly, then:
node cloud-identity/ops-cli.mjs restore ./backups/cloud-20261120-090000.sqlite ./cloud-identity/data/identity.sqlite --yes
npm run cloud:identity
```

The backup uses SQLite's online backup API (consistent across WAL and all records, private files, version history and sessions). Verification checks SHA-256, file length, `PRAGMA integrity_check`, foreign keys and expected schema. The restore refuses a running server's `.run.lock`, extant WAL/SHM and modified snapshots. If the target exists, a `*.pre-restore-*.sqlite` safety copy is retained. Keep snapshots, manifests and safety copies **outside the webroot** with restricted access; they contain private evidence and hashed but still sensitive account/session data. Encrypt them using your infrastructure's secrets/KMS and test restores regularly. Restoring the entire database rolls back all changes after that snapshot, including account changes and revoked sessions: notify users and consider revoking/reissuing sessions after an incident. No continuous WAL replay, automatic cloud backups or operator RPO/RTO SLA is claimed.

**Scheduling**: use your operating-system scheduler / Kubernetes CronJob to run the backup and verify commands at your desired cadence, ship the verified snapshot and manifest to encrypted off-site storage and apply your retention policy. Do not include `.sqlite` or backup files in release packages.

## Monitoring and load smoke

`npm run cloud:load` starts an isolated ephemeral server with SQLite and runs a mixed authenticated test of 240 HTTP requests at concurrency 12 (reads + profile writes), validates absence of failed requests and persisted audit entries, and reports p95 latency. Override with `CLOUD_LOAD_REQUESTS=500 CLOUD_LOAD_CONCURRENCY=16 npm run cloud:load`. This is a reproducible local smoke, **not** a production benchmark or guarantee of capacity, latency or RPO/RTO. For production, measure under representative data volume, certificate/TLS setup, file uploads and expected traffic, and alert externally on readiness, 5xx, memory, disk and backup freshness.

## Deployment / compatibility

- Overwrite only changed files on top of a complete 2.3.8 checkout, run `npm run verify` and deploy/restart the Cloud Identity server.
- All new tables and triggers are created on startup; existing 2.3.8 records are preserved. Take a verified backup **before** migration.
- Local-only use, Backup v21, sync queues and existing client APIs remain unchanged.
- Run `npm run cloud:load`; browser CI includes the operations DOM test. Public HTTPS production and long-duration multi-tenant soak/disaster-recovery drill still require acceptance on your infrastructure.
