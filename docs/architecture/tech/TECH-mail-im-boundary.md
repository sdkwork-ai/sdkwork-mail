# TECH: Mail ↔ IM Boundary

Status: active  
Owner: SDKWork Mail maintainers  
Updated: 2026-06-29

Canonical user-facing summary: [../../mail-im-boundary.md](../../mail-im-boundary.md)

## Architecture

`sdkwork-mail` is a standalone communication capability. `sdkwork-im` may embed Mail SDKs but Mail must remain independent of IM runtime crates and signaling persistence.

Attachment binaries are owned by `sdkwork-drive`. Mail stores metadata and `drive_node_id` references only.

## Integration Constraints

- No `sdkwork-im` dependency in Mail Cargo manifests or TypeScript app roots.
- No RTC/media-room/recording artifact APIs in Mail OpenAPI authorities.
- Mail route manifests must cover every registered Axum route path exactly.

## Runtime Configuration

| Variable | Purpose |
|----------|---------|
| `SDKWORK_MAIL_DRIVE_MODE` | `http` opts in to the split-deployment Drive adapter; unset/`in-process` is the default |
| `SDKWORK_DRIVE_FACADE_URL` | Split-deployment only: Drive node validation endpoint, required (startup-checked) when the mode is `http` |
| `SDKWORK_AUTH_TOKEN` / `SDKWORK_ACCESS_TOKEN` | Service credentials for Drive facade calls (split deployment only) |

## Verification

```powershell
pnpm run test:contract:migration
pnpm run test:workspace-standard
```
