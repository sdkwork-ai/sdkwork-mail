import type { IamAppContext } from "@sdkwork/iam-contracts";
import {
  createTokenManager,
  type AuthTokenManager,
  type AuthTokens,
} from "@sdkwork/sdk-common";

import { clearMailAdminSessionStorage } from "./adminSessionStorage";
import { DEFAULT_APP_SESSION, type MailAppSession } from "./appSession";

export interface MailIamSessionUser {
  displayName?: string;
  email?: string;
  id?: string;
  name?: string;
  nickname?: string;
  userId?: string;
  username?: string;
}

export interface MailIamSession {
  accessToken?: string;
  authToken?: string;
  refreshToken?: string;
  sessionId?: string;
  context?: IamAppContext;
  user?: MailIamSessionUser;
}

export const mail_IAM_SESSION_STORAGE_KEY = "sdkwork-mail-pc:session:v1";
export const mail_IAM_SESSION_CHANGED_EVENT = "sdkwork-mail-pc:auth-session-changed";

const LEGACY_mail_IAM_SESSION_STORAGE_KEYS = [
  "sdkwork.Mail.app.session:v1",
  "sdkwork.Mail.app.session",
] as const;

let MailGlobalTokenManager: AuthTokenManager | null = null;

function getStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.localStorage;
}

function normalizeToken(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function dispatchMailIamSessionChanged(session: MailIamSession | null): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(mail_IAM_SESSION_CHANGED_EVENT, {
      detail: { session },
    }),
  );
}

function parseStoredMailIamSession(raw: string): MailIamSession | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MailIamSession> & Partial<MailAppSession>;
    const accessToken = normalizeToken(parsed.accessToken);
    const authToken = normalizeToken(parsed.authToken);
    if (accessToken || authToken) {
      return {
        ...(accessToken ? { accessToken } : {}),
        ...(authToken ? { authToken } : {}),
        ...(normalizeToken(parsed.refreshToken) ? { refreshToken: parsed.refreshToken } : {}),
        ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
        ...(parsed.context ? { context: parsed.context } : {}),
        ...(parsed.user ? { user: parsed.user } : {}),
      };
    }

    if (!accessToken) {
      return null;
    }

    return {
      accessToken,
      authToken: authToken ?? accessToken,
      context: {
        appId: "sdkwork-mail-pc",
        authLevel: "password",
        dataScope: [],
        deploymentMode: "saas",
        environment: "dev",
        organizationId: parsed.organizationId ?? DEFAULT_APP_SESSION.organizationId,
        permissionScope: [],
        sessionId: parsed.sessionId?.trim() || "migrated-session",
        tenantId: parsed.tenantId ?? DEFAULT_APP_SESSION.tenantId,
        userId: parsed.userId ?? DEFAULT_APP_SESSION.userId,
      },
    };
  } catch {
    return null;
  }
}

function migrateLegacyMailIamSession(): MailIamSession | null {
  const storage = getStorage();
  if (storage) {
    for (const legacyKey of LEGACY_mail_IAM_SESSION_STORAGE_KEYS) {
      const raw = storage.getItem(legacyKey);
      if (!raw) {
        continue;
      }
      const session = parseStoredMailIamSession(raw);
      storage.removeItem(legacyKey);
      if (session) {
        return applyMailIamSessionTokens(session);
      }
    }
  }

  if (typeof window === "undefined") {
    return null;
  }

  for (const legacyKey of LEGACY_mail_IAM_SESSION_STORAGE_KEYS) {
    const raw = window.sessionStorage.getItem(legacyKey);
    if (!raw) {
      continue;
    }
    const session = parseStoredMailIamSession(raw);
    window.sessionStorage.removeItem(legacyKey);
    if (session) {
      return applyMailIamSessionTokens(session);
    }
  }

  return null;
}

export function readMailIamSessionTokens(): MailIamSession | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(mail_IAM_SESSION_STORAGE_KEY);
  if (raw) {
    const session = parseStoredMailIamSession(raw);
    if (!session || (!normalizeToken(session.accessToken) && !normalizeToken(session.authToken))) {
      return null;
    }
    return session;
  }

  return migrateLegacyMailIamSession();
}

export function applyMailIamSessionTokens(session: MailIamSession): MailIamSession {
  const storage = getStorage();
  const normalized: MailIamSession = {
    ...(normalizeToken(session.accessToken) ? { accessToken: session.accessToken } : {}),
    ...(normalizeToken(session.authToken) ? { authToken: session.authToken } : {}),
    ...(normalizeToken(session.refreshToken) ? { refreshToken: session.refreshToken } : {}),
    ...(session.sessionId ? { sessionId: session.sessionId } : {}),
    ...(session.context ? { context: session.context } : {}),
    ...(session.user ? { user: session.user } : {}),
  };

  if (storage) {
    storage.setItem(mail_IAM_SESSION_STORAGE_KEY, JSON.stringify(normalized));
  }

  const tokenManager = getMailGlobalTokenManager();
  tokenManager.setTokens({
    ...(normalized.accessToken ? { accessToken: normalized.accessToken } : {}),
    ...(normalized.authToken ? { authToken: normalized.authToken } : {}),
    ...(normalized.refreshToken ? { refreshToken: normalized.refreshToken } : {}),
  });

  dispatchMailIamSessionChanged(normalized);
  return normalized;
}

export function clearMailIamSessionTokens(): void {
  const storage = getStorage();
  storage?.removeItem(mail_IAM_SESSION_STORAGE_KEY);
  if (typeof window !== "undefined") {
    for (const legacyKey of LEGACY_mail_IAM_SESSION_STORAGE_KEYS) {
      window.sessionStorage.removeItem(legacyKey);
      window.localStorage.removeItem(legacyKey);
    }
    // The admin surface shares this origin, so its session must not outlive the
    // user session that owns it.
    clearMailAdminSessionStorage({
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
    });
  }
  getMailGlobalTokenManager().clearTokens();
  dispatchMailIamSessionChanged(null);
}

export function isMailIamSessionAuthenticated(session: MailIamSession | null): boolean {
  return Boolean(normalizeToken(session?.accessToken) && normalizeToken(session?.authToken));
}

export function toMailAppSession(session: MailIamSession | null): MailAppSession | null {
  if (!isMailIamSessionAuthenticated(session)) {
    return null;
  }
  return {
    accessToken: session!.accessToken!.trim(),
    authToken: session!.authToken!.trim(),
    tenantId: session!.context?.tenantId?.trim() || DEFAULT_APP_SESSION.tenantId,
    organizationId:
      session!.context?.organizationId?.trim() || DEFAULT_APP_SESSION.organizationId,
    userId:
      session!.context?.userId?.trim()
      || session!.user?.userId?.trim()
      || session!.user?.id?.trim()
      || DEFAULT_APP_SESSION.userId,
  };
}

export function getMailGlobalTokenManager(): AuthTokenManager {
  if (!MailGlobalTokenManager) {
    MailGlobalTokenManager = createTokenManager();
    const snapshot = readMailIamSessionTokens();
    if (snapshot) {
      MailGlobalTokenManager.setTokens({
        ...(snapshot.accessToken ? { accessToken: snapshot.accessToken } : {}),
        ...(snapshot.authToken ? { authToken: snapshot.authToken } : {}),
        ...(snapshot.refreshToken ? { refreshToken: snapshot.refreshToken } : {}),
      } as AuthTokens);
    }
  }
  return MailGlobalTokenManager;
}
