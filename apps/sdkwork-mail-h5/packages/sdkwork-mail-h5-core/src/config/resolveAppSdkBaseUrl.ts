import {resolveBaseUrlWithAlignProtocol, splitBaseUrls} from "@sdkwork/sdk-common";

const APP_API_PREFIX = "/app/v3/api";
const API_BASE_URL_ENV_KEY = "SDKWORK_API_BASE_URL";

function stripAppApiSuffix(pathname: string): string {
  const normalized = pathname.replace(/\/+$/u, "");
  if (!normalized || normalized === APP_API_PREFIX) {
    return "";
  }
  if (normalized.endsWith(APP_API_PREFIX)) {
    return normalized.slice(0, -APP_API_PREFIX.length) || "";
  }
  return normalized;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  try {
    const parsed = new URL(apiBaseUrl);
    const normalizedPath = stripAppApiSuffix(parsed.pathname);
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return apiBaseUrl.replace(/\/app\/v3\/api\/?$/u, "");
  }
}

/**
 * Resolve the Mail App SDK base url. The Mail App SDK expects a bare origin, so
 * the `/app/v3/api` suffix is stripped.
 *
 * When no explicit base url is supplied the shared `SDKWORK_API_BASE_URL` is
 * resolved through `@sdkwork/sdk-common`, which picks the API host matching the
 * current page environment + protocol.
 */
export function resolveAppSdkBaseUrl(apiBaseUrl?: string): string {
  const [configured = ""] = splitBaseUrls(
    apiBaseUrl ?? resolveBaseUrlWithAlignProtocol({ envKey: API_BASE_URL_ENV_KEY }).url,
  );
  return normalizeApiBaseUrl(configured);
}
