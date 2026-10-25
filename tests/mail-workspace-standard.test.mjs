import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function exists(relativePath) {
  return existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("sdkwork-mail uses the SDKWork standard project-root directory dictionary", () => {
  for (const directory of [
    "apis",
    "apps",
    "crates",
    "sdks",
    "jobs",
    "tools",
    "plugins",
    "examples",
    "configs",
    "deployments",
    "scripts",
    "docs",
    "tests",
  ]) {
    assert.ok(exists(`${directory}/README.md`), `${directory}/README.md must exist`);
  }
});

test("sdkwork-mail keeps app packages under app surface roots", () => {
  assert.equal(
    exists("packages"),
    false,
    "root packages/ must not exist in the Mail authority workspace; app packages belong under apps/<app-root>/packages/",
  );
  for (const packagePath of [
    "apps/sdkwork-mail-pc/packages/sdkwork-mail-pc-core/package.json",
    "apps/sdkwork-mail-pc/packages/sdkwork-mail-pc-shell/package.json",
    "apps/sdkwork-mail-pc/packages/sdkwork-mail-pc-Mail/package.json",
    "apps/sdkwork-mail-pc/packages/sdkwork-mail-pc-admin-core/package.json",
    "apps/sdkwork-mail-pc/packages/sdkwork-mail-pc-admin-shell/package.json",
    "apps/sdkwork-mail-h5/packages/sdkwork-mail-h5-core/package.json",
    "apps/sdkwork-mail-h5/packages/sdkwork-mail-h5-shell/package.json",
    "apps/sdkwork-mail-h5/packages/sdkwork-mail-h5-Mail/package.json",
    "apps/sdkwork-mail-mini-program/packages/sdkwork-mail-mp-core/package.json",
    "apps/sdkwork-mail-mini-program/packages/sdkwork-mail-mp-shell/package.json",
    "apps/sdkwork-mail-mini-program/packages/sdkwork-mail-mp-Mail/package.json",
    "apps/sdkwork-mail-mini-program/packages/sdkwork-mail-mp-host/package.json",
    "apps/sdkwork-mail-flutter-mobile/packages/sdkwork_mail_flutter_mobile_mail/pubspec.yaml",
  ]) {
    assert.ok(exists(packagePath), `${packagePath} must exist`);
  }
});

test("sdkwork-mail mini program root exposes user Mail surface packages", () => {
  const appRoot = "apps/sdkwork-mail-mini-program";
  assert.ok(exists(`${appRoot}/agent.app.config.json`), `${appRoot}/agent.app.config.json must exist`);
  assert.ok(exists(`${appRoot}/src/app.json`), `${appRoot}/src/app.json must exist`);
  const appJson = JSON.parse(read(`${appRoot}/src/app.json`));
  assert.ok(
    appJson.pages?.includes("pages/mail-message/index"),
    `${appRoot}/src/app.json must include mail message detail page`,
  );
  const appConfig = JSON.parse(read(`${appRoot}/agent.app.config.json`));
  assert.equal(appConfig.app?.runtime?.family, "mini-program");
  const MailPackageSource = read(`${appRoot}/packages/sdkwork-mail-mp-Mail/package.json`);
  assert.match(MailPackageSource, /@sdkwork\/mail-app-sdk/u, "sdkwork-mail-mp-Mail must depend on the composed app SDK");
});

test("sdkwork-mail flutter mobile exposes app auth deep link surfaces", () => {
  const appRoot = "apps/sdkwork-mail-flutter-mobile";
  assert.ok(exists(`${appRoot}/android/app/src/main/AndroidManifest.xml`), `${appRoot} must include Android platform manifest`);
  assert.ok(exists(`${appRoot}/ios/Runner/Info.plist`), `${appRoot} must include iOS Info.plist`);
  const androidManifest = read(`${appRoot}/android/app/src/main/AndroidManifest.xml`);
  assert.match(androidManifest, /sdkworkMail/u, "Android manifest must register sdkworkMail deep link scheme");
  assert.match(androidManifest, /auth/u, "Android manifest must register auth callback host");
  const iosPlist = read(`${appRoot}/ios/Runner/Info.plist`);
  assert.match(iosPlist, /CFBundleURLSchemes/u, "iOS Info.plist must register URL schemes");
  assert.match(iosPlist, /sdkworkMail/u, "iOS Info.plist must register sdkworkMail deep link scheme");
  const appAuthGate = read(`${appRoot}/lib/app_auth_gate.dart`);
  assert.match(appAuthGate, /AppLinks/u, "Flutter app auth gate must listen for deep link callbacks");
});

test("sdkwork-mail app roots expose dual app and admin surfaces", () => {
  for (const [appRoot, MailPackage] of [
    ["apps/sdkwork-mail-pc", "sdkwork-mail-pc-Mail"],
    ["apps/sdkwork-mail-h5", "sdkwork-mail-h5-Mail"],
  ]) {
    const appSource = read(`${appRoot}/src/App.tsx`);
    assert.match(appSource, /MailApp/u, `${appRoot}/src/App.tsx must compose the user Mail surface`);
    assert.match(appSource, /AdminApp/u, `${appRoot}/src/App.tsx must compose the admin surface`);
    assert.match(
      appSource,
      /\/mail\/inbox|mail_APP_HOME_PATH/u,
      `${appRoot}/src/App.tsx must default to user Mail routes`,
    );
    const MailPackageSource = read(`${appRoot}/packages/${MailPackage}/package.json`);
    assert.match(MailPackageSource, /@sdkwork\/mail-app-sdk/u, `${MailPackage} must depend on the composed app SDK`);
  }
});

test("sdkwork-mail keeps API authority inputs under apis", () => {
  for (const apiPath of [
    "apis/app-api/communication/sdkwork-mail-app-api.openapi.json",
    "apis/backend-api/communication/sdkwork-mail-backend-api.openapi.json",
  ]) {
    assert.ok(exists(apiPath), `${apiPath} must exist`);
  }

  assert.equal(exists("generated/openapi"), false, "generated/openapi must not remain as an API input root");
});

test("sdkwork-mail uses responsibility-specific Rust crate names", () => {
  for (const cratePath of [
    "crates/sdkwork-communication-mail-service/Cargo.toml",
    "crates/sdkwork-communication-mail-repository-sqlx/Cargo.toml",
    "crates/sdkwork-routes-mail-app-api/Cargo.toml",
    "crates/sdkwork-routes-mail-backend-api/Cargo.toml",
    "crates/sdkwork-mail-service-host/Cargo.toml",
  ]) {
    assert.ok(exists(cratePath), `${cratePath} must exist`);
  }

  const crateNames = readdirSync(path.join(root, "crates"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.deepEqual(
    crateNames.filter((name) => /^sdkwork-mail-(core|storage-sqlx)$/u.test(name)),
    [],
    "legacy core/storage crate names must be removed",
  );
  assert.equal(exists("services"), false, "services must not remain as a competing top-level runtime root");
  assert.equal(exists("adapters"), false, "adapters must not remain as a competing top-level plugin root");
});

test("sdkwork-mail provider plugins live under plugins", () => {
  for (const provider of ["imap", "smtp"]) {
    assert.ok(exists(`plugins/mail-${provider}/Cargo.toml`), `plugins/mail-${provider}/Cargo.toml must exist`);
    const componentSpecPath = `plugins/mail-${provider}/specs/component.spec.json`;
    assert.ok(exists(componentSpecPath), `${componentSpecPath} must exist`);
    const componentSpec = JSON.parse(read(componentSpecPath));
    assert.equal(componentSpec.component?.domain, "communication");
    assert.equal(componentSpec.component?.capability, "mail");
  }
  const smtpCargo = read("plugins/mail-smtp/Cargo.toml");
  assert.match(smtpCargo, /lettre/u, "mail-smtp plugin must declare lettre for SMTP delivery");
  assert.match(read("plugins/mail-smtp/src/lib.rs"), /MailTransportPort/u);
  const imapLib = read("plugins/mail-imap/src/lib.rs");
  assert.match(imapLib, /MailSyncPort/u);
  assert.match(read("crates/sdkwork-communication-mail-service/src/sync.rs"), /MailSyncPort/u);
  assert.match(read("crates/sdkwork-communication-mail-service/src/sync.rs"), /sync_mailbox/u);
});

test("sdkwork-mail authority workspace does not require sdkwork-discovery without RPC services", () => {
  const cargoToml = read("Cargo.toml");
  assert.doesNotMatch(cargoToml, /sdkwork-discovery/u, "Mail has no RPC services yet; discovery is deferred");
  assert.doesNotMatch(cargoToml, /tonic|prost/u, "Mail authority workspace must not declare RPC crates before RPC services exist");
});

test("sdkwork-mail declares GitHub packaging workflow manifest", () => {
  assert.ok(exists("agent.workflow.json"), "agent.workflow.json must exist");
  assert.ok(exists(".github/workflows/package.yml"), ".github/workflows/package.yml must exist");
  assert.ok(exists(".github/workflows/Mail-governance.yml"), ".github/workflows/Mail-governance.yml must exist");
  assert.ok(exists("scripts/prepare-ci-dependencies.mjs"), "scripts/prepare-ci-dependencies.mjs must exist");
  const workflow = JSON.parse(read("agent.workflow.json"));
  assert.equal(workflow.app?.id, "sdkwork-mail");
  const dependencyIds = (workflow.dependencies ?? []).map((dependency) => dependency.id);
  const verificationDependencyIds = (workflow.verificationDependencies ?? []).map((dependency) => dependency.id);
  const packageYml = read(".github/workflows/package.yml");
  const governanceYml = read(".github/workflows/Mail-governance.yml");
  assert.match(packageYml, /SDKWORK_WEB_FRAMEWORK_REF/u, ".github/workflows/package.yml must pass SDKWORK_WEB_FRAMEWORK_REF");
  assert.match(packageYml, /SDKWORK_DATABASE_REF/u, ".github/workflows/package.yml must pass SDKWORK_DATABASE_REF");
  assert.match(packageYml, /SDKWORK_UTILS_REF/u, ".github/workflows/package.yml must pass SDKWORK_UTILS_REF");
  assert.match(packageYml, /SDKWORK_DRIVE_REF/u, ".github/workflows/package.yml must pass SDKWORK_DRIVE_REF");
  assert.match(governanceYml, /workflow:prepare-ci-dependencies/u, ".github/workflows/Mail-governance.yml must prepare sibling dependencies");
  assert.match(governanceYml, /pnpm run verify/u, ".github/workflows/Mail-governance.yml must run pnpm run verify");
  assert.ok(dependencyIds.includes("sdkwork-drive"), "agent.workflow.json must declare sdkwork-drive for Drive-backed recording import");
  assert.ok(dependencyIds.includes("sdkwork-web-framework"), "agent.workflow.json must declare sdkwork-web-framework");
  assert.ok(dependencyIds.includes("sdkwork-database"), "agent.workflow.json must declare sdkwork-database");
  assert.ok(dependencyIds.includes("sdkwork-utils"), "agent.workflow.json must declare sdkwork-utils");
  assert.ok(verificationDependencyIds.includes("sdkwork-im"), "agent.workflow.json must declare sdkwork-im for migration boundary verification");
  assert.ok(verificationDependencyIds.includes("sdkwork-core"), "agent.workflow.json must declare sdkwork-core for migration boundary verification");
  assert.equal(workflow.toolchains?.flutter, "stable", "agent.workflow.json must declare flutter toolchain for mobile verification");
});

test("sdkwork-mail authority workspace declares root component spec", () => {
  const specPath = "specs/component.spec.json";
  assert.ok(exists(specPath), `${specPath} must exist`);
  const spec = JSON.parse(read(specPath));
  assert.equal(spec.kind, "sdkwork.component.spec");
  assert.equal(spec.component?.name, "sdkwork-mail-workspace");
  assert.equal(spec.component?.domain, "communication");
  assert.equal(spec.component?.capability, "mail");
  assert.ok(Array.isArray(spec.verification?.commands) && spec.verification.commands.includes("pnpm run verify"));
  assert.ok(spec.contracts?.topologySpec, "root component spec must reference topology authority");
  assert.deepEqual(spec.contracts?.databasePrefixRegistries, ["specs/database-prefix-registry.json"]);
  assert.deepEqual(spec.contracts?.databaseTableRegistries, ["specs/database-table-registry.json"]);
});

test("sdkwork-mail runnable app roots declare component specs", () => {
  for (const [appRoot, expectation] of [
    ["apps/sdkwork-mail-pc", { name: "sdkwork-mail-pc", type: "pc-app-root" }],
    ["apps/sdkwork-mail-h5", { name: "sdkwork-mail-h5", type: "h5-app-root" }],
    ["apps/sdkwork-mail-flutter-mobile", { name: "sdkwork-mail-flutter-mobile", type: "flutter-app-root" }],
    ["apps/sdkwork-mail-mini-program", { name: "sdkwork-mail-mini-program", type: "mini-program-app-root" }],
  ]) {
    const specPath = `${appRoot}/specs/component.spec.json`;
    assert.ok(exists(specPath), `${specPath} must exist`);
    const spec = JSON.parse(read(specPath));
    assert.equal(spec.kind, "sdkwork.component.spec");
    assert.equal(spec.component?.name, expectation.name);
    assert.equal(spec.component?.type, expectation.type);
    assert.equal(spec.component?.domain, "mail", `${specPath} must declare mail domain`);
    assert.ok(spec.component?.manifests?.includes("agent.app.config.json"), `${specPath} must declare agent.app.config.json`);
  }
});

test("sdkwork-mail flutter mobile packages declare component specs", () => {
  for (const [packageDir, capability] of [
    ["apps/sdkwork-mail-flutter-mobile/packages/sdkwork_mail_flutter_mobile_core", "core"],
    ["apps/sdkwork-mail-flutter-mobile/packages/sdkwork_mail_flutter_mobile_shell", "shell"],
    ["apps/sdkwork-mail-flutter-mobile/packages/sdkwork_mail_flutter_mobile_commons", "commons"],
    ["apps/sdkwork-mail-flutter-mobile/packages/sdkwork_mail_flutter_mobile_admin_core", "admin-core"],
    ["apps/sdkwork-mail-flutter-mobile/packages/sdkwork_mail_flutter_mobile_mail", "mail"],
  ]) {
    const specPath = `${packageDir}/specs/component.spec.json`;
    assert.ok(exists(specPath), `${specPath} must exist`);
    const spec = JSON.parse(read(specPath));
    assert.equal(spec.component?.type, "flutter-package");
    assert.equal(spec.component?.capability, capability);
    assert.equal(spec.component?.domain, "communication");
  }
});

test("sdkwork-mail database registries align with repository table contracts", () => {
  assert.ok(exists("specs/database-prefix-registry.json"), "specs/database-prefix-registry.json must exist");
  assert.ok(exists("specs/database-table-registry.json"), "specs/database-table-registry.json must exist");

  const prefixRegistry = JSON.parse(read("specs/database-prefix-registry.json"));
  const tableRegistry = JSON.parse(read("specs/database-table-registry.json"));
  const repositoryLib = read("crates/sdkwork-communication-mail-repository-sqlx/src/lib.rs");
  const contractTableNames = [...repositoryLib.matchAll(/table_name:\s*"([^"]+)"/gu)].map((match) => match[1]).sort();
  const registryTableNames = tableRegistry.tables.map((entry) => entry.tableName).sort();

  assert.equal(prefixRegistry.kind, "sdkwork.database.prefixRegistry");
  assert.equal(prefixRegistry.prefixes?.[0]?.prefix, "mail");
  assert.equal(tableRegistry.kind, "sdkwork.database.tableRegistry");
  assert.equal(tableRegistry.prefixRegistry, "./database-prefix-registry.json");
  assert.deepEqual(registryTableNames, contractTableNames);
  for (const entry of tableRegistry.tables) {
    assert.equal(entry.modulePrefix, "mail", `${entry.tableName} must use mail module prefix`);
    assert.match(entry.migration, /0001_mail_baseline\.sql/u, `${entry.tableName} must reference mail baseline SQL`);
  }
});

test("sdkwork-mail .sdkwork workspace metadata is materialized without template placeholders", () => {
  for (const filePath of [
    ".sdkwork/README.md",
    ".sdkwork/skills/README.md",
    ".sdkwork/plugins/README.md",
  ]) {
    const source = read(filePath);
    assert.doesNotMatch(source, /\$name|\$specPath/u, `${filePath} must not keep SDKWork template placeholders`);
    assert.match(source, /sdkwork-mail/u, `${filePath} must identify sdkwork-mail`);
    assert.match(source, /\.\.\/sdkwork-specs\//u, `${filePath} must link to ../sdkwork-specs`);
  }
});

test("sdkwork-mail core Rust runtime crates declare component specs", () => {
  for (const crateDir of [
    "crates/sdkwork-communication-mail-service",
    "crates/sdkwork-communication-mail-repository-sqlx",
    "crates/sdkwork-routes-mail-app-api",
    "crates/sdkwork-routes-mail-backend-api",
    "crates/sdkwork-mail-service-host",
    "crates/sdkwork-api-mail-standalone-gateway",
    "crates/sdkwork-mail-app-context",
    "crates/sdkwork-mail-openapi",
    "crates/sdkwork-mail-api-registry",
  ]) {
    const specPath = `${crateDir}/specs/component.spec.json`;
    assert.ok(exists(specPath), `${specPath} must exist`);
    const spec = JSON.parse(read(specPath));
    assert.equal(spec.kind, "sdkwork.component.spec");
    assert.equal(spec.component?.domain, "communication");
    assert.equal(spec.component?.capability, "mail");
    assert.ok(Array.isArray(spec.verification?.commands) && spec.verification.commands.length > 0);
  }
});

test("sdkwork-mail integrates sdkwork-database framework for persistence bootstrap", () => {
  const repositoryCargo = read("crates/sdkwork-communication-mail-repository-sqlx/Cargo.toml");
  const databaseModule = read("crates/sdkwork-communication-mail-repository-sqlx/src/database.rs");
  const apiBootstrap = read("crates/sdkwork-api-mail-standalone-gateway/src/bootstrap.rs");

  for (const dependency of [
    "sdkwork-database-config",
    "sdkwork-database-sqlx",
    "sdkwork-database-repository",
  ]) {
    assert.match(repositoryCargo, new RegExp(dependency, "u"), `repository crate must declare ${dependency}`);
  }

  assert.match(databaseModule, /connect_mail_persistence_from_env/u, "repository must expose sdkwork-database bootstrap");
  assert.match(databaseModule, /HealthChecker/u, "repository must expose sdkwork-database health checks");
  assert.match(databaseModule, /mail_database_env_values_explicitly_configured/u, "repository must keep pure Mail database env detection");
  assert.doesNotMatch(databaseModule, /persistence_from_legacy_database_url/u, "repository must not keep legacy direct sqlx pool bootstrap");
  assert.match(apiBootstrap, /connect_mail_persistence_bootstrap_from_env/u, "standalone-gateway must bootstrap persistence through repository database module");
  assert.doesNotMatch(apiBootstrap, /create_pool_from_env/u, "standalone-gateway must not duplicate sdkwork-database pool bootstrap");
});

test("sdkwork-mail route crates do not keep legacy auth middleware modules", () => {
  assert.equal(exists("crates/sdkwork-routes-mail-app-api/src/middleware.rs"), false);
  assert.equal(exists("crates/sdkwork-routes-mail-backend-api/src/middleware.rs"), false);
  for (const filePath of [
    "crates/sdkwork-routes-mail-app-api/src/web_bootstrap.rs",
    "crates/sdkwork-routes-mail-backend-api/src/web_bootstrap.rs",
  ]) {
    const source = read(filePath);
    assert.doesNotMatch(source, /resolve_app_context/u, `${filePath} must inject AppContext from WebRequestContext`);
  }
});

test("sdkwork-mail client surfaces use app-scoped IAM session storage keys", () => {
  const pcIamSession = read("apps/sdkwork-mail-pc/packages/sdkwork-mail-pc-core/src/session/iamSession.ts");
  const h5IamSession = read("apps/sdkwork-mail-h5/packages/sdkwork-mail-h5-core/src/session/iamSession.ts");
  const mpSessionKey = read("apps/sdkwork-mail-mini-program/packages/sdkwork-mail-mp-core/src/session/sessionStorageKey.ts");
  const flutterSession = read("apps/sdkwork-mail-flutter-mobile/packages/sdkwork_mail_flutter_mobile_core/lib/src/session/app_session.dart");

  assert.match(pcIamSession, /sdkwork-mail-pc:session:v1/u);
  assert.match(h5IamSession, /sdkwork-mail-h5:session:v1/u);
  assert.match(mpSessionKey, /sdkwork-mail-mini-program:session:v1/u);
  assert.match(flutterSession, /sdkwork-mail-flutter-mobile:session:v1/u);
  assert.match(flutterSession, /mail\.messages\.read mail\.messages\.write mail\.verification\.write mail\.transactional\.write/u);
  assert.match(read("apps/sdkwork-mail-pc/src/bootstrap/adminAuth.ts"), /sdkwork-mail-pc:admin-session:v1/u);
  assert.match(read("apps/sdkwork-mail-h5/src/bootstrap/adminAuth.ts"), /sdkwork-mail-h5:admin-session:v1/u);

  for (const source of [pcIamSession, h5IamSession]) {
    assert.doesNotMatch(source, /mail_LEGACY_SESSION_STORAGE_KEY/u);
    assert.doesNotMatch(source, /legacy-session/u);
  }

  for (const filePath of [
    "apps/sdkwork-mail-mini-program/src/pages/login/index.js",
    "apps/sdkwork-mail-mini-program/src/pages/inbox/index.js",
    "apps/sdkwork-mail-mini-program/src/pages/mail-message/index.js",
  ]) {
    const source = read(filePath);
    assert.doesNotMatch(source, /["']sdkwork\.Mail\.app\.session["']/u, `${filePath} must not hardcode legacy session storage key`);
    assert.match(source, /constants\/sessionStorageKey/u, `${filePath} must import canonical session storage key`);
  }
  assert.match(
    read("apps/sdkwork-mail-mini-program/src/app.js"),
    /constants\/sessionStorageKey/u,
    "mini program app entry must import canonical session storage key",
  );
  assert.match(
    read("apps/sdkwork-mail-mini-program/src/constants/sessionStorageKey.js"),
    /LEGACY_SESSION_STORAGE_KEYS/u,
    "mini program constants must declare legacy migration keys centrally",
  );
});

test("sdkwork-mail PC app integrates appbase auth runtime factory", () => {
  const appPackage = JSON.parse(read("apps/sdkwork-mail-pc/package.json"));
  const corePackage = JSON.parse(read("apps/sdkwork-mail-pc/packages/sdkwork-mail-pc-core/package.json"));
  assert.equal(appPackage.dependencies?.["@sdkwork/auth-runtime-pc-react"], "workspace:*");
  assert.equal(appPackage.dependencies?.["@sdkwork/auth-pc-react"], "workspace:*");
  assert.equal(appPackage.dependencies?.["react-router-dom"], "^7.17.0");
  assert.equal(
    corePackage.dependencies?.["@sdkwork/auth-runtime-pc-react"],
    undefined,
    "auth runtime factory must stay at app bootstrap layer, not Mail-pc-core",
  );
  assert.match(read("apps/sdkwork-mail-pc/src/bootstrap/MailAppAuthRuntime.ts"), /createSdkworkAppbasePcAuthRuntime/u);
  assert.match(read("apps/sdkwork-mail-pc/src/bootstrap/iamRuntime.ts"), /createMailAppAuthRuntime/u);
  assert.match(read("apps/sdkwork-mail-pc/src/bootstrap/environment.ts"), /VITE_sdkwork_mail_PC_APPBASE_APP_API_BASE_URL/u);
  assert.match(read("apps/sdkwork-mail-pc/src/AppAuthGate.tsx"), /SdkworkIamAuthRoutes/u);
  assert.match(read("apps/sdkwork-mail-pc/src/App.tsx"), /HashRouter/u);
  assert.match(read("apps/sdkwork-mail-pc/vite.config.ts"), /@sdkwork\/auth-pc-react/u);
  assert.ok(
    exists("apps/sdkwork-mail-pc/src/__tests__/pc-architecture.contract.test.ts"),
    "Mail pc app must declare architecture contract tests",
  );
  assert.match(read("pnpm-workspace.yaml"), /sdkwork-auth-runtime-pc-react/u);
  assert.match(read("pnpm-workspace.yaml"), /sdkwork-auth-pc-react/u);
  assert.match(read("pnpm-workspace.yaml"), /sdkwork-iam-credential-entry/u);
});

test("sdkwork-mail H5 app integrates appbase auth runtime at bootstrap without auth-pc-react UI", () => {
  const h5Package = JSON.parse(read("apps/sdkwork-mail-h5/package.json"));
  const corePackage = JSON.parse(read("apps/sdkwork-mail-h5/packages/sdkwork-mail-h5-core/package.json"));
  assert.equal(h5Package.dependencies?.["@sdkwork/auth-runtime-pc-react"], "workspace:*");
  assert.equal(h5Package.dependencies?.["react-router-dom"], "^7.17.0");
  assert.equal(
    h5Package.dependencies?.["@sdkwork/auth-pc-react"],
    undefined,
    "H5 defers auth-pc-react UI until dedicated H5 auth surface exists",
  );
  assert.equal(
    corePackage.dependencies?.["@sdkwork/auth-runtime-pc-react"],
    undefined,
    "auth runtime factory must stay at app bootstrap layer, not Mail-h5-core",
  );
  assert.match(read("apps/sdkwork-mail-h5/src/bootstrap/MailAppAuthRuntime.ts"), /platform:\s*"h5"/u);
  assert.match(read("apps/sdkwork-mail-h5/src/bootstrap/iamRuntime.ts"), /createMailAppAuthRuntime/u);
  assert.match(read("apps/sdkwork-mail-h5/src/bootstrap/environment.ts"), /VITE_sdkwork_mail_H5_APPBASE_APP_API_BASE_URL/u);
  assert.match(read("apps/sdkwork-mail-h5/src/AppAuthGate.tsx"), /MailH5AuthLoginPage/u);
  assert.match(read("apps/sdkwork-mail-h5/src/App.tsx"), /HashRouter/u);
  assert.doesNotMatch(read("apps/sdkwork-mail-h5/src/AppAuthGate.tsx"), /SdkworkIamAuthRoutes/u);
  assert.ok(
    exists("apps/sdkwork-mail-h5/src/__tests__/h5-architecture.contract.test.ts"),
    "Mail h5 app must declare architecture contract tests",
  );
  assert.doesNotMatch(read("pnpm-workspace.yaml"), /sdkwork-auth-runtime-h5/u);
});

test("sdkwork-mail client cores declare IAM contract dependency", () => {
  for (const packagePath of [
    "apps/sdkwork-mail-pc/packages/sdkwork-mail-pc-core/package.json",
    "apps/sdkwork-mail-h5/packages/sdkwork-mail-h5-core/package.json",
  ]) {
    const packageJson = JSON.parse(read(packagePath));
    assert.equal(
      packageJson.dependencies?.["@sdkwork/iam-contracts"],
      "workspace:*",
      `${packagePath} must depend on @sdkwork/iam-contracts`,
    );
  }
  assert.match(read("pnpm-workspace.yaml"), /@sdkwork\/iam-contracts|sdkwork-iam-contracts/u);
});

test("sdkwork-mail integrates sdkwork-web-framework for HTTP route crates", () => {
  const cargoToml = read("Cargo.toml");
  for (const dependency of [
    "sdkwork-web-axum",
    "sdkwork-web-bootstrap",
    "sdkwork-web-contract",
    "sdkwork-web-core",
    "sdkwork-iam-web-adapter",
    "sdkwork-database-sqlx",
  ]) {
    assert.match(cargoToml, new RegExp(dependency, "u"), `Cargo.toml must declare ${dependency}`);
  }

  for (const filePath of [
    "crates/sdkwork-routes-mail-app-api/src/web_bootstrap.rs",
    "crates/sdkwork-routes-mail-backend-api/src/web_bootstrap.rs",
    "crates/sdkwork-routes-mail-app-api/build.rs",
    "crates/sdkwork-routes-mail-backend-api/build.rs",
  ]) {
    assert.ok(exists(filePath), `${filePath} must exist`);
  }

  const appRoutes = read("crates/sdkwork-routes-mail-app-api/src/routes.rs");
  const backendRoutes = read("crates/sdkwork-routes-mail-backend-api/src/routes.rs");
  assert.doesNotMatch(appRoutes, /enforce_app_route_auth/u, "app-api routes must not keep custom auth middleware");
  assert.doesNotMatch(backendRoutes, /enforce_backend_route_auth/u, "backend-api routes must not keep custom auth middleware");
});

test("sdkwork-mail integrates sdkwork-utils for shared Rust and TypeScript helpers", () => {
  const cargoToml = read("Cargo.toml");
  const workflow = JSON.parse(read("agent.workflow.json"));
  const dependencyIds = (workflow.dependencies ?? []).map((dependency) => dependency.id);
  const serviceLib = read("crates/sdkwork-communication-mail-service/src/lib.rs");
  const imapPlugin = read("plugins/mail-imap/src/lib.rs");

  assert.match(cargoToml, /sdkwork-utils-rust/u, "Cargo.toml must declare sdkwork-utils-rust");
  assert.ok(dependencyIds.includes("sdkwork-utils"), "agent.workflow.json must declare sdkwork-utils");
  assert.match(serviceLib, /sdkwork_utils_rust::format_datetime/u, "service crate must use sdkwork-utils datetime helpers");
  assert.match(serviceLib, /sdkwork_utils_rust::sha256_hash/u, "service crate must use sdkwork-utils crypto helpers");
  assert.match(imapPlugin, /sdkwork_utils_rust::/u, "provider plugins must use sdkwork-utils instead of local crypto helpers");
  assert.doesNotMatch(imapPlugin, /fn sha256_hex/u, "provider plugins must not keep local sha256 helpers");
  assert.match(read("pnpm-workspace.yaml"), /sdkwork-utils-typescript/u);
  assert.match(read("apps/sdkwork-mail-pc/packages/sdkwork-mail-pc-commons/package.json"), /@sdkwork\/utils/u);
  assert.match(read("apps/sdkwork-mail-h5/packages/sdkwork-mail-h5-commons/package.json"), /@sdkwork\/utils/u);
  assert.match(read("apps/sdkwork-mail-mini-program/packages/sdkwork-mail-mp-core/package.json"), /@sdkwork\/utils/u);
});

test("sdkwork-mail route manifests declare WebRequestContext and apiSurface", () => {
  for (const manifestPath of [
    "sdks/_route-manifests/app-api/sdkwork-routes-mail-app-api.route-manifest.json",
    "sdks/_route-manifests/backend-api/sdkwork-routes-mail-backend-api.route-manifest.json",
  ]) {
    const manifest = JSON.parse(read(manifestPath));
    assert.ok(Array.isArray(manifest.routes) && manifest.routes.length > 0, `${manifestPath} must declare routes`);
    for (const route of manifest.routes) {
      assert.equal(route.requestContext, "WebRequestContext", `${manifestPath} route ${route.operationId} must declare requestContext`);
      assert.ok(route.apiSurface, `${manifestPath} route ${route.operationId} must declare apiSurface`);
    }
  }
});

test("sdkwork-mail service host wires drive attachment port from env", () => {
  const bootstrapSource = read("crates/sdkwork-api-mail-standalone-gateway/src/bootstrap.rs");
  const portSource = read("crates/sdkwork-mail-service-host/src/drive_attachment_port.rs");
  const serviceHostLib = read("crates/sdkwork-mail-service-host/src/lib.rs");

  assert.match(bootstrapSource, /build_mail_drive_attachment_port_from_env/u);
  assert.match(bootstrapSource, /with_drive_attachment_port/u);
  assert.match(serviceHostLib, /build_mail_drive_attachment_port_from_env/u);
  assert.match(portSource, /SDKWORK_DRIVE_FACADE_URL/u);
  assert.match(portSource, /MailDriveAttachmentPort/u);
  assert.match(portSource, /LocalMailDriveAttachmentPort/u);
});

test("sdkwork-mail standalone-gateway wires database readiness when persistence pool is configured", () => {
  const mainSource = read("crates/sdkwork-api-mail-standalone-gateway/src/main.rs");
  const bootstrapSource = read("crates/sdkwork-api-mail-standalone-gateway/src/bootstrap.rs");
  const readinessSource = read("crates/sdkwork-api-mail-standalone-gateway/src/readiness.rs");
  const databaseModule = read("crates/sdkwork-communication-mail-repository-sqlx/src/database.rs");

  assert.match(databaseModule, /connect_mail_persistence_bootstrap_from_env/u);
  assert.match(databaseModule, /mail_database_env_explicitly_configured/u, "repository must opt in to persistence only when Mail database env is configured");
  assert.match(databaseModule, /mail_database_env_values_explicitly_configured/u, "repository must keep pure env detection helper for verification");
  assert.match(read("crates/sdkwork-communication-mail-repository-sqlx/specs/component.spec.json"), /database-prefix-registry\.json/u);
  assert.match(read("crates/sdkwork-communication-mail-repository-sqlx/specs/component.spec.json"), /database-table-registry\.json/u);
  assert.doesNotMatch(databaseModule, /persistence_from_legacy_database_url/u, "repository must not keep legacy direct sqlx pool bootstrap");
  assert.match(bootstrapSource, /MailApiBootstrap/u);
  assert.match(bootstrapSource, /database_pool/u);
  assert.match(readinessSource, /MailDatabaseReadinessCheck/u);
  assert.match(readinessSource, /check_mail_database_health/u);
  assert.match(mainSource, /MailDatabaseReadinessCheck/u);
  assert.match(mainSource, /database_pool/u);
});

test("sdkwork-mail provider webhook ingress declares framework rate-limit tier", () => {
  const backendManifest = JSON.parse(
    read("sdks/_route-manifests/backend-api/sdkwork-routes-mail-backend-api.route-manifest.json"),
  );
  const webhookRoute = backendManifest.routes.find(
    (route) => route.operationId === "mail.providerWebhooks.events.create",
  );
  assert.ok(webhookRoute, "backend manifest must declare provider webhook receive route");
  assert.equal(webhookRoute.rateLimitTier, "openApiDefault");

  const backendWebBootstrap = read("crates/sdkwork-routes-mail-backend-api/src/web_bootstrap.rs");
  assert.match(backendWebBootstrap, /RateLimitPolicy/u);
  assert.match(backendWebBootstrap, /enabled: true/u);

  const backendBuild = read("crates/sdkwork-routes-mail-backend-api/build.rs");
  assert.match(backendBuild, /rateLimitTier/u);
  assert.match(backendBuild, /with_rate_limit_tier/u);
});

test("sdkwork-mail HTTP handlers use SdkWorkApiResponse envelope mapping", () => {
  for (const filePath of [
    "crates/sdkwork-routes-mail-app-api/src/handlers.rs",
    "crates/sdkwork-routes-mail-backend-api/src/handlers.rs",
    "crates/sdkwork-routes-mail-common/src/response.rs",
  ]) {
    const source = read(filePath);
    assert.match(source, /SdkWorkApiResponse|finish_api_json/u, `${filePath} must use standard API response helpers`);
    assert.doesNotMatch(source, /MailApiEnvelope/u, `${filePath} must not keep legacy MailApiEnvelope`);
    assert.doesNotMatch(source, /request_id/u, `${filePath} must not emit legacy requestId/request_id fields`);
  }
});

test("sdkwork-mail route manifests use canonical sdkwork-routes-mail names only", () => {
  for (const manifestPath of [
    "sdks/_route-manifests/app-api/sdkwork-routes-mail-app-api.route-manifest.json",
    "sdks/_route-manifests/backend-api/sdkwork-routes-mail-backend-api.route-manifest.json",
  ]) {
    assert.ok(exists(manifestPath), `${manifestPath} must exist`);
  }
  assert.ok(
    !exists("sdks/_route-manifests/app-api/sdkwork-router-mail-app-api.route-manifest.json"),
    "duplicate sdkwork-router-mail-app-api manifest must not remain",
  );
  assert.ok(
    !exists("sdks/_route-manifests/backend-api/sdkwork-router-mail-backend-api.route-manifest.json"),
    "duplicate sdkwork-router-mail-backend-api manifest must not remain",
  );
});

test("sdkwork-mail declares OpenAPI envelope materialization tool", () => {
  assert.ok(exists("tools/materialize-mail-openapi-envelope.mjs"));
  const packageJson = JSON.parse(read("package.json"));
  assert.match(packageJson.scripts?.["api:materialize"], /materialize-mail-openapi-envelope/u);
  assert.match(packageJson.scripts?.verify, /test:contract:api-envelope/u);
});

test("sdkwork-mail manifests and tools use standard paths and route crate names", () => {
  for (const filePath of [
    "Cargo.toml",
    "tools/mail_sdk_generate.mjs",
    "tools/materialize-mail-openapi-envelope.mjs",
    "sdks/sdkwork-mail-app-sdk/sdk-manifest.json",
    "sdks/sdkwork-mail-backend-sdk/sdk-manifest.json",
    "sdks/sdkwork-mail-app-sdk/sdk-manifest.json",
    "sdks/sdkwork-mail-backend-sdk/sdk-manifest.json",
  ]) {
    const source = read(filePath);
    assert.doesNotMatch(source, /generated[\\/]openapi/u, `${filePath} must not reference generated/openapi`);
    assert.doesNotMatch(source, /sdkwork-mail-core|sdkwork-mail-storage-sqlx|sdkwork-mail-product|sdkwork-routes-Mail-/u, `${filePath} must not reference legacy Rust crate names`);
    assert.match(source, /sdkwork-routes-mail-(app|backend)-api|sdkwork-communication-mail-(service|repository-sqlx)|apis[\\/](app-api|backend-api)[\\/]communication/u, `${filePath} must reference standard names or API paths`);
  }
});
