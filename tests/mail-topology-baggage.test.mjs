#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const scanRoots = [
  'crates',
  'scripts',
  'configs',
  'docs',
  'specs',
  'sdks',
  'apps',
  'tests',
  'README.md',
  'AGENTS.md',
  'package.json',
];

const skipPathFragments = [
  '/target/',
  '/node_modules/',
  '/generated/',
  '/.dart_tool/',
  'mail-topology-baggage.test.mjs',
  'mail-topology-contract.test.mjs',
  'docs/topology-standard.md',
];

const allowlistPathFragments = [
  'specs/topology.spec.json',
  'scripts/mail-dev.mjs',
];

const bannedPatterns = [
  { id: 'topology v1 env key', pattern: /sdkwork_mail_TOPOLOGY/u },
  { id: 'client topology v1 env key', pattern: /VITE_sdkwork_mail_TOPOLOGY/u },
  { id: 'topology CLI flag', pattern: /--topology\b/u },
  { id: 'legacy bind env', pattern: /sdkwork_mail_API_BIND/u },
  { id: 'legacy client app api env', pattern: /VITE_mail_API_BASE_URL/u },
  { id: 'legacy client backend api env', pattern: /VITE_mail_BACKEND_API_BASE_URL/u },
  { id: 'legacy Mail dev port', pattern: /127\.0\.0\.1:18080/u },
];

function slash(value) {
  return String(value).replaceAll('\\', '/');
}

function shouldSkip(relativePath) {
  const normalized = slash(relativePath);
  return skipPathFragments.some((fragment) => normalized.includes(fragment));
}

function isAllowlisted(relativePath) {
  const normalized = slash(relativePath);
  return allowlistPathFragments.some((fragment) => normalized.endsWith(fragment));
}

function collectFiles(relativeRoot) {
  const absoluteRoot = path.join(repoRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }
  const stat = fs.statSync(absoluteRoot);
  if (stat.isFile()) {
    return [relativeRoot];
  }
  const files = [];
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = path.join(relativeRoot, entry.name);
    if (shouldSkip(relativePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...collectFiles(relativePath));
      continue;
    }
    files.push(relativePath);
  }
  return files;
}

function isTextCandidate(relativePath) {
  return /\.(?:md|mjs|json|yml|yaml|toml|rs|ps1|sh|cmd|ts|tsx|dart|env|example|txt)$/u.test(
    relativePath,
  );
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const files = scanRoots.flatMap((root) => collectFiles(root)).filter(isTextCandidate);

for (const { id, pattern } of bannedPatterns) {
  const hits = [];
  for (const relativePath of files) {
    if (isAllowlisted(relativePath)) {
      continue;
    }
    const text = readText(relativePath);
    if (pattern.test(text)) {
      hits.push(slash(relativePath));
    }
  }
  assert.equal(
    hits.length,
    0,
    `topology baggage (${id}) found in active paths: ${hits.join(', ')}`,
  );
}

const spec = JSON.parse(readText('specs/topology.spec.json'));
assert.equal(spec.schemaVersion, 5);
assert.equal(spec.archetype, 'application-http-gateway');
assert.equal(spec.defaults.developmentProfileId, 'standalone.development');

const profileDir = path.join(repoRoot, 'etc/topology');
const profileFiles = fs.readdirSync(profileDir).filter((name) => name.endsWith('.env'));
assert.ok(profileFiles.length >= 4, 'topology profile env files required');

const packageJson = JSON.parse(readText('package.json'));
assert.match(
  JSON.stringify(packageJson.dependencies ?? {}),
  /"@sdkwork\/app-topology"/u,
  'package.json must depend on @sdkwork/app-topology',
);
assert.match(
  JSON.stringify(packageJson.scripts ?? {}),
  /"dev:browser:postgres:standalone"/u,
  'package.json must expose dev:browser:postgres:standalone',
);

assert.ok(fs.existsSync(path.join(repoRoot, 'scripts/mail-dev.mjs')), 'mail-dev orchestrator required');
assert.ok(
  fs.existsSync(path.join(repoRoot, 'scripts/lib/mail-topology.mjs')),
  'mail topology adapter required',
);
assert.ok(fs.existsSync(path.join(repoRoot, 'docs/topology-standard.md')), 'topology-standard doc required');
assert.ok(
  fs.existsSync(path.join(repoRoot, 'etc/topology/README.md')),
  'etc/topology/README.md required',
);

const runtimeExample = readText('etc/examples/mail-runtime.env.example');
assert.match(
  runtimeExample,
  /SDKWORK_MAIL_APPLICATION_PUBLIC_INGRESS_BIND/u,
  'mail-runtime.env.example must document topology bind env',
);
assert.doesNotMatch(
  runtimeExample,
  /sdkwork_mail_API_BIND/u,
  'mail-runtime.env.example must not use retired sdkwork_mail_API_BIND',
);

console.log('[mail-topology-baggage] ok');
