#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(pcRoot, '..', '..');

// Node runs the TypeScript storage module through its built-in type stripping;
// the module deliberately has no imports so it stays testable without a build.
const adminSessionStorage = await import(
  pathToFileURL(
    path.resolve(
      pcRoot,
      'packages/sdkwork-mail-pc-core/src/session/adminSessionStorage.ts',
    ),
  ).href
);

const iamSessionSource = await readFile(
  path.resolve(pcRoot, 'packages/sdkwork-mail-pc-core/src/session/iamSession.ts'),
  'utf8',
);
const adminAuthSource = await readFile(
  path.resolve(pcRoot, 'src/bootstrap/adminAuth.ts'),
  'utf8',
);
const authGateSource = await readFile(path.resolve(pcRoot, 'src/AuthGate.tsx'), 'utf8');

const {
  MAIL_ADMIN_SESSION_STORAGE_KEY,
  LEGACY_MAIL_ADMIN_SESSION_STORAGE_KEYS,
  clearMailAdminSessionStorage,
  readMailAdminSessionStorage,
  resolveMailAdminSessionBindingKey,
  writeMailAdminSessionStorage,
} = adminSessionStorage;

function createMemoryStorage() {
  const records = new Map();
  return {
    getItem(key) {
      return records.has(key) ? records.get(key) : null;
    },
    setItem(key, value) {
      records.set(key, String(value));
    },
    removeItem(key) {
      records.delete(key);
    },
    keys() {
      return Array.from(records.keys());
    },
  };
}

function createStorages() {
  const sessionStorage = createMemoryStorage();
  const localStorage = createMemoryStorage();
  return { sessionStorage, localStorage };
}

const adminA = {
  accessToken: 'access-token-a',
  authToken: 'auth-token-a',
  tenantId: '100001',
  organizationId: '0',
  userId: '1',
};

const userA = { context: { tenantId: '100001', userId: '1' } };
const userB = { context: { tenantId: '100001', userId: '2' } };

test('admin session is written only to sessionStorage and bound to the current mail user', () => {
  const storages = createStorages();

  const written = writeMailAdminSessionStorage(storages, adminA, userA);

  assert.notEqual(written, null);
  assert.equal(written.boundUserSessionKey, '100001:1');
  assert.deepEqual(storages.localStorage.keys(), []);
  assert.deepEqual(storages.sessionStorage.keys(), [MAIL_ADMIN_SESSION_STORAGE_KEY]);

  const parsed = JSON.parse(storages.sessionStorage.getItem(MAIL_ADMIN_SESSION_STORAGE_KEY));
  assert.equal(parsed.accessToken, 'access-token-a');
  assert.equal(parsed.boundUserSessionKey, '100001:1');
});

test('legacy localStorage admin session is never adopted and is removed', () => {
  const storages = createStorages();
  storages.localStorage.setItem(MAIL_ADMIN_SESSION_STORAGE_KEY, JSON.stringify(adminA));
  storages.localStorage.setItem(LEGACY_MAIL_ADMIN_SESSION_STORAGE_KEYS[0], JSON.stringify(adminA));

  const restored = readMailAdminSessionStorage(storages, userA);

  assert.equal(restored, null, 'a localStorage admin session has no owner and must not be adopted');
  assert.deepEqual(storages.localStorage.keys(), []);
  assert.deepEqual(storages.sessionStorage.keys(), []);
});

test('admin session of another mail account is dropped on read', () => {
  const storages = createStorages();
  writeMailAdminSessionStorage(storages, adminA, userA);

  assert.equal(
    readMailAdminSessionStorage(storages, userA)?.accessToken,
    'access-token-a',
    'the same account keeps its admin session',
  );

  const restoredForOtherAccount = readMailAdminSessionStorage(storages, userB);
  assert.equal(restoredForOtherAccount, null);
  assert.deepEqual(storages.sessionStorage.keys(), [], 'stale admin session must be cleared');
});

test('admin session without a binding stays usable for standalone admin tabs and is cleared explicitly', () => {
  const storages = createStorages();
  writeMailAdminSessionStorage(storages, adminA, null);

  const restored = readMailAdminSessionStorage(storages, null);
  assert.equal(restored.accessToken, 'access-token-a');
  assert.equal(restored.boundUserSessionKey, undefined);

  clearMailAdminSessionStorage(storages);
  assert.deepEqual(storages.sessionStorage.keys(), []);
  assert.deepEqual(storages.localStorage.keys(), []);
});

test('binding key resolution covers context and user fallbacks', () => {
  assert.equal(resolveMailAdminSessionBindingKey(null), '');
  assert.equal(resolveMailAdminSessionBindingKey({ context: { tenantId: 't1' } }), '');
  assert.equal(
    resolveMailAdminSessionBindingKey({ context: { tenantId: 't1', userId: 'u1' } }),
    't1:u1',
  );
  assert.equal(
    resolveMailAdminSessionBindingKey({ context: { tenantId: 't1' }, user: { userId: 7 } }),
    't1:7',
  );
  assert.equal(
    resolveMailAdminSessionBindingKey({ context: { tenantId: 't1' }, user: { id: 'u2' } }),
    't1:u2',
  );
});

test('clearing the mail IAM session clears the admin session and AuthGate stops trusting localStorage', () => {
  assert.match(
    iamSessionSource,
    /clearMailAdminSessionStorage\(\{\s*localStorage: window\.localStorage,\s*sessionStorage: window\.sessionStorage,\s*\}\)/,
  );
  assert.equal(
    /window\.localStorage\.getItem\(/.test(adminAuthSource),
    false,
    'admin session must not be restored from localStorage',
  );
  assert.match(adminAuthSource, /readMailAdminSessionStorage\(storages, resolveCurrentUserSession\(\)\)/);
  assert.match(authGateSource, /mail_IAM_SESSION_CHANGED_EVENT/);
  assert.match(authGateSource, /clearAdminSession\(\)/);
  assert.equal(workspaceRoot.length > 0, true);
});
