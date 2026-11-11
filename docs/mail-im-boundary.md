# Mail ↔ IM Boundary

This document defines the dependency direction and responsibility split between `sdkwork-mail` and `sdkwork-im`.

## Dependency Direction

```
sdkwork-im (optional integrated UX)
        │
        │ may consume Mail SDKs (one-way)
        ▼
sdkwork-mail (mailbox, transport providers, transactional mail)
        │
        │ attachment binaries via Drive references
        ▼
sdkwork-drive (file storage and uploader)
```

**Rules**

| Rule | Owner |
|------|-------|
| `sdkwork-mail` must **not** depend on `sdkwork-im` crates, SDKs, APIs, or IM signaling tables | `sdkwork-mail` |
| `sdkwork-im` may depend on Mail SDK families for integrated messaging + mail UX | `sdkwork-im` |
| Mail HTTP authority lives only in `sdkwork-mail` | `sdkwork-mail` |
| IM signaling, conversation call workflow, and WebSocket call state live only in `sdkwork-im` | `sdkwork-im` |

There is no reverse dependency. Mail must not import IM contracts or expose IM-owned APIs.

## Responsibility Split

### sdkwork-mail owns

- Mailbox domain: accounts, folders, threads, messages, labels, attachments metadata
- SMTP/IMAP transport provider plugins (`plugins/mail-*`)
- Provider accounts, credentials, sync, and webhook ingress
- Transactional and verification mail flows
- Drive-backed attachment references (`mail_attachment.drive_node_id`)
- App API: `/app/v3/api/mail/*`
- Backend admin API: `/backend/v3/api/mail/*`
- SDK families: `sdkwork-mail-sdk`, `sdkwork-mail-app-sdk`, `sdkwork-mail-backend-sdk`

### sdkwork-im owns

- Instant messaging, conversation workflow, and any realtime signaling not required by standalone Mail
- IM API surfaces under `/im/v3/api/*`
- Orchestration that **consumes** Mail SDKs when embedding mail UX inside IM clients

### sdkwork-mail does **not** own

- IM message/conversation APIs
- Call signaling routes or WebSocket call subprotocols
- Duplicate Mail SDK workspaces inside IM

## Attachments And Drive

Mail never stores attachment bytes in `mail_*` tables.

1. Clients upload through **`sdkwork-drive-app-sdk`** and receive `driveNodeId`.
2. Mail create-message requests reference `attachments[].driveNodeId` plus metadata.
3. Mail validates references through `MailDriveAttachmentPort`:
   - default (all packaged deployments): **in-process** Drive call on the shared PostgreSQL pool — `DriveUploaderStore::find_active_node`/`find_active_space` plus `SqlDrivePermissionService::resolve_effective_node_access` with the `reader` role (MODULE_SPEC.md §4.2)
   - without a database (no persistence either): field validation only (`LocalMailDriveAttachmentPort`)
   - split deployment only: `SDKWORK_MAIL_DRIVE_MODE=http` + `SDKWORK_DRIVE_FACADE_URL`, validated at startup
4. Mail persists `mail_attachment.drive_node_id` only.

## API Ownership

| Concern | API prefix | Authority repo |
|---------|------------|----------------|
| User mailbox | `/app/v3/api/mail/*` | `sdkwork-mail` |
| Operator admin | `/backend/v3/api/mail/*` | `sdkwork-mail` |
| File upload | `/app/v3/api/drive/*` | `sdkwork-drive` |
| IM signaling | `/im/v3/api/*` | `sdkwork-im` |

## Verification

From `sdkwork-mail` root:

```powershell
pnpm run test:contract:migration
node --test tests/mail-workspace-standard.test.mjs
```

## Related Specs

- `../sdkwork-specs/DOMAIN_SPEC.md`
- `../sdkwork-specs/API_SPEC.md`
- `../sdkwork-specs/DRIVE_SPEC.md`
- `docs/architecture/tech/TECH-mail-im-boundary.md`
