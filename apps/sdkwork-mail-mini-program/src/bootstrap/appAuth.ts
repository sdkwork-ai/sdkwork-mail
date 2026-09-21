import { readBootstrapAccessTokenFromProcessEnv } from '@sdkwork/iam-credential-entry';
import type { AuthTokenManager } from "@sdkwork/sdk-common";
import {
  DEFAULT_APP_SESSION,
  listLegacyMailMpSessionStorageKeys,
  parseAppbaseCallbackSession,
  mail_MP_SESSION_STORAGE_KEY,
  type MailAppSession,
} from "@sdkwork/mail-mp-core";
import {
  createTokenManager,
  setTokenManager,
} from "./tokenManager";

import { getHostAdapters } from "./hostAdapters";

export { DEFAULT_APP_SESSION, mail_MP_SESSION_STORAGE_KEY, type MailAppSession };

function parseStoredSession(raw: string): MailAppSession | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MailAppSession>;
    if (!parsed.accessToken?.trim()) {
      return null;
    }
    return {
      accessToken: parsed.accessToken.trim(),
      authToken: parsed.authToken?.trim() || parsed.accessToken.trim(),
      tenantId: parsed.tenantId?.trim() || DEFAULT_APP_SESSION.tenantId,
      organizationId: parsed.organizationId?.trim() || DEFAULT_APP_SESSION.organizationId,
      userId: parsed.userId?.trim() || DEFAULT_APP_SESSION.userId,
    };
  } catch {
    return null;
  }
}

function migrateLegacyAppSession(storage: NonNullable<ReturnType<typeof getHostAdapters>["secureStorage"]>): MailAppSession | null {
  for (const legacyKey of listLegacyMailMpSessionStorageKeys()) {
    const raw = storage.getItem(legacyKey);
    if (!raw) {
      continue;
    }
    const session = parseStoredSession(raw);
    storage.removeItem(legacyKey);
    if (session) {
      storage.setItem(mail_MP_SESSION_STORAGE_KEY, JSON.stringify(session));
      return session;
    }
  }
  return null;
}

export function loadAppSession(): MailAppSession | null {
  const storage = getHostAdapters().secureStorage;
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(mail_MP_SESSION_STORAGE_KEY);
  if (raw) {
    return parseStoredSession(raw);
  }

  return migrateLegacyAppSession(storage);
}

export function saveAppSession(session: MailAppSession): void {
  getHostAdapters().secureStorage?.setItem(mail_MP_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearAppSession(): void {
  const storage = getHostAdapters().secureStorage;
  if (!storage) {
    return;
  }
  storage.removeItem(mail_MP_SESSION_STORAGE_KEY);
  for (const legacyKey of listLegacyMailMpSessionStorageKeys()) {
    storage.removeItem(legacyKey);
  }
}

export function createAppTokenManager(session: MailAppSession): AuthTokenManager {
  // Fall back to the private bootstrap Access-Token artifact when no interactive
  // app session exists (APP_SDK_INTEGRATION_SPEC section 4).
  return createTokenManager(
    () => session.accessToken || readBootstrapAccessTokenFromProcessEnv(),
  );
}

export function consumeAppbaseCallbackSession(query: Record<string, string | undefined>): MailAppSession | null {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  const session = parseAppbaseCallbackSession(`?${params.toString()}`, "");
  if (!session) {
    return null;
  }
  saveAppSession(session);
  return session;
}

export function bootstrapAppAuth(): MailAppSession | null {
  const session = loadAppSession();
  if (!session) {
    return null;
  }
  setTokenManager(createAppTokenManager(session));
  return session;
}
