# apps/

Application: sdkwork-mail
Status: active
Owner: SDKWork maintainers
Specs: APPLICATION_SPEC.md, SDKWORK_WORKSPACE_SPEC.md

## Primary App Surface

The repository root is the primary runnable app surface.
The repository root `agent.app.config.json` governs the primary application manifest.

## Directory Index

| Directory | Surface role | Runnable | Purpose | Entry |
| --- | --- | --- | --- | --- |
| sdkwork-mail-flutter-mobile | flutter-mobile | yes | SDKWork Mail Mobile flutter-mobile application root. | [README](sdkwork-mail-flutter-mobile/README.md) |
| sdkwork-mail-h5 | h5 | yes | SDKWork Mail H5 h5 application root. | [README](sdkwork-mail-h5/README.md) |
| sdkwork-mail-mini-program | mini-program | yes | SDKWork Mail Mini Program mini-program application root. | `sdkwork-mail-mini-program/` |
| sdkwork-mail-pc | pc | yes | SDKWork Mail PC pc application root. | [README](sdkwork-mail-pc/README.md) |

## Allowed Content

- Selected language/architecture application roots with `README.md`, `AGENTS.md`, `.sdkwork/`, and `specs/` when authored packages exist.
- Architecture-local `packages/`, `config/`, `src/`, `lib/`, `App/`, or `entry/` directories required by the owning architecture standard.

## Forbidden Content

- Repository-root API contracts, generated SDK workspaces, Rust crates, or deployment descriptors moved under `apps/`.
- Runtime secrets, user-private state, generated SDK transport output, or cross-application copied business logic.

## Related Specs

- `../sdkwork-specs/APPLICATION_SPEC.md`
- `../sdkwork-specs/SDKWORK_WORKSPACE_SPEC.md`
- `../sdkwork-specs/APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md`

## Verification

```bash
node ../sdkwork-specs/tools/check-apps-directory-index.mjs --root .
```
