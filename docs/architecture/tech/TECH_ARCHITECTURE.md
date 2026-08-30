# Mail Technical Architecture

Status: active  
Owner: SDKWork Mail maintainers  
Updated: 2026-06-29  
Specs: `../sdkwork-specs/ARCHITECTURE_DECISION_SPEC.md`, `../sdkwork-specs/DOCUMENTATION_SPEC.md`

## Document Map

- [TECH-2026-06-06-sdkwork-mail-authority-migration.md](TECH-2026-06-06-sdkwork-mail-authority-migration.md)
- [TECH-2026-06-09-mail-only-provider-plugin-boundary.md](TECH-2026-06-09-mail-only-provider-plugin-boundary.md)
- [TECH-mail-im-boundary.md](TECH-mail-im-boundary.md)
- [TECH-topology-standard.md](TECH-topology-standard.md)

## 1. Architecture Overview

`sdkwork-mail` is the standalone **communication / mail** authority. It delivers mailbox UX APIs, operator control-plane APIs, SMTP/IMAP transport plugins, and transactional mail flows. It does **not** own IM signaling, RTC, or media-room lifecycle.

```
Clients (PC / H5 / Flutter / Mini Program)
        │ generated SDKs (sdkwork-mail-app-sdk, sdkwork-mail-backend-sdk)
        ▼
sdkwork-web-framework (IAM, WebRequestContext, response envelope)
        │
        ├── sdkwork-routes-mail-app-api      → /app/v3/api/mail/*
        └── sdkwork-routes-mail-backend-api  → /backend/v3/api/mail/*
                │
                ▼
        sdkwork-mail-service-host (MailProductService)
                │
                ├── sdkwork-communication-mail-service (domain models, ports)
                ├── sdkwork-communication-mail-repository-sqlx (mail_* persistence)
                ├── plugins/mail-smtp, plugins/mail-imap (transport SPI)
                └── MailDriveAttachmentPort → sdkwork-drive (attachment validation)
```

**Discovery:** deferred — no gRPC services in this workspace.

## 2. Technology Choices

| Layer | Choice |
|-------|--------|
| HTTP routes | Rust + Axum via `sdkwork-web-framework` |
| Domain / ports | `sdkwork-communication-mail-service` |
| Persistence | `sdkwork-database` + SQLx (`mail_*` tables) |
| Shared helpers | `sdkwork-utils-rust` / `@sdkwork/utils` |
| API contract | OpenAPI authorities under `apis/` |
| Client SDKs | Generated from authorities + route manifests |
| Attachments | Drive node references only (`sdkwork-drive-app-sdk`) |
| Transport | Plugin SPI (`mail-smtp`, `mail-imap`) |

## 3. System Boundaries And Modules

| Module | Responsibility |
|--------|----------------|
| `crates/sdkwork-routes-mail-*-api` | HTTP handlers, IAM bootstrap, standard `{ code, data, traceId }` envelope |
| `crates/sdkwork-mail-service-host` | Product orchestration, env-driven ports (transport, drive, persistence) |
| `crates/sdkwork-communication-mail-service` | Domain types, validation, `MailDriveAttachmentPort` trait |
| `crates/sdkwork-communication-mail-repository-sqlx` | Schema, migrations, repository |
| `plugins/mail-*` | SMTP/IMAP provider implementations |
| `sdks/sdkwork-mail-*-sdk` | Generated consumer SDK families |
| `apps/sdkwork-mail-*` | Runnable client surfaces |

IM integration is one-way: `sdkwork-im` may consume Mail SDKs; Mail must not depend on IM.

## 4. Directory And Package Layout

- `apis/app-api/communication/` — app OpenAPI authority
- `apis/backend-api/communication/` — backend OpenAPI authority
- `sdks/_route-manifests/` — route metadata for SDK generation and framework bootstrap
- `crates/` — Rust service, routes, gateway host
- `apps/<app-root>/packages/` — client packages (no root-level `packages/`)
- `database/` — application-root database module for `sdkwork-database` CLI
- `etc/` — deployment env/profile config; `etc/examples/` holds config templates

## 5. API, SDK, And Data Ownership

**App API** (`/app/v3/api/mail/*`): accounts, folders, threads, messages (CRUD), verification, transactional send.

**Backend API** (`/backend/v3/api/mail/*`): provider accounts, webhooks, templates, transactional deliveries, marketing consents.

**Success envelope:** `SdkWorkApiResponse` — `{ "code": 0, "data": …, "traceId": "<uuid>" }`.

**Errors:** HTTP 4xx/5xx `application/problem+json` with numeric `code` and `traceId`.

**Data:** all mail-owned tables use `mail_` prefix. Attachment bytes live in Drive; Mail stores `mail_attachment.drive_node_id`.

## 6. Security, Privacy, And Observability

- Dual-token IAM via `sdkwork-web-framework` / `sdkwork-appbase`
- Provider credentials stored through backend control-plane; never exposed on app API
- Webhook ingress uses framework rate-limit tier (`openApiDefault`)
- Drive attachment validation: local field checks in dev; optional facade lookup when `SDKWORK_DRIVE_FACADE_URL` is set
- Readiness checks include optional Postgres pool health when persistence is configured

## 7. Deployment And Runtime Topology

Standalone gateway: `sdkwork-api-mail-standalone-gateway` bundles app + backend routes for local/dev.

Key environment variables:

| Variable | Purpose |
|----------|---------|
| `SDKWORK_DATABASE_*` | Required shared PostgreSQL persistence identity |
| `SDKWORK_DRIVE_FACADE_URL` | Drive node validation for attachments |
| `SDKWORK_AUTH_TOKEN` / `SDKWORK_ACCESS_TOKEN` | Service credentials for Drive facade |
| `SDKWORK_MAIL_SMTP_*` / `SDKWORK_MAIL_IMAP_*` | Transport plugin configuration |

See `etc/examples/mail-runtime.env.example` and `specs/topology.spec.json`.

## 8. Architecture Decision Index

| Decision | Document |
|----------|----------|
| Mail authority migration | TECH-2026-06-06-sdkwork-mail-authority-migration |
| Provider plugin boundary (SMTP/IMAP only) | TECH-2026-06-09-mail-only-provider-plugin-boundary |
| Mail ↔ IM dependency direction | TECH-mail-im-boundary |
| Topology / gateway packaging | TECH-topology-standard |

## 9. Verification

```powershell
pnpm run verify
node --test tests/mail-workspace-standard.test.mjs
node ../sdkwork-specs/tools/check-api-response-envelope.mjs --workspace .
node ../sdkwork-specs/tools/check-database-framework-standard.mjs --root .
cargo test --workspace
```
