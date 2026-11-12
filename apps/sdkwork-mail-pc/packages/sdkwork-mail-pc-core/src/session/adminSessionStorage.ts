/**
 * Admin session persistence for the mail PC client.
 *
 * The admin surface shares its origin (and therefore `localStorage`) with the
 * regular mail client, so an admin session persisted in `localStorage` survived
 * account switches and let the next account open `/admin` with the previous
 * administrator's credentials. The admin session therefore lives in
 * `sessionStorage` only and is bound to the mail user session that created it.
 *
 * Legacy `localStorage` copies are never adopted: they have no owner and cannot
 * be attributed to an account.
 */

export const MAIL_ADMIN_SESSION_STORAGE_KEY = 'sdkwork-mail-pc:admin-session:v1';

export const LEGACY_MAIL_ADMIN_SESSION_STORAGE_KEYS = [
  'sdkwork.Mail.admin.session',
] as const;

export interface MailAdminSessionStorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface MailAdminSessionStorages {
  localStorage?: MailAdminSessionStorageLike | null;
  sessionStorage?: MailAdminSessionStorageLike | null;
}

export interface MailAdminSessionBindingSource {
  context?: {
    organizationId?: string;
    tenantId?: string;
    userId?: string;
  } | null;
  user?: {
    id?: string;
    userId?: string;
  } | null;
}

export interface MailAdminSessionRecord {
  accessToken: string;
  authToken: string;
  /**
   * `tenantId:userId` of the mail user session that created this admin session.
   * Empty when the admin surface was used without a mail user session.
   */
  boundUserSessionKey?: string;
  organizationId?: string;
  tenantId?: string;
  userId?: string;
}

function normalizePart(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

export function resolveMailAdminSessionBindingKey(
  session: MailAdminSessionBindingSource | null | undefined,
): string {
  if (!session || typeof session !== 'object') {
    return '';
  }

  const tenantId = normalizePart(session.context?.tenantId);
  const userId = normalizePart(session.context?.userId)
    || normalizePart(session.user?.userId)
    || normalizePart(session.user?.id);
  if (!tenantId || !userId) {
    return '';
  }

  return `${tenantId}:${userId}`;
}

export function normalizeMailAdminSessionRecord(value: unknown): MailAdminSessionRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Record<string, unknown>;
  const accessToken = normalizePart(parsed.accessToken);
  if (!accessToken) {
    return null;
  }

  const authToken = normalizePart(parsed.authToken) || accessToken;
  const tenantId = normalizePart(parsed.tenantId);
  const organizationId = normalizePart(parsed.organizationId);
  const userId = normalizePart(parsed.userId);
  const boundUserSessionKey = normalizePart(parsed.boundUserSessionKey);

  return {
    accessToken,
    authToken,
    ...(tenantId ? { tenantId } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(userId ? { userId } : {}),
    ...(boundUserSessionKey ? { boundUserSessionKey } : {}),
  };
}

export function parseMailAdminSessionRecord(raw: string | null | undefined): MailAdminSessionRecord | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }

  try {
    return normalizeMailAdminSessionRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

function tryRemove(storage: MailAdminSessionStorageLike | null | undefined, key: string): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    // Cleanup is best effort; a blocked storage must not break sign-in.
  }
}

function tryWrite(
  storage: MailAdminSessionStorageLike | null | undefined,
  key: string,
  value: string,
): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function tryRead(storage: MailAdminSessionStorageLike | null | undefined, key: string): string | null {
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Drops every `localStorage` copy (current key + legacy keys) and legacy keys. */
export function purgeLegacyMailAdminSessionStorage(storages: MailAdminSessionStorages): void {
  tryRemove(storages.localStorage, MAIL_ADMIN_SESSION_STORAGE_KEY);
  for (const legacyKey of LEGACY_MAIL_ADMIN_SESSION_STORAGE_KEYS) {
    tryRemove(storages.localStorage, legacyKey);
    tryRemove(storages.sessionStorage, legacyKey);
  }
}

export function clearMailAdminSessionStorage(storages: MailAdminSessionStorages): void {
  tryRemove(storages.sessionStorage, MAIL_ADMIN_SESSION_STORAGE_KEY);
  purgeLegacyMailAdminSessionStorage(storages);
}

/**
 * Reads the admin session from `sessionStorage` only. Returns `null` (and clears
 * the stored session) when it belongs to a different mail user than the one
 * currently signed in.
 */
export function readMailAdminSessionStorage(
  storages: MailAdminSessionStorages,
  currentUserSession?: MailAdminSessionBindingSource | null,
): MailAdminSessionRecord | null {
  purgeLegacyMailAdminSessionStorage(storages);

  const record = parseMailAdminSessionRecord(
    tryRead(storages.sessionStorage, MAIL_ADMIN_SESSION_STORAGE_KEY),
  );
  if (!record) {
    return null;
  }

  const currentBindingKey = resolveMailAdminSessionBindingKey(currentUserSession);
  if (record.boundUserSessionKey && record.boundUserSessionKey !== currentBindingKey) {
    clearMailAdminSessionStorage(storages);
    return null;
  }

  return record;
}

export function writeMailAdminSessionStorage(
  storages: MailAdminSessionStorages,
  record: MailAdminSessionRecord,
  currentUserSession?: MailAdminSessionBindingSource | null,
): MailAdminSessionRecord | null {
  const normalized = normalizeMailAdminSessionRecord(record);
  if (!normalized) {
    return null;
  }

  const boundUserSessionKey = resolveMailAdminSessionBindingKey(currentUserSession);
  const nextRecord: MailAdminSessionRecord = {
    ...normalized,
    ...(boundUserSessionKey ? { boundUserSessionKey } : {}),
  };

  purgeLegacyMailAdminSessionStorage(storages);
  const written = tryWrite(
    storages.sessionStorage,
    MAIL_ADMIN_SESSION_STORAGE_KEY,
    JSON.stringify(nextRecord),
  );
  return written ? nextRecord : null;
}
