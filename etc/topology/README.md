# Mail topology profiles

Machine contract: `specs/topology.spec.json` (`schemaVersion: 5`, archetype `application-http-gateway`).

Platform standard: `../../sdkwork-specs/APP_RUNTIME_TOPOLOGY_ADOPTION.md`

## Active profiles

| Profile id | Command |
| --- | --- |
| `standalone.development` | `pnpm dev`, `pnpm dev:browser:postgres:standalone:local`, `pnpm dev:flutter-android`, `pnpm dev:server` |
| `cloud.development` | `pnpm dev:browser:cloud` |
| `cloud.production` | packaging / release |
| `standalone.demo` | independent demo deployment |
| `cloud.demo` | cloud demo deployment |

Loader: `scripts/lib/mail-topology.mjs` → `@sdkwork/app-topology`.
