import { resolveBaseUrl } from "@sdkwork/sdk-common";

export interface MailEnvironment {
  apiBaseUrl: string;
  appbaseAppApiBaseUrl: string;
  backendApiBaseUrl: string;
  appbaseLoginUrl: string;
  defaultMediaMode: "audio" | "video" | "live";
  providerSelection: string;
}

const API_BASE_URL_ENV_KEY = "SDKWORK_API_BASE_URL";

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function deriveBackendApiBaseUrl(apiOrigin: string): string {
  return `${apiOrigin.replace(/\/+$/u, "")}/backend/v3/api`;
}

export function resolveEnvironment(): MailEnvironment {
  // Single shared base-url key. `preservePath` keeps the `/app/v3/api` path
  // configured through SDKWORK_API_BASE_URL; the backend surface reuses the
  // same API origin with its own `/backend/v3/api` path.
  const appApiBaseUrl = resolveBaseUrl({
    envKey: API_BASE_URL_ENV_KEY,
    preservePath: true,
  }).url;
  const apiOrigin = resolveBaseUrl({ envKey: API_BASE_URL_ENV_KEY }).url;

  return {
    apiBaseUrl: appApiBaseUrl,
    appbaseAppApiBaseUrl: appApiBaseUrl,
    backendApiBaseUrl: deriveBackendApiBaseUrl(apiOrigin),
    appbaseLoginUrl: normalizeBaseUrl(
      import.meta.env.VITE_sdkwork_mail_PC_APPBASE_LOGIN_URL,
      "http://127.0.0.1:3900",
    ),
    defaultMediaMode: "video",
    providerSelection: "auto",
  };
}
