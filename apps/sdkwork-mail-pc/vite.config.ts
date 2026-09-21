import { resolveViteEnvironment, resolveLucideReactEntry } from '../../../sdkwork-specs/tools/vite-runtime-profile.mjs';
import { resolveBrowserDistOutDir } from '../../../sdkwork-specs/tools/browser-dist-layout.mjs';

import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { createSdkworkCredentialEntryBootstrapVitePlugin } from '@sdkwork/iam-credential-entry/vite';

const MailPcRoot = path.dirname(fileURLToPath(import.meta.url));
const MailRoot = path.resolve(MailPcRoot, "../..");
const appbaseRoot = path.resolve(MailRoot, "../sdkwork-appbase");
const iamRoot = path.resolve(MailRoot, "../sdkwork-iam");
const uiRoot = path.resolve(MailRoot, "../sdkwork-ui/sdkwork-ui-pc-react");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, MailPcRoot, "");
  const bootstrapAccessToken = env.SDKWORK_ACCESS_TOKEN ?? process.env.SDKWORK_ACCESS_TOKEN;
  return {
    build: {
      outDir: resolveBrowserDistOutDir(resolveViteEnvironment(mode, process.env)),
      emptyOutDir: true,
    },
            plugins: [
              // The bootstrap credential reaches the renderer only through the shared IAM
              // plugin (dev-server HTML injection as
              // `globalThis.__SDKWORK_CREDENTIAL_ENTRY_BOOTSTRAP_ACCESS_TOKEN__`).
              // `define['process.env.SDKWORK_ACCESS_TOKEN']` is NOT a valid handoff
              // (IAM_CREDENTIAL_ENTRY_SPEC.md section 4/5).
              createSdkworkCredentialEntryBootstrapVitePlugin({
                accessToken: bootstrapAccessToken,
                environment: resolveViteEnvironment(mode, process.env),
              }),
              react(), tailwindcss(),
            ],

    server: { port: 3000 },
  };
});
