import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readDartSources(relativeRoot) {
  const absoluteRoot = path.join(process.cwd(), relativeRoot);
  const sources = [];

  function walk(currentPath) {
    for (const entry of readdirSync(currentPath)) {
      const entryPath = path.join(currentPath, entry);
      const stats = statSync(entryPath);
      if (stats.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (entryPath.endsWith(".dart")) {
        sources.push(readFileSync(entryPath, "utf8"));
      }
    }
  }

  walk(absoluteRoot);
  return sources.join("\n");
}

test("sdkwork-mail migration contract rejects RTC media-session paths", () => {
  const appOpenApi = readFileSync(
    "apis/app-api/communication/sdkwork-mail-app-api.openapi.json",
    "utf8",
  );
  const backendOpenApi = readFileSync(
    "apis/backend-api/communication/sdkwork-mail-backend-api.openapi.json",
    "utf8",
  );
  assert.doesNotMatch(appOpenApi, /media_sessions|media_session|MailInboxs|rooms/u);
  assert.match(appOpenApi, /\/app\/v3\/api\/mail\/messages/u);
  assert.match(appOpenApi, /\/app\/v3\/api\/mail\/verification\/send/u);
  assert.match(appOpenApi, /\/app\/v3\/api\/mail\/transactional\/send/u);
  assert.doesNotMatch(backendOpenApi, /MailProviderQueryJob|MailProviderQuerySnapshot|mail-inboxs|rooms/u);
  assert.match(backendOpenApi, /\/backend\/v3\/api\/mail\/templates/u);
});

test("sdkwork-mail migration contract rejects RTC references in flutter mobile surfaces", () => {
  const flutterSource = [
    readDartSources("apps/sdkwork-mail-flutter-mobile/lib"),
    readDartSources("apps/sdkwork-mail-flutter-mobile/packages/sdkwork_mail_flutter_mobile_mail/lib"),
    readDartSources("apps/sdkwork-mail-flutter-mobile/packages/sdkwork_mail_flutter_mobile_admin_core/lib"),
    readFileSync(
      "apps/sdkwork-mail-flutter-mobile/packages/sdkwork_mail_flutter_mobile_core/lib/src/session/app_session.dart",
      "utf8",
    ),
  ].join("\n");

  assert.doesNotMatch(flutterSource, /media_sessions|media_session|volcengine|agora|ProviderQueryJob|RoomService/u);
  assert.match(flutterSource, /mail\.messages\.read/u);
  assert.match(flutterSource, /\/mail\/messages/u);
});

test("sdkwork-mail migration contract uses mail transport provider schemas only", () => {
  const schemaDir = path.join(process.cwd(), "specs/provider-schemas");
  const schemaNames = readdirSync(schemaDir).filter((name) => name.endsWith(".json")).sort();
  assert.deepEqual(schemaNames, ["imap.json", "smtp.json"]);
});

test("sdkwork-mail migration contract resolves SMTP transport from provider credentials", () => {
  const persistence = readFileSync(
    "crates/sdkwork-communication-mail-service/src/persistence.rs",
    "utf8",
  );
  const repository = readFileSync(
    "crates/sdkwork-communication-mail-repository-sqlx/src/persistence.rs",
    "utf8",
  );
  assert.match(persistence, /resolve_active_smtp_transport_binding/u);
  assert.match(repository, /mail_provider_credential/u);
  assert.match(readFileSync("plugins/mail-smtp/src/config.rs", "utf8"), /smtp_config_from_binding/u);
});

test("sdkwork-mail migration contract wires transactional delivery through SMTP transport", () => {
  const smtpPlugin = readFileSync("plugins/mail-smtp/src/lib.rs", "utf8");
  const serviceHost = readFileSync("crates/sdkwork-mail-service-host/src/service.rs", "utf8");
  const apiBootstrap = readFileSync("crates/sdkwork-api-mail-standalone-gateway/src/bootstrap.rs", "utf8");
  assert.match(smtpPlugin, /SmtpMailTransport/u);
  assert.match(smtpPlugin, /MailTransportPort/u);
  assert.match(serviceHost, /with_transport/u);
  assert.match(apiBootstrap, /build_mail_transport_from_env_arc/u);
});

test("sdkwork-mail migration contract uses mail database tables", () => {
  const schema = readFileSync("database/contract/schema.yaml", "utf8");
  assert.match(schema, /mail_message/u);
  assert.match(schema, /mail_marketing_consent/u);
  assert.doesNotMatch(schema, /mail_media_session|mail_room/u);
});

test("sdkwork-mail migration contract enforces marketing consent before marketing sends", () => {
  const transactional = readFileSync(
    "crates/sdkwork-mail-service-host/src/transactional.rs",
    "utf8",
  );
  const persistence = readFileSync(
    "crates/sdkwork-communication-mail-service/src/persistence.rs",
    "utf8",
  );
  assert.match(transactional, /has_active_marketing_consent/u);
  assert.match(persistence, /grant_marketing_consent/u);
  assert.match(
    readFileSync("apis/backend-api/communication/sdkwork-mail-backend-api.openapi.json", "utf8"),
    /\/backend\/v3\/api\/mail\/marketing_consents/u,
  );
});

test("sdkwork-mail migration contract uses real IMAP transport ping", () => {
  const imapSync = readFileSync("plugins/mail-imap/src/imap_sync.rs", "utf8");
  const imapCargo = readFileSync("plugins/mail-imap/Cargo.toml", "utf8");
  const syncTrait = readFileSync("crates/sdkwork-communication-mail-service/src/sync.rs", "utf8");
  const mailboxSync = readFileSync("crates/sdkwork-mail-service-host/src/mailbox_sync.rs", "utf8");
  assert.match(imapCargo, /async-imap/u);
  assert.match(imapSync, /Client::new/u);
  assert.match(imapSync, /\.login\(/u);
  assert.match(imapSync, /probe_mailbox/u);
  assert.match(imapSync, /sync_mailbox/u);
  assert.match(imapSync, /uid_fetch/u);
  assert.match(syncTrait, /probe_mailbox/u);
  assert.match(syncTrait, /sync_mailbox/u);
  assert.match(mailboxSync, /ingest_inbound_message/u);
  assert.match(mailboxSync, /upsert_sync_state/u);
});

test("sdkwork-mail migration contract exposes provider account create and ping APIs", () => {
  const openapi = readFileSync(
    "apis/backend-api/communication/sdkwork-mail-backend-api.openapi.json",
    "utf8",
  );
  assert.match(openapi, /mail\.providerAccounts\.create/u);
  assert.match(openapi, /mail\.providerAccounts\.ping/u);
  assert.match(openapi, /mail\.providerAccounts\.sync/u);
  assert.match(
    readFileSync("crates/sdkwork-communication-mail-service/src/persistence.rs", "utf8"),
    /create_provider_account/u,
  );
  assert.match(
    readFileSync("apps/sdkwork-mail-flutter-mobile/packages/sdkwork_mail_flutter_mobile_admin_core/lib/src/services/mail_admin_services.dart", "utf8"),
    /provider_accounts\/.*\/sync/u,
  );
});

test("sdkwork-mail migration contract aligns mail-sdk defaults to transport providers", () => {
  const assembly = readFileSync("sdks/sdkwork-mail-sdk/sdk-manifest.json", "utf8");
  const assemblyDefaults = assembly.split('"providerSelectionStandard"')[0];
  const catalog = readFileSync(
    "sdks/sdkwork-mail-sdk/sdkwork-mail-sdk-rust/src/provider_activation_catalog.rs",
    "utf8",
  );
  assert.match(assemblyDefaults, /"providerKey": "smtp"/u);
  assert.doesNotMatch(assemblyDefaults, /volcengine/u);
  assert.match(catalog, /providerKey: "smtp"/u);
  assert.match(catalog, /providerKey: "imap"/u);
  assert.doesNotMatch(catalog, /volcengine/u);
  const tsCatalog = readFileSync(
    "sdks/sdkwork-mail-sdk/sdkwork-mail-sdk-typescript/src/provider-catalog.ts",
    "utf8",
  );
  assert.match(tsCatalog, /DEFAULT_mail_PROVIDER_KEY = 'smtp'/u);
  assert.doesNotMatch(tsCatalog, /volcengine/u);
  const assemblyJson = JSON.parse(assembly);
  assert.deepEqual(
    (assemblyJson.providers ?? []).map((provider) => provider.providerKey).sort(),
    ['imap', 'smtp'],
  );
  assert.doesNotMatch(
    JSON.stringify(assemblyJson.capabilityCatalog ?? []),
    /media\.audio|volcengine|session/u,
  );
});

test("sdkwork-mail migration contract rejects RTC methods in reserved mail-sdk standard contracts", () => {
  const contractPaths = [
    "sdks/sdkwork-mail-sdk/sdkwork-mail-sdk-rust/src/lib.rs",
    "sdks/sdkwork-mail-sdk/sdkwork-mail-sdk-java/src/main/java/com/sdkwork/Mail/standard/mailStandardContract.java",
    "sdks/sdkwork-mail-sdk/sdkwork-mail-sdk-kotlin/src/main/kotlin/com/sdkwork/Mail/standard/mailStandardContract.kt",
    "sdks/sdkwork-mail-sdk/sdkwork-mail-sdk-csharp/src/SDKWork.Mail.Sdk/mailStandardContract.cs",
    "sdks/sdkwork-mail-sdk/sdkwork-mail-sdk-swift/Sources/MailSdk/mailStandardContract.swift",
    "sdks/sdkwork-mail-sdk/sdkwork-mail-sdk-go/Mailstandard/contract.go",
    "sdks/sdkwork-mail-sdk/sdkwork-mail-sdk-python/sdkwork_mail_sdk/standard_contract.py",
  ];
  const rtcPattern = /\bjoin\b|\bpublish\b|\bunpublish\b|\bmuteAudio\b|\bstartScreenShare\b/u;
  const transportPattern =
    /connectTransport|connect_transport|ConnectTransport|sendMail|send_mail|SendMail/u;

  for (const relativePath of contractPaths) {
    const source = readFileSync(relativePath, "utf8");
    assert.doesNotMatch(source, rtcPattern, relativePath);
    assert.match(source, transportPattern, relativePath);
    assert.doesNotMatch(source, /volcengine/u, relativePath);
  }
});

test("sdkwork-mail migration contract rejects legacy mail-inboxs surfaces in mini program", () => {
  const miniProgramSources = [
    readFileSync("apps/sdkwork-mail-mini-program/src/app.json", "utf8"),
    readFileSync("apps/sdkwork-mail-mini-program/src/app.js", "utf8"),
    readFileSync("apps/sdkwork-mail-mini-program/src/pages/login/index.js", "utf8"),
    readFileSync(
      "apps/sdkwork-mail-mini-program/packages/sdkwork-mail-mp-shell/src/mailRoutes.ts",
      "utf8",
    ),
  ].join("\n");

  assert.doesNotMatch(miniProgramSources, /mail-inboxs|mail inboxs/u);
  assert.match(miniProgramSources, /\/pages\/inbox\/index|#\/mail\/inbox/u);
});
