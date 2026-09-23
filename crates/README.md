# Mail Rust Crates

## Purpose

`crates/` stores authored Rust crates for Mail service logic, SQLx repository access, route adapters, service hosts, and supporting Rust libraries.

## Owner

sdkwork-mail.

## Allowed Content

- `sdkwork-communication-mail-service/` business service logic and service ports.
- `sdkwork-communication-mail-repository-sqlx/` SQLx schema, row mapping, and repository implementation.
- `sdkwork-routes-mail-app-api/` and `sdkwork-routes-mail-backend-api/` route adapters.
- `sdkwork-mail-service-host/` in-process service container.
- Supporting Mail registry, context, and OpenAPI helper crates.

## Forbidden Content

- Generic Rust crates named with `core`, `runtime`, `product`, `backend`, `common`, or `manager` suffixes.
- Provider plugin implementations; they belong in `plugins/Mail-*`.
- Generated SDK transport output.
- API contract source files that belong in `apis/`.

## Related Specs

- `../sdkwork-specs/RUST_CODE_SPEC.md`
- `../sdkwork-specs/NAMING_SPEC.md`
- `../sdkwork-specs/API_SPEC.md`

## Verification

Run `pnpm run verify` from the repository root.

Rust crate `specs/component.spec.json` files are materialized from `tools/materialize-mail-rust-component-specs.mjs`.
