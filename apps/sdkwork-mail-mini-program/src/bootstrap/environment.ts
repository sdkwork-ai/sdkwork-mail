import {resolveBaseUrlWithAlignProtocol, splitBaseUrls} from "@sdkwork/sdk-common";

export interface MailEnvironment {
  apiBaseUrl: string;
  appbaseLoginUrl: string;
  defaultMediaMode: "audio" | "video" | "live";
}

const RUNTIME_CONFIG_KEY = "sdkwork.Mail.runtime.config";
const DEFAULT_MEDIA_MODE = "video";

function resolveDefaultApiBaseUrl(): string {
  // `preservePath` keeps the `/app/v3/api` path configured through
  // SDKWORK_API_BASE_URL.
  return resolveBaseUrlWithAlignProtocol({ preservePath: true }).url;
}

function resolveDefaultAppbaseLoginUrl(): string {
  return resolveBaseUrlWithAlignProtocol().url;
}

function normalizeBaseUrl(value: string | undefined, fallback: () => string): string {
  // Mini programs have no browser location, so the base url is injected by the
  // host. A comma/semicolon separated list of candidates is accepted and the
  // first one wins.
  const [normalized] = splitBaseUrls(String(value ?? "").trim());
  return normalized || fallback();
}

function readStoredRuntimeConfig(): Partial<MailEnvironment> {
  try {
    const wxStorage = (globalThis as { wx?: { getStorageSync(key: string): unknown } }).wx;
    const raw = wxStorage?.getStorageSync?.(RUNTIME_CONFIG_KEY);
    if (raw && typeof raw === "object") {
      return raw as Partial<MailEnvironment>;
    }
    if (typeof raw === "string" && raw.trim()) {
      return JSON.parse(raw) as Partial<MailEnvironment>;
    }
  } catch {
    return {};
  }
  return {};
}

export function resolveEnvironment(): MailEnvironment {
  const stored = readStoredRuntimeConfig();
  return {
    apiBaseUrl: normalizeBaseUrl(stored.apiBaseUrl, resolveDefaultApiBaseUrl),
    appbaseLoginUrl: normalizeBaseUrl(
      stored.appbaseLoginUrl,
      resolveDefaultAppbaseLoginUrl,
    ),
    defaultMediaMode: stored.defaultMediaMode ?? DEFAULT_MEDIA_MODE,
  };
}

export function saveRuntimeEnvironment(config: Partial<MailEnvironment>): MailEnvironment {
  const next: MailEnvironment = {
    ...resolveEnvironment(),
    ...config,
  };
  if (config.apiBaseUrl !== undefined) {
    next.apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl, resolveDefaultApiBaseUrl);
  }
  const wxStorage = (globalThis as { wx?: { setStorageSync(key: string, value: unknown): void } }).wx;
  wxStorage?.setStorageSync?.(RUNTIME_CONFIG_KEY, next);
  return next;
}
