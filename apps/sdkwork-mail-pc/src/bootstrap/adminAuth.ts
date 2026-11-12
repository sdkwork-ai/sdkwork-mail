import { readBootstrapAccessTokenFromProcessEnv } from '@sdkwork/iam-credential-entry';
import {
  LEGACY_MAIL_ADMIN_SESSION_STORAGE_KEYS,
  MAIL_ADMIN_SESSION_STORAGE_KEY,
  clearMailAdminSessionStorage,
  readMailAdminSessionStorage,
  readMailIamSessionTokens,
  writeMailAdminSessionStorage,
  type MailAdminSessionRecord,
  type MailAdminSessionStorages,
} from '@sdkwork/mail-pc-core';
import {
  createTokenManager,
  setTokenManager,
  type AuthTokenManager,
} from "./tokenManager";

export interface MailAdminSession {
  accessToken: string;
  authToken: string;
  tenantId: string;
  organizationId: string;
  userId: string;
}

/**
 * Admin sessions are stored in `sessionStorage` only (see
 * `@sdkwork/mail-pc-core` `adminSessionStorage`): the admin surface shares its
 * origin with the mail client, so a `localStorage` admin session would be
 * inherited by the next account that opens `/admin`.
 */
export const mail_ADMIN_SESSION_STORAGE_KEY = MAIL_ADMIN_SESSION_STORAGE_KEY;
export { LEGACY_MAIL_ADMIN_SESSION_STORAGE_KEYS };
export const DEFAULT_ADMIN_PERMISSION_SCOPE = "Mail.*";

export const DEFAULT_ADMIN_SESSION: MailAdminSession = {
  accessToken: "",
  authToken: "",
  tenantId: "100001",
  organizationId: "0",
  userId: "1",
};

function resolveAdminSessionStorages(): MailAdminSessionStorages | null {
  if (typeof window === "undefined") {
    return null;
  }

  return {
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
  };
}

function resolveCurrentUserSession() {
  try {
    return readMailIamSessionTokens();
  } catch {
    return null;
  }
}

function toMailAdminSession(record: MailAdminSessionRecord): MailAdminSession {
  return {
    accessToken: record.accessToken,
    authToken: record.authToken || record.accessToken,
    tenantId: record.tenantId?.trim() || DEFAULT_ADMIN_SESSION.tenantId,
    organizationId: record.organizationId?.trim() || DEFAULT_ADMIN_SESSION.organizationId,
    userId: record.userId?.trim() || DEFAULT_ADMIN_SESSION.userId,
  };
}

export function loadAdminSession(): MailAdminSession | null {
  const storages = resolveAdminSessionStorages();
  if (!storages) {
    return null;
  }

  const record = readMailAdminSessionStorage(storages, resolveCurrentUserSession());
  return record ? toMailAdminSession(record) : null;
}

export function saveAdminSession(session: MailAdminSession): void {
  const storages = resolveAdminSessionStorages();
  if (!storages) {
    return;
  }

  writeMailAdminSessionStorage(
    storages,
    {
      accessToken: session.accessToken.trim(),
      authToken: session.authToken.trim() || session.accessToken.trim(),
      tenantId: session.tenantId.trim(),
      organizationId: session.organizationId.trim(),
      userId: session.userId.trim(),
    },
    resolveCurrentUserSession(),
  );
}

export function clearAdminSession(): void {
  const storages = resolveAdminSessionStorages();
  if (!storages) {
    return;
  }

  clearMailAdminSessionStorage(storages);
}

export function buildAdminSdkHeaders(session: MailAdminSession): Record<string, string> {
  return {
    "x-sdkwork-tenant-id": session.tenantId,
    "x-sdkwork-organization-id": session.organizationId,
    "x-sdkwork-user-id": session.userId,
    "x-sdkwork-actor-id": session.userId,
    "x-sdkwork-permission-scope": DEFAULT_ADMIN_PERMISSION_SCOPE,
  };
}

export function createAdminTokenManager(session: MailAdminSession): AuthTokenManager {
  // Fall back to the private bootstrap Access-Token artifact when no interactive
  // admin session exists (APP_SDK_INTEGRATION_SPEC section 4).
  return createTokenManager(
    () => session.accessToken || readBootstrapAccessTokenFromProcessEnv(),
  );
}

export function bootstrapAdminAuth(): MailAdminSession | null {
  const session = loadAdminSession();
  if (!session) {
    return null;
  }
  setTokenManager(createAdminTokenManager(session));
  return session;
}
