import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { mail_IAM_SESSION_CHANGED_EVENT, type MailIamSession } from "@sdkwork/mail-pc-core";

import {
  bootstrapAdminAuth,
  clearAdminSession,
  DEFAULT_ADMIN_SESSION,
  loadAdminSession,
  saveAdminSession,
  type MailAdminSession,
} from "./bootstrap/adminAuth";

interface AuthGateProps {
  children: ReactNode;
}

interface MailIamSessionChangedDetail {
  session?: MailIamSession | null;
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<MailAdminSession | null>(() => loadAdminSession());
  const [form, setForm] = useState<MailAdminSession>(session ?? DEFAULT_ADMIN_SESSION);

  useEffect(() => {
    if (session) {
      bootstrapAdminAuth();
    }
  }, [session]);

  // The admin session is bound to the mail user session that created it: when
  // that session is cleared or replaced, the admin surface must sign out too.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleMailSessionChanged = (event: Event) => {
      const detail = (event as CustomEvent<MailIamSessionChangedDetail | undefined>).detail;
      if (detail?.session) {
        return;
      }
      clearAdminSession();
      setSession(null);
      setForm(DEFAULT_ADMIN_SESSION);
    };

    window.addEventListener(mail_IAM_SESSION_CHANGED_EVENT, handleMailSessionChanged);
    return () => {
      window.removeEventListener(mail_IAM_SESSION_CHANGED_EVENT, handleMailSessionChanged);
    };
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextSession: MailAdminSession = {
        accessToken: form.accessToken.trim(),
        authToken: form.authToken.trim() || form.accessToken.trim(),
        tenantId: form.tenantId.trim() || DEFAULT_ADMIN_SESSION.tenantId,
        organizationId: form.organizationId.trim() || DEFAULT_ADMIN_SESSION.organizationId,
        userId: form.userId.trim() || DEFAULT_ADMIN_SESSION.userId,
      };
      saveAdminSession(nextSession);
      bootstrapAdminAuth();
      setSession(nextSession);
    },
    [form],
  );

  const handleSignOut = useCallback(() => {
    clearAdminSession();
    setSession(null);
    setForm(DEFAULT_ADMIN_SESSION);
  }, []);

  if (session) {
    return (
      <div className="admin-auth-shell">
        <div className="admin-auth-toolbar">
          <span>Signed in as {session.userId}</span>
          <button type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="admin-auth-login">
      <form className="admin-auth-form" onSubmit={handleSubmit}>
        <h2>Mail Admin Sign In</h2>
        <p>Provide backend dual-token credentials and SDKWork app context for local admin access.</p>
        <label>
          Access Token
          <input
            required
            value={form.accessToken}
            onChange={(event) => setForm((current) => ({ ...current, accessToken: event.target.value }))}
          />
        </label>
        <label>
          Auth Token
          <input
            value={form.authToken}
            onChange={(event) => setForm((current) => ({ ...current, authToken: event.target.value }))}
          />
        </label>
        <label>
          Tenant ID
          <input
            value={form.tenantId}
            onChange={(event) => setForm((current) => ({ ...current, tenantId: event.target.value }))}
          />
        </label>
        <label>
          Organization ID
          <input
            value={form.organizationId}
            onChange={(event) =>
              setForm((current) => ({ ...current, organizationId: event.target.value }))
            }
          />
        </label>
        <label>
          User ID
          <input
            value={form.userId}
            onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))}
          />
        </label>
        <button type="submit" className="primary">
          Continue
        </button>
      </form>
    </div>
  );
}
