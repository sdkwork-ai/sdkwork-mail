import { readBootstrapAccessTokenFromProcessEnv } from '@sdkwork/iam-credential-entry';
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

export const mail_ADMIN_SESSION_STORAGE_KEY = "sdkwork-mail-h5:admin-session:v1";
const LEGACY_mail_ADMIN_SESSION_STORAGE_KEY = "sdkwork.Mail.admin.session";
export const DEFAULT_ADMIN_PERMISSION_SCOPE = "Mail.*";

export const DEFAULT_ADMIN_SESSION: MailAdminSession = {
  accessToken: "",
  authToken: "",
  tenantId: "100001",
  organizationId: "0",
  userId: "1",
};

function parseStoredAdminSession(raw: string): MailAdminSession | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MailAdminSession>;
    if (!parsed.accessToken?.trim()) {
      return null;
    }
    return {
      accessToken: parsed.accessToken.trim(),
      authToken: parsed.authToken?.trim() || parsed.accessToken.trim(),
      tenantId: parsed.tenantId?.trim() || DEFAULT_ADMIN_SESSION.tenantId,
      organizationId: parsed.organizationId?.trim() || DEFAULT_ADMIN_SESSION.organizationId,
      userId: parsed.userId?.trim() || DEFAULT_ADMIN_SESSION.userId,
    };
  } catch {
    return null;
  }
}

function migrateLegacyAdminSession(): MailAdminSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(LEGACY_mail_ADMIN_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  const session = parseStoredAdminSession(raw);
  window.sessionStorage.removeItem(LEGACY_mail_ADMIN_SESSION_STORAGE_KEY);
  if (!session) {
    return null;
  }
  saveAdminSession(session);
  return session;
}

export function loadAdminSession(): MailAdminSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const legacyRaw = window.sessionStorage.getItem(mail_ADMIN_SESSION_STORAGE_KEY);
  const raw = window.localStorage.getItem(mail_ADMIN_SESSION_STORAGE_KEY) ?? legacyRaw;
  if (legacyRaw && !window.localStorage.getItem(mail_ADMIN_SESSION_STORAGE_KEY)) {
    window.localStorage.setItem(mail_ADMIN_SESSION_STORAGE_KEY, legacyRaw);
    window.sessionStorage.removeItem(mail_ADMIN_SESSION_STORAGE_KEY);
  }
  if (raw) {
    return parseStoredAdminSession(raw);
  }

  return migrateLegacyAdminSession();
}

export function saveAdminSession(session: MailAdminSession): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(mail_ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
  window.sessionStorage.removeItem(mail_ADMIN_SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(LEGACY_mail_ADMIN_SESSION_STORAGE_KEY);
}

export function clearAdminSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(mail_ADMIN_SESSION_STORAGE_KEY);
  window.localStorage.removeItem(mail_ADMIN_SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(LEGACY_mail_ADMIN_SESSION_STORAGE_KEY);
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
