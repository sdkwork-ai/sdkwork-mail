"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/bootstrap/runtimeBundle.ts
var runtimeBundle_exports = {};
__export(runtimeBundle_exports, {
  bootstrapMailMiniProgram: () => bootstrapMailMiniProgram,
  configureMailRuntime: () => configureMailRuntime,
  getMailMessage: () => getMailMessage,
  getMailRuntimeEnvironment: () => getMailRuntimeEnvironment,
  listMailAccounts: () => listMailAccounts,
  listMailFolders: () => listMailFolders,
  listMailMessages: () => listMailMessages
});
module.exports = __toCommonJS(runtimeBundle_exports);

// packages/sdkwork-mail-mp-host/src/weixin/storage.ts
function getWxStorage() {
  const candidate = globalThis.wx;
  return candidate != null ? candidate : null;
}
function createWeixinSecureStorage() {
  const wxStorage = getWxStorage();
  if (!wxStorage) {
    throw new Error("WeChat mini program storage is unavailable");
  }
  return {
    getItem(key) {
      try {
        const value = wxStorage.getStorageSync(key);
        return typeof value === "string" && value.length > 0 ? value : null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      wxStorage.setStorageSync(key, value);
    },
    removeItem(key) {
      wxStorage.removeStorageSync(key);
    }
  };
}

// packages/sdkwork-mail-mp-host/src/weixin/fetch.ts
function normalizeHeaders(headers) {
  if (!headers) {
    return {};
  }
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const normalized = {};
    headers.forEach((value, key) => {
      normalized[key] = value;
    });
    return normalized;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}
function createResponse(statusCode, data, header) {
  const headerMap = new Map(
    Object.entries(header).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    headers: {
      get(name) {
        var _a;
        return (_a = headerMap.get(name.toLowerCase())) != null ? _a : null;
      }
    },
    async json() {
      if (typeof data === "string") {
        return JSON.parse(data);
      }
      return data;
    },
    async text() {
      return typeof data === "string" ? data : JSON.stringify(data);
    }
  };
}
function getWxRequest() {
  const candidate = globalThis.wx;
  if (!(candidate == null ? void 0 : candidate.request)) {
    throw new Error("WeChat wx.request is unavailable");
  }
  return candidate;
}
function installWeixinFetch() {
  if (typeof globalThis.fetch === "function") {
    return;
  }
  async function wxFetch(input, init = {}) {
    var _a;
    const url = typeof input === "string" ? input : input.toString();
    const method = ((_a = init.method) != null ? _a : "GET").toUpperCase();
    const headers = normalizeHeaders(init.headers);
    const body = typeof init.body === "string" ? init.body : init.body == null ? void 0 : JSON.stringify(init.body);
    if (body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    const response = await new Promise((resolve, reject) => {
      const requestTask = getWxRequest().request({
        url,
        method,
        header: headers,
        data: body,
        success(wxResponse) {
          var _a2;
          resolve(
            createResponse(
              wxResponse.statusCode,
              wxResponse.data,
              (_a2 = wxResponse.header) != null ? _a2 : {}
            )
          );
        },
        fail(error) {
          var _a2;
          reject(new Error((_a2 = error.errMsg) != null ? _a2 : "wx.request failed"));
        }
      });
      if (init.signal) {
        if (init.signal.aborted) {
          requestTask.abort();
          reject(new Error("Request was cancelled"));
          return;
        }
        init.signal.addEventListener(
          "abort",
          () => {
            requestTask.abort();
            reject(new Error("Request was cancelled"));
          },
          { once: true }
        );
      }
    });
    return response;
  }
  globalThis.fetch = wxFetch;
}

// packages/sdkwork-mail-mp-core/src/session/appSession.ts
var DEFAULT_APP_SESSION = {
  accessToken: "dev-access-token",
  authToken: "dev-auth-token",
  tenantId: "100001",
  organizationId: "0",
  userId: "1"
};
var DEFAULT_APP_PERMISSION_SCOPE = "mail.messages.read mail.messages.write mail.verification.write mail.transactional.write";

// packages/sdkwork-mail-mp-core/src/session/appbaseAuthBridge.ts
var CALLBACK_KEYS = {
  accessToken: ["accessToken", "access_token"],
  authToken: ["authToken", "auth_token", "token"],
  tenantId: ["tenantId", "tenant_id", "x-sdkwork-tenant-id"],
  organizationId: ["organizationId", "organization_id", "x-sdkwork-organization-id"],
  userId: ["userId", "user_id", "x-sdkwork-user-id", "actorId", "actor_id"]
};
function readParam(params, keys) {
  var _a;
  for (const key of keys) {
    const value = (_a = params.get(key)) == null ? void 0 : _a.trim();
    if (value) {
      return value;
    }
  }
  return "";
}
function parseAppbaseCallbackSession(search = window.location.search, hash = window.location.hash) {
  const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash.replace(/^#/, "");
  const params = new URLSearchParams(search);
  for (const [key, value] of new URLSearchParams(hashQuery)) {
    if (!params.has(key)) {
      params.set(key, value);
    }
  }
  const accessToken = readParam(params, CALLBACK_KEYS.accessToken);
  if (!accessToken) {
    return null;
  }
  const authToken = readParam(params, CALLBACK_KEYS.authToken) || accessToken;
  return {
    accessToken,
    authToken,
    tenantId: readParam(params, CALLBACK_KEYS.tenantId) || DEFAULT_APP_SESSION.tenantId,
    organizationId: readParam(params, CALLBACK_KEYS.organizationId) || DEFAULT_APP_SESSION.organizationId,
    userId: readParam(params, CALLBACK_KEYS.userId) || DEFAULT_APP_SESSION.userId
  };
}

// packages/sdkwork-mail-mp-core/src/session/sessionStorageKey.ts
var mail_MP_SESSION_STORAGE_KEY = "sdkwork-mail-mini-program:session:v1";
var LEGACY_mail_MP_SESSION_STORAGE_KEYS = ["sdkwork.Mail.app.session"];
function listLegacyMailMpSessionStorageKeys() {
  return LEGACY_mail_MP_SESSION_STORAGE_KEYS;
}

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/core/types.js
var DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1e3,
  retryBackoff: "exponential",
  maxRetryDelay: 3e4
};
var DEFAULT_CACHE_CONFIG = {
  enabled: false,
  ttl: 300 * 1e3,
  maxSize: 100
};
var SUCCESS_CODES = [
  0,
  200,
  2e3,
  "0",
  "200",
  "2000"
];
var HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};
var MIME_TYPES = {
  JSON: "application/json",
  FORM_DATA: "multipart/form-data",
  URL_ENCODED: "application/x-www-form-urlencoded",
  OCTET_STREAM: "application/octet-stream",
  TEXT_PLAIN: "text/plain",
  TEXT_HTML: "text/html"
};

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/auth/token-manager.js
var DefaultAuthTokenManager = class {
  constructor(initialTokens, events) {
    __publicField(this, "tokens", {});
    __publicField(this, "events");
    if (initialTokens) {
      this.tokens = { ...initialTokens };
      if (initialTokens.expiresIn && !initialTokens.expiresAt) this.tokens.expiresAt = Date.now() + initialTokens.expiresIn * 1e3;
    }
    this.events = events;
  }
  getAccessToken() {
    return this.tokens.accessToken;
  }
  getAuthToken() {
    return this.tokens.authToken;
  }
  getRefreshToken() {
    return this.tokens.refreshToken;
  }
  getTokens() {
    return { ...this.tokens };
  }
  setTokens(tokens) {
    var _a, _b;
    this.tokens = { ...tokens };
    if (tokens.expiresIn && !tokens.expiresAt) this.tokens.expiresAt = Date.now() + tokens.expiresIn * 1e3;
    (_b = (_a = this.events) == null ? void 0 : _a.onTokenSet) == null ? void 0 : _b.call(_a, this.tokens);
  }
  setAccessToken(token) {
    var _a, _b;
    this.tokens.accessToken = token;
    (_b = (_a = this.events) == null ? void 0 : _a.onTokenSet) == null ? void 0 : _b.call(_a, this.tokens);
  }
  setAuthToken(token) {
    var _a, _b;
    this.tokens.authToken = token;
    (_b = (_a = this.events) == null ? void 0 : _a.onTokenSet) == null ? void 0 : _b.call(_a, this.tokens);
  }
  setRefreshToken(token) {
    this.tokens.refreshToken = token;
  }
  clearTokens() {
    var _a, _b;
    this.tokens = {};
    (_b = (_a = this.events) == null ? void 0 : _a.onTokenCleared) == null ? void 0 : _b.call(_a);
  }
  clearAuthToken() {
    delete this.tokens.authToken;
  }
  clearAccessToken() {
    delete this.tokens.accessToken;
  }
  isExpired() {
    var _a, _b;
    if (!this.tokens.expiresAt) return false;
    const expired = Date.now() >= this.tokens.expiresAt;
    if (expired) (_b = (_a = this.events) == null ? void 0 : _a.onTokenExpired) == null ? void 0 : _b.call(_a);
    return expired;
  }
  isValid() {
    return this.hasToken() && !this.isExpired();
  }
  hasToken() {
    return !!(this.tokens.accessToken || this.tokens.authToken);
  }
  hasAuthToken() {
    return !!this.tokens.authToken;
  }
  hasAccessToken() {
    return !!this.tokens.accessToken;
  }
  willExpireIn(seconds) {
    if (!this.tokens.expiresAt) return false;
    return Date.now() + seconds * 1e3 >= this.tokens.expiresAt;
  }
};
function buildAuthHeaders(authMode, apiKey, tokenManager) {
  const headers = {};
  if (authMode === "apikey") {
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (authMode === "dual-token") {
    if (tokenManager) {
      const accessToken = tokenManager.getAccessToken();
      const authToken = tokenManager.getAuthToken();
      if (accessToken) headers["Access-Token"] = accessToken;
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    }
  }
  return headers;
}

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/utils/logger.js
var LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
};
var ConsoleLogger = class {
  constructor(config = {}) {
    __publicField(this, "level");
    __publicField(this, "prefix");
    __publicField(this, "timestamp");
    __publicField(this, "colors");
    var _a, _b, _c, _d;
    this.level = (_a = config.level) != null ? _a : "info";
    this.prefix = (_b = config.prefix) != null ? _b : "[SDK]";
    this.timestamp = (_c = config.timestamp) != null ? _c : true;
    this.colors = (_d = config.colors) != null ? _d : true;
  }
  formatMessage(level, message) {
    const parts = [];
    if (this.timestamp) parts.push((/* @__PURE__ */ new Date()).toISOString());
    parts.push(this.prefix);
    parts.push(`[${level.toUpperCase()}]`);
    parts.push(message);
    return parts.join(" ");
  }
  getColorCode(level) {
    if (!this.colors) return "";
    return {
      debug: "\x1B[36m",
      info: "\x1B[32m",
      warn: "\x1B[33m",
      error: "\x1B[31m",
      silent: ""
    }[level];
  }
  getResetCode() {
    return this.colors ? "\x1B[0m" : "";
  }
  log(level, message, ...args) {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) return;
    const formattedMessage = this.formatMessage(level, message);
    const output = `${this.getColorCode(level)}${formattedMessage}${this.getResetCode()}`;
    switch (level) {
      case "debug":
        console.debug(output, ...args);
        break;
      case "info":
        console.info(output, ...args);
        break;
      case "warn":
        console.warn(output, ...args);
        break;
      case "error":
        console.error(output, ...args);
        break;
    }
  }
  debug(message, ...args) {
    this.log("debug", message, ...args);
  }
  info(message, ...args) {
    this.log("info", message, ...args);
  }
  warn(message, ...args) {
    this.log("warn", message, ...args);
  }
  error(message, ...args) {
    this.log("error", message, ...args);
  }
  setLevel(level) {
    this.level = level;
  }
};
var noopLogger = {
  debug: () => {
  },
  info: () => {
  },
  warn: () => {
  },
  error: () => {
  },
  log: () => {
  },
  setLevel: () => {
  }
};
function createLogger(config) {
  if ((config == null ? void 0 : config.level) === "silent") return noopLogger;
  return new ConsoleLogger(config);
}

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/utils/cache.js
var MemoryCacheStore = class {
  constructor(config = {}) {
    __publicField(this, "cache", /* @__PURE__ */ new Map());
    __publicField(this, "maxSize");
    __publicField(this, "defaultTtl");
    var _a, _b;
    this.maxSize = (_a = config.maxSize) != null ? _a : DEFAULT_CACHE_CONFIG.maxSize;
    this.defaultTtl = (_b = config.ttl) != null ? _b : DEFAULT_CACHE_CONFIG.ttl;
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }
  set(key, value, ttl) {
    if (this.cache.size >= this.maxSize) this.evictOldest();
    const expiresAt = Date.now() + (ttl != null ? ttl : this.defaultTtl);
    this.cache.set(key, {
      value,
      expiresAt
    });
  }
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
  delete(key) {
    return this.cache.delete(key);
  }
  clear() {
    this.cache.clear();
  }
  size() {
    return this.cache.size;
  }
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) if (entry.expiresAt < oldestTime) {
      oldestTime = entry.expiresAt;
      oldestKey = key;
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }
};
function createCacheStore(config) {
  return new MemoryCacheStore(config);
}

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/errors.js
var SdkError = class extends Error {
  constructor(message, code = "UNKNOWN", httpStatus, options) {
    var _a, _b;
    super(message, { cause: options == null ? void 0 : options.cause });
    __publicField(this, "code");
    __publicField(this, "httpStatus");
    __publicField(this, "details");
    __publicField(this, "timestamp");
    __publicField(this, "traceId");
    __publicField(this, "problem");
    __publicField(this, "metadata");
    this.name = this.constructor.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = options == null ? void 0 : options.details;
    this.timestamp = Date.now();
    this.traceId = (_b = options == null ? void 0 : options.traceId) != null ? _b : (_a = options == null ? void 0 : options.problem) == null ? void 0 : _a.traceId;
    this.problem = options == null ? void 0 : options.problem;
    this.metadata = options == null ? void 0 : options.metadata;
    Object.setPrototypeOf(this, new.target.prototype);
  }
  static fromApiResult(result, httpStatus) {
    const code = String(result.code);
    const message = result.msg || result.message || "Unknown error";
    switch (code) {
      case "400":
      case "4000":
        return new ValidationError(message);
      case "401":
      case "4010":
        return new AuthenticationError(message);
      case "403":
      case "4030":
        return new ForbiddenError(message);
      case "404":
      case "4040":
        return new NotFoundError(message);
      case "409":
      case "4090":
        return new ConflictError(message);
      case "429":
      case "4290":
        return new RateLimitError(message);
      default:
        if (code.startsWith("5")) return new ServerError(message, httpStatus != null ? httpStatus : HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return new BusinessError(message, result.code, result.data);
    }
  }
  static fromHttpStatus(status, message, options) {
    const defaultMessage = message != null ? message : `HTTP Error ${status}`;
    switch (status) {
      case HTTP_STATUS.BAD_REQUEST:
      case HTTP_STATUS.UNPROCESSABLE_ENTITY:
        return new ValidationError(defaultMessage, void 0, options);
      case HTTP_STATUS.UNAUTHORIZED:
        return new AuthenticationError(defaultMessage, options);
      case HTTP_STATUS.FORBIDDEN:
        return new ForbiddenError(defaultMessage, options);
      case HTTP_STATUS.NOT_FOUND:
        return new NotFoundError(defaultMessage, options);
      case HTTP_STATUS.METHOD_NOT_ALLOWED:
        return new ValidationError(defaultMessage, void 0, options);
      case HTTP_STATUS.CONFLICT:
        return new ConflictError(defaultMessage, options);
      case HTTP_STATUS.TOO_MANY_REQUESTS:
        return new RateLimitError(defaultMessage, void 0, options);
      case HTTP_STATUS.INTERNAL_SERVER_ERROR:
        return new ServerError(defaultMessage, status, options);
      case HTTP_STATUS.BAD_GATEWAY:
        return new BadGatewayError(defaultMessage, options);
      case HTTP_STATUS.SERVICE_UNAVAILABLE:
        return new ServiceUnavailableError(defaultMessage, options);
      case HTTP_STATUS.GATEWAY_TIMEOUT:
        return new GatewayTimeoutError(defaultMessage, options);
      default:
        if (status >= 500) return new ServerError(defaultMessage, status, options);
        return new NetworkError(defaultMessage, options);
    }
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      httpStatus: this.httpStatus,
      details: this.details,
      timestamp: this.timestamp,
      traceId: this.traceId,
      problem: this.problem,
      metadata: this.metadata
    };
  }
  toString() {
    return `${this.name}: ${this.message} (code: ${this.code})`;
  }
  isRetryable() {
    return isRetryableError(this);
  }
  isAuthError() {
    return this.code === "UNAUTHORIZED" || this.code === "TOKEN_EXPIRED" || this.code === "TOKEN_INVALID";
  }
  isNetworkError() {
    return this.code === "NETWORK_ERROR" || this.code === "TIMEOUT";
  }
  isClientError() {
    return this.httpStatus !== void 0 && this.httpStatus >= 400 && this.httpStatus < 500;
  }
  isServerError() {
    return this.httpStatus !== void 0 && this.httpStatus >= 500;
  }
};
var NetworkError = class extends SdkError {
  constructor(message = "Network error", options) {
    super(message, "NETWORK_ERROR", void 0, options);
  }
};
var TimeoutError = class extends SdkError {
  constructor(message = "Request timeout", timeout, options) {
    super(message, "TIMEOUT", void 0, options);
    __publicField(this, "timeout");
    this.timeout = timeout;
  }
  toJSON() {
    return {
      ...super.toJSON(),
      timeout: this.timeout
    };
  }
};
var CancelledError = class extends SdkError {
  constructor(message = "Request cancelled", options) {
    super(message, "CANCELLED", void 0, options);
  }
};
var AuthenticationError = class extends SdkError {
  constructor(message = "Authentication failed", options) {
    super(message, "UNAUTHORIZED", HTTP_STATUS.UNAUTHORIZED, options);
  }
};
var ForbiddenError = class extends SdkError {
  constructor(message = "Access forbidden", options) {
    super(message, "FORBIDDEN", HTTP_STATUS.FORBIDDEN, options);
  }
};
var NotFoundError = class extends SdkError {
  constructor(message = "Resource not found", options) {
    super(message, "NOT_FOUND", HTTP_STATUS.NOT_FOUND, options);
  }
};
var ValidationError = class extends SdkError {
  constructor(message = "Validation error", details, options) {
    super(message, "VALIDATION_ERROR", HTTP_STATUS.BAD_REQUEST, details === void 0 ? options : {
      ...options,
      details
    });
  }
};
var ConflictError = class extends SdkError {
  constructor(message = "Resource conflict", options) {
    super(message, "CONFLICT", HTTP_STATUS.CONFLICT, options);
  }
};
var RateLimitError = class extends SdkError {
  constructor(message = "Rate limit exceeded", retryAfter, options) {
    super(message, "RATE_LIMIT", HTTP_STATUS.TOO_MANY_REQUESTS, options);
    __publicField(this, "retryAfter");
    this.retryAfter = retryAfter;
  }
  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter
    };
  }
};
var ServerError = class extends SdkError {
  constructor(message = "Server error", httpStatus = HTTP_STATUS.INTERNAL_SERVER_ERROR, options) {
    super(message, "SERVER_ERROR", httpStatus, options);
  }
};
var BadGatewayError = class extends ServerError {
  constructor(message = "Bad gateway", options) {
    super(message, HTTP_STATUS.BAD_GATEWAY, options);
    this.code = "BAD_GATEWAY";
  }
};
var ServiceUnavailableError = class extends ServerError {
  constructor(message = "Service unavailable", options) {
    super(message, HTTP_STATUS.SERVICE_UNAVAILABLE, options);
    this.code = "SERVICE_UNAVAILABLE";
  }
};
var GatewayTimeoutError = class extends ServerError {
  constructor(message = "Gateway timeout", options) {
    super(message, HTTP_STATUS.GATEWAY_TIMEOUT, options);
    this.code = "GATEWAY_TIMEOUT";
  }
};
var BusinessError = class extends SdkError {
  constructor(message, code, data, options) {
    super(message, "BUSINESS_ERROR", void 0, options);
    __publicField(this, "businessCode");
    __publicField(this, "data");
    this.businessCode = code;
    this.data = data;
  }
  toJSON() {
    return {
      ...super.toJSON(),
      businessCode: this.businessCode,
      data: this.data
    };
  }
};
function isRetryableError(error) {
  if (!(error instanceof SdkError)) return false;
  return error instanceof NetworkError || error instanceof TimeoutError || error instanceof ServerError || error instanceof RateLimitError || error instanceof BadGatewayError || error instanceof ServiceUnavailableError || error instanceof GatewayTimeoutError;
}

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/utils/retry.js
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function calculateDelay(attempt, baseDelay, backoff, maxDelay) {
  let delay;
  switch (backoff) {
    case "fixed":
      delay = baseDelay;
      break;
    case "linear":
      delay = baseDelay * attempt;
      break;
    case "exponential":
      delay = baseDelay * Math.pow(2, attempt - 1);
      break;
    default:
      delay = baseDelay;
  }
  return Math.min(delay, maxDelay);
}
function shouldRetry(error, attempt, config) {
  if (attempt >= config.maxRetries) return false;
  if (config.retryCondition) return config.retryCondition(error, attempt);
  return isRetryableError(error);
}
async function withRetry(fn, config = {}) {
  const fullConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config
  };
  let lastError;
  let attempt = 0;
  while (attempt <= fullConfig.maxRetries) try {
    return await fn();
  } catch (error) {
    lastError = error;
    attempt++;
    if (!shouldRetry(lastError, attempt, fullConfig)) throw lastError;
    await sleep(calculateDelay(attempt, fullConfig.retryDelay, fullConfig.retryBackoff, fullConfig.maxRetryDelay));
  }
  throw lastError;
}

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/utils/url.js
var DEFAULT_BASE_URL_ENV_KEY = "SDKWORK_API_BASE_URL";
var ENV_SUFFIXES = [
  {
    label: "dev",
    suffix: "-dev"
  },
  {
    label: "test",
    suffix: "-test"
  },
  {
    label: "staging",
    suffix: "-staging"
  }
];
function readRuntimeEnv(key) {
  var _a, _b, _c, _d;
  const viteValue = (_b = (_a = globalThis["import.meta"]) == null ? void 0 : _a.env) == null ? void 0 : _b[key];
  if (typeof viteValue === "string" && viteValue.length > 0) return viteValue;
  const processValue = (_d = (_c = globalThis["process"]) == null ? void 0 : _c.env) == null ? void 0 : _d[key];
  if (typeof processValue === "string" && processValue.length > 0) return processValue;
}
function splitBaseUrls(value) {
  return (typeof value === "string" ? value : value.join(",")).split(/[,;]/).map((item) => item.trim()).filter((item) => item.length > 0);
}
function getEnvironmentLabel(hostname) {
  const host = (hostname || "").toLowerCase();
  if (!host) return "development";
  if (isLocalhost(host) || isIpAddress(host)) return "development";
  for (const { label, suffix } of ENV_SUFFIXES) if (host.includes(suffix + ".")) return label;
  return "production";
}
function getBrand(hostname) {
  const host = (hostname || "").toLowerCase();
  const parts = host.split(".").filter((p) => p.length > 0);
  if (parts.length < 2) return host || "";
  return parts.slice(-2).join(".");
}
function getApiHostForEnvironment(environmentLabel, brand) {
  const env = environmentLabel.toLowerCase();
  return `${env === "production" ? "api." : `api-${env}.`}${brand.toLowerCase().replace(/^\.+|\.+$/g, "")}`;
}
function resolveBaseUrl(options = {}) {
  var _a, _b, _c, _d, _e, _f;
  const candidates = options.baseUrls ? splitBaseUrls(options.baseUrls) : splitBaseUrls((_c = ((_a = options.readEnv) != null ? _a : readRuntimeEnv)((_b = options.envKey) != null ? _b : DEFAULT_BASE_URL_ENV_KEY)) != null ? _c : "");
  const currentHost = (_d = options.hostname) != null ? _d : getCurrentHostname();
  const currentProtocol = (_e = options.protocol) != null ? _e : getCurrentProtocol();
  const expectedApiHost = getApiHostForEnvironment(getEnvironmentLabel(currentHost), getBrand(currentHost));
  const normalizeCandidate = options.preservePath ? removeTrailingSlash : toBaseOrigin;
  if (candidates.length === 0) {
    if (currentHost && expectedApiHost) return {
      url: `${currentProtocol}://${expectedApiHost}`,
      reason: "current-host-match"
    };
    return {
      url: "",
      reason: "empty"
    };
  }
  const sameProtocol = candidates.find((candidate) => {
    const host = getHostname(candidate);
    const protocol = getProtocol(candidate);
    return host === expectedApiHost && protocol.toLowerCase() === currentProtocol.toLowerCase();
  });
  if (sameProtocol) return {
    url: normalizeCandidate(sameProtocol),
    reason: "current-host-match"
  };
  const anyProtocol = candidates.find((candidate) => getHostname(candidate) === expectedApiHost);
  if (anyProtocol) return {
    url: normalizeCandidate(anyProtocol),
    reason: "current-host-match"
  };
  return {
    url: normalizeCandidate((_f = candidates[0]) != null ? _f : ""),
    reason: "fallback-first"
  };
}
function toBaseOrigin(url) {
  try {
    const parsed = new URL(url);
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.origin;
  } catch {
    return url.replace(/\/+$/, "");
  }
}
function getCurrentHostname() {
  if (typeof window !== "undefined" && window.location) return window.location.hostname;
  return "";
}
function getCurrentProtocol() {
  if (typeof window !== "undefined" && window.location) return window.location.protocol.replace(":", "");
  return "https";
}
function isAbsolute(url) {
  return /^[a-z][a-z\d+\-.]*:\/\//i.test(url);
}
function getProtocol(url) {
  try {
    return new URL(url).protocol.replace(":", "");
  } catch {
    return "";
  }
}
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
function isLocalhost(url) {
  const hostname = hostnameOf(url).toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.startsWith("172.");
}
function isIpAddress(url) {
  const hostname = hostnameOf(url);
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || /^\[?([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\]?$/.test(hostname);
}
function hostnameOf(url) {
  if (isAbsolute(url)) return getHostname(url);
  return url;
}
function removeTrailingSlash(url) {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.href;
  } catch {
    return url.replace(/\/+$/, "") || "/";
  }
}

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/sdkwork-skills/node_modules/.pnpm/@sdkwork_utils@0.11.0/node_modules/@sdkwork/utils/dist/runtime/random.js
function getCrypto() {
  const crypto = globalThis.crypto;
  if (!(crypto == null ? void 0 : crypto.getRandomValues)) throw new Error("Web Crypto API is not available in this environment.");
  return crypto;
}
function randomBytes(length) {
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return bytes;
}
function randomUuid() {
  const crypto = getCrypto();
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = randomBytes(16);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/sdkwork-skills/node_modules/.pnpm/@sdkwork_utils@0.11.0/node_modules/@sdkwork/utils/dist/id.js
function uuid() {
  return randomUuid();
}

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/utils/string.js
var StringUtils;
(function(_StringUtils) {
  function isEmpty(value) {
    return value === null || value === void 0 || value === "";
  }
  _StringUtils.isEmpty = isEmpty;
  function isNotEmpty(value) {
    return !isEmpty(value);
  }
  _StringUtils.isNotEmpty = isNotEmpty;
  function isBlank2(value) {
    if (isEmpty(value)) return true;
    if (typeof value !== "string") return false;
    return value.trim().length === 0;
  }
  _StringUtils.isBlank = isBlank2;
  function isNotBlank(value) {
    return !isBlank2(value);
  }
  _StringUtils.isNotBlank = isNotBlank;
  function trim2(value) {
    var _a;
    return (_a = value == null ? void 0 : value.trim()) != null ? _a : "";
  }
  _StringUtils.trim = trim2;
  function trimStart(value) {
    var _a;
    return (_a = value == null ? void 0 : value.trimStart()) != null ? _a : "";
  }
  _StringUtils.trimStart = trimStart;
  function trimEnd(value) {
    var _a;
    return (_a = value == null ? void 0 : value.trimEnd()) != null ? _a : "";
  }
  _StringUtils.trimEnd = trimEnd;
  function toLowerCase(value) {
    var _a;
    return (_a = value == null ? void 0 : value.toLowerCase()) != null ? _a : "";
  }
  _StringUtils.toLowerCase = toLowerCase;
  function toUpperCase(value) {
    var _a;
    return (_a = value == null ? void 0 : value.toUpperCase()) != null ? _a : "";
  }
  _StringUtils.toUpperCase = toUpperCase;
  function capitalize(value) {
    if (isEmpty(value)) return "";
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }
  _StringUtils.capitalize = capitalize;
  function capitalizeWords(value) {
    if (isEmpty(value)) return "";
    return value.split(/\s+/).map(capitalize).join(" ");
  }
  _StringUtils.capitalizeWords = capitalizeWords;
  function camelCase(value) {
    if (isEmpty(value)) return "";
    return value.replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : "").replace(/^(.)/, (char) => char.toLowerCase());
  }
  _StringUtils.camelCase = camelCase;
  function pascalCase(value) {
    if (isEmpty(value)) return "";
    const camel = camelCase(value);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
  }
  _StringUtils.pascalCase = pascalCase;
  function kebabCase(value) {
    if (isEmpty(value)) return "";
    return value.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
  }
  _StringUtils.kebabCase = kebabCase;
  function snakeCase(value) {
    if (isEmpty(value)) return "";
    return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();
  }
  _StringUtils.snakeCase = snakeCase;
  function constantCase(value) {
    return snakeCase(value).toUpperCase();
  }
  _StringUtils.constantCase = constantCase;
  function truncate2(value, length, suffix = "...") {
    if (isEmpty(value) || value.length <= length) return value != null ? value : "";
    return value.slice(0, length - suffix.length) + suffix;
  }
  _StringUtils.truncate = truncate2;
  function truncateWords(value, wordCount2, suffix = "...") {
    if (isEmpty(value)) return "";
    const words2 = value.split(/\s+/);
    if (words2.length <= wordCount2) return value;
    return words2.slice(0, wordCount2).join(" ") + suffix;
  }
  _StringUtils.truncateWords = truncateWords;
  function padStart(value, length, padChar = " ") {
    var _a;
    return (_a = value == null ? void 0 : value.padStart(length, padChar)) != null ? _a : "";
  }
  _StringUtils.padStart = padStart;
  function padEnd(value, length, padChar = " ") {
    var _a;
    return (_a = value == null ? void 0 : value.padEnd(length, padChar)) != null ? _a : "";
  }
  _StringUtils.padEnd = padEnd;
  function repeat(value, count) {
    if (isEmpty(value) || count <= 0) return "";
    return value.repeat(count);
  }
  _StringUtils.repeat = repeat;
  function reverse(value) {
    if (isEmpty(value)) return "";
    return value.split("").reverse().join("");
  }
  _StringUtils.reverse = reverse;
  function startsWith(value, prefix) {
    var _a;
    return (_a = value == null ? void 0 : value.startsWith(prefix)) != null ? _a : false;
  }
  _StringUtils.startsWith = startsWith;
  function endsWith(value, suffix) {
    var _a;
    return (_a = value == null ? void 0 : value.endsWith(suffix)) != null ? _a : false;
  }
  _StringUtils.endsWith = endsWith;
  function contains(value, search) {
    var _a;
    return (_a = value == null ? void 0 : value.includes(search)) != null ? _a : false;
  }
  _StringUtils.contains = contains;
  function containsIgnoreCase(value, search) {
    var _a;
    return (_a = value == null ? void 0 : value.toLowerCase().includes(search.toLowerCase())) != null ? _a : false;
  }
  _StringUtils.containsIgnoreCase = containsIgnoreCase;
  function indexOf(value, search) {
    var _a;
    return (_a = value == null ? void 0 : value.indexOf(search)) != null ? _a : -1;
  }
  _StringUtils.indexOf = indexOf;
  function lastIndexOf(value, search) {
    var _a;
    return (_a = value == null ? void 0 : value.lastIndexOf(search)) != null ? _a : -1;
  }
  _StringUtils.lastIndexOf = lastIndexOf;
  function substring(value, start, end) {
    if (isEmpty(value)) return "";
    return end !== void 0 ? value.slice(start, end) : value.slice(start);
  }
  _StringUtils.substring = substring;
  function slice(value, start, end) {
    return substring(value, start, end);
  }
  _StringUtils.slice = slice;
  function split(value, separator, limit) {
    if (isEmpty(value)) return [];
    return value.split(separator, limit);
  }
  _StringUtils.split = split;
  function join(values, separator = "") {
    var _a;
    return (_a = values == null ? void 0 : values.join(separator)) != null ? _a : "";
  }
  _StringUtils.join = join;
  function replace(value, search, replacement) {
    var _a;
    return (_a = value == null ? void 0 : value.replace(search, replacement)) != null ? _a : "";
  }
  _StringUtils.replace = replace;
  function replaceAll(value, search, replacement) {
    var _a;
    return (_a = value == null ? void 0 : value.replaceAll(search, replacement)) != null ? _a : "";
  }
  _StringUtils.replaceAll = replaceAll;
  function remove(value, search) {
    var _a;
    return (_a = value == null ? void 0 : value.replace(search, "")) != null ? _a : "";
  }
  _StringUtils.remove = remove;
  function removeAll(value, search) {
    var _a;
    const regex = typeof search === "string" ? new RegExp(search, "g") : new RegExp(search.source, `${search.flags}g`);
    return (_a = value == null ? void 0 : value.replace(regex, "")) != null ? _a : "";
  }
  _StringUtils.removeAll = removeAll;
  function countOccurrences(value, search) {
    if (isEmpty(value) || isEmpty(search)) return 0;
    return (value.match(new RegExp(escapeRegex(search), "g")) || []).length;
  }
  _StringUtils.countOccurrences = countOccurrences;
  function escapeHtml(value) {
    var _a;
    const htmlEntities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return (_a = value == null ? void 0 : value.replace(/[&<>"']/g, (char) => htmlEntities[char] || char)) != null ? _a : "";
  }
  _StringUtils.escapeHtml = escapeHtml;
  function unescapeHtml(value) {
    var _a;
    const htmlEntities = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&#39;": "'",
      "&#x27;": "'",
      "&apos;": "'"
    };
    return (_a = value == null ? void 0 : value.replace(/&(?:amp|lt|gt|quot|#39|#x27|apos);/g, (entity) => htmlEntities[entity] || entity)) != null ? _a : "";
  }
  _StringUtils.unescapeHtml = unescapeHtml;
  function escapeRegex(value) {
    var _a;
    return (_a = value == null ? void 0 : value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) != null ? _a : "";
  }
  _StringUtils.escapeRegex = escapeRegex;
  function isNumeric(value) {
    if (isEmpty(value)) return false;
    return !isNaN(Number(value)) && !isNaN(parseFloat(value));
  }
  _StringUtils.isNumeric = isNumeric;
  function isAlpha(value) {
    if (isEmpty(value)) return false;
    return /^[a-zA-Z]+$/.test(value);
  }
  _StringUtils.isAlpha = isAlpha;
  function isAlphanumeric(value) {
    if (isEmpty(value)) return false;
    return /^[a-zA-Z0-9]+$/.test(value);
  }
  _StringUtils.isAlphanumeric = isAlphanumeric;
  function isHex(value) {
    if (isEmpty(value)) return false;
    return /^[0-9a-fA-F]+$/.test(value);
  }
  _StringUtils.isHex = isHex;
  function isUuid(value) {
    if (isEmpty(value)) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
  _StringUtils.isUuid = isUuid;
  function isEmail(value) {
    if (isEmpty(value)) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
  _StringUtils.isEmail = isEmail;
  function isUrl(value) {
    if (isEmpty(value)) return false;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
  _StringUtils.isUrl = isUrl;
  function isPhoneNumber(value) {
    if (isEmpty(value)) return false;
    return /^\+?[\d\s-()]{10,}$/.test(value);
  }
  _StringUtils.isPhoneNumber = isPhoneNumber;
  function mask(value, start, end, maskChar = "*") {
    if (isEmpty(value)) return "";
    const actualStart = Math.max(0, start);
    const actualEnd = Math.min(value.length, end);
    if (actualStart >= actualEnd) return value;
    const masked = maskChar.repeat(actualEnd - actualStart);
    return value.slice(0, actualStart) + masked + value.slice(actualEnd);
  }
  _StringUtils.mask = mask;
  function maskEmail(value) {
    if (!isEmail(value)) return value;
    const parts = value.split("@");
    const localPart = parts[0];
    const domain = parts[1];
    if (!localPart || !domain) return value;
    return `${mask(localPart, 2, localPart.length - 2)}@${domain}`;
  }
  _StringUtils.maskEmail = maskEmail;
  function maskPhone(value) {
    if (isEmpty(value)) return value;
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7) return value;
    return mask(digits, 3, digits.length - 4);
  }
  _StringUtils.maskPhone = maskPhone;
  function maskCreditCard(value) {
    if (isEmpty(value)) return value;
    const digits = value.replace(/\D/g, "");
    if (digits.length < 8) return value;
    return mask(digits, 4, digits.length - 4);
  }
  _StringUtils.maskCreditCard = maskCreditCard;
  function formatNumber(value, options) {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "";
    return num.toLocaleString(void 0, options);
  }
  _StringUtils.formatNumber = formatNumber;
  function formatCurrency(value, currency = "USD", locale) {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "";
    return num.toLocaleString(locale, {
      style: "currency",
      currency
    });
  }
  _StringUtils.formatCurrency = formatCurrency;
  function formatPercentage(value, decimals = 0) {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "";
    return `${(num * 100).toFixed(decimals)}%`;
  }
  _StringUtils.formatPercentage = formatPercentage;
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = [
      "Bytes",
      "KB",
      "MB",
      "GB",
      "TB",
      "PB"
    ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
  }
  _StringUtils.formatBytes = formatBytes;
  function random(length = 16, charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
    let result = "";
    for (let i = 0; i < length; i++) result += charset.charAt(Math.floor(Math.random() * charset.length));
    return result;
  }
  _StringUtils.random = random;
  function uuid$1() {
    return uuid();
  }
  _StringUtils.uuid = uuid$1;
  function slugify(value) {
    var _a;
    return (_a = value == null ? void 0 : value.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "")) != null ? _a : "";
  }
  _StringUtils.slugify = slugify;
  function unslugify(value) {
    var _a;
    return (_a = value == null ? void 0 : value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())) != null ? _a : "";
  }
  _StringUtils.unslugify = unslugify;
  function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) if (matrix[0]) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) for (let j = 1; j <= a.length; j++) if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
    else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    return matrix[b.length][a.length];
  }
  _StringUtils.levenshteinDistance = levenshteinDistance;
  function similarity(a, b) {
    if (isEmpty(a) && isEmpty(b)) return 1;
    if (isEmpty(a) || isEmpty(b)) return 0;
    return 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length);
  }
  _StringUtils.similarity = similarity;
  function fuzzyMatch(text, pattern, threshold = 0.6) {
    return similarity(text, pattern) >= threshold;
  }
  _StringUtils.fuzzyMatch = fuzzyMatch;
  function equals(a, b, ignoreCase = false) {
    if (ignoreCase) return (a == null ? void 0 : a.toLowerCase()) === (b == null ? void 0 : b.toLowerCase());
    return a === b;
  }
  _StringUtils.equals = equals;
  function equalsIgnoreCase(a, b) {
    return equals(a, b, true);
  }
  _StringUtils.equalsIgnoreCase = equalsIgnoreCase;
  function wordCount(value) {
    if (isEmpty(value)) return 0;
    return value.trim().split(/\s+/).filter(Boolean).length;
  }
  _StringUtils.wordCount = wordCount;
  function characterCount(value, includeSpaces = true) {
    if (isEmpty(value)) return 0;
    return includeSpaces ? value.length : value.replace(/\s/g, "").length;
  }
  _StringUtils.characterCount = characterCount;
  function lineCount(value) {
    if (isEmpty(value)) return 0;
    return value.split(/\r?\n/).length;
  }
  _StringUtils.lineCount = lineCount;
  function splitLines(value) {
    if (isEmpty(value)) return [];
    return value.split(/\r?\n/);
  }
  _StringUtils.splitLines = splitLines;
  function words(value) {
    if (isEmpty(value)) return [];
    return value.trim().split(/\s+/).filter(Boolean);
  }
  _StringUtils.words = words;
  function charAt(value, index) {
    var _a;
    return (_a = value == null ? void 0 : value.charAt(index)) != null ? _a : "";
  }
  _StringUtils.charAt = charAt;
  function charCodeAt(value, index) {
    var _a;
    return (_a = value == null ? void 0 : value.charCodeAt(index)) != null ? _a : NaN;
  }
  _StringUtils.charCodeAt = charCodeAt;
  function fromCharCode(...codes) {
    return String.fromCharCode(...codes);
  }
  _StringUtils.fromCharCode = fromCharCode;
  function insert(value, index, insertValue) {
    if (isEmpty(value)) return insertValue;
    return value.slice(0, index) + insertValue + value.slice(index);
  }
  _StringUtils.insert = insert;
  function swapCase(value) {
    var _a;
    return (_a = value == null ? void 0 : value.replace(/[a-zA-Z]/g, (char) => {
      return char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase();
    })) != null ? _a : "";
  }
  _StringUtils.swapCase = swapCase;
  function surround(value, wrapper) {
    return `${wrapper}${value}${wrapper}`;
  }
  _StringUtils.surround = surround;
  function quote(value, quoteChar = '"') {
    return `${quoteChar}${value}${quoteChar}`;
  }
  _StringUtils.quote = quote;
  function unquote(value) {
    if (isEmpty(value)) return "";
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'") || value.startsWith("`") && value.endsWith("`")) return value.slice(1, -1);
    return value;
  }
  _StringUtils.unquote = unquote;
  function wrap(value, prefix, suffix = prefix) {
    return `${prefix}${value}${suffix}`;
  }
  _StringUtils.wrap = wrap;
  function unwrap(value, prefix, suffix = prefix) {
    if (isEmpty(value)) return "";
    if (value.startsWith(prefix) && value.endsWith(suffix)) return value.slice(prefix.length, -suffix.length);
    return value;
  }
  _StringUtils.unwrap = unwrap;
  function template(templateStr, values) {
    var _a;
    return (_a = templateStr == null ? void 0 : templateStr.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      var _a2;
      return String((_a2 = values[key]) != null ? _a2 : "");
    })) != null ? _a : "";
  }
  _StringUtils.template = template;
  function interpolate(templateStr, values) {
    return template(templateStr, values);
  }
  _StringUtils.interpolate = interpolate;
  function dedent(value) {
    const lines = value.split("\n");
    const minIndent = Math.min(...lines.filter((line) => line.trim().length > 0).map((line) => {
      var _a, _b;
      return (_b = (_a = line.match(/^\s*/)) == null ? void 0 : _a[0].length) != null ? _b : 0;
    }));
    return lines.map((line) => line.slice(minIndent)).join("\n");
  }
  _StringUtils.dedent = dedent;
  function indent(value, spaces = 2) {
    const indentation = " ".repeat(spaces);
    return value.split("\n").map((line) => indentation + line).join("\n");
  }
  _StringUtils.indent = indent;
  function center(value, width, padChar = " ") {
    if (isEmpty(value) || value.length >= width) return value != null ? value : "";
    const padding = width - value.length;
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return padChar.repeat(leftPad) + value + padChar.repeat(rightPad);
  }
  _StringUtils.center = center;
  function alignLeft(value, width, padChar = " ") {
    return padEnd(value, width, padChar);
  }
  _StringUtils.alignLeft = alignLeft;
  function alignRight(value, width, padChar = " ") {
    return padStart(value, width, padChar);
  }
  _StringUtils.alignRight = alignRight;
  function alignCenter(value, width, padChar = " ") {
    return center(value, width, padChar);
  }
  _StringUtils.alignCenter = alignCenter;
  function toBoolean(value) {
    return [
      "true",
      "1",
      "yes",
      "on",
      "y"
    ].includes(value == null ? void 0 : value.toLowerCase().trim());
  }
  _StringUtils.toBoolean = toBoolean;
  function toNumber(value, defaultValue = 0) {
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
  }
  _StringUtils.toNumber = toNumber;
  function toArray(value, separator = ",") {
    return split(value, separator);
  }
  _StringUtils.toArray = toArray;
  function hashCode(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }
  _StringUtils.hashCode = hashCode;
  function isPalindrome(value) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    return cleaned === cleaned.split("").reverse().join("");
  }
  _StringUtils.isPalindrome = isPalindrome;
  function isAnagram(a, b) {
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "").split("").sort().join("");
    return normalize(a) === normalize(b);
  }
  _StringUtils.isAnagram = isAnagram;
  function reverseWords(value) {
    var _a;
    return (_a = value == null ? void 0 : value.split(/\s+/).reverse().join(" ")) != null ? _a : "";
  }
  _StringUtils.reverseWords = reverseWords;
  function sortCharacters(value) {
    var _a;
    return (_a = value == null ? void 0 : value.split("").sort().join("")) != null ? _a : "";
  }
  _StringUtils.sortCharacters = sortCharacters;
  function uniqueCharacters(value) {
    return [...new Set(value)].join("");
  }
  _StringUtils.uniqueCharacters = uniqueCharacters;
  function removeDuplicates(value) {
    var _a;
    return (_a = value == null ? void 0 : value.split("").filter((char, index, arr) => arr.indexOf(char) === index).join("")) != null ? _a : "";
  }
  _StringUtils.removeDuplicates = removeDuplicates;
  function longestCommonSubstring(a, b) {
    if (isEmpty(a) || isEmpty(b)) return "";
    const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(0));
    let maxLength = 0;
    let endIndex = 0;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) if (a[i - 1] === b[j - 1]) {
      matrix[i][j] = matrix[i - 1][j - 1] + 1;
      if (matrix[i][j] > maxLength) {
        maxLength = matrix[i][j];
        endIndex = i;
      }
    }
    return a.slice(endIndex - maxLength, endIndex);
  }
  _StringUtils.longestCommonSubstring = longestCommonSubstring;
  function longestCommonPrefix(strings) {
    var _a, _b, _c;
    if (strings.length === 0) return "";
    if (strings.length === 1) return (_a = strings[0]) != null ? _a : "";
    const sorted = [...strings].sort();
    const first = (_b = sorted[0]) != null ? _b : "";
    const last = (_c = sorted[sorted.length - 1]) != null ? _c : "";
    let i = 0;
    while (i < first.length && first[i] === last[i]) i++;
    return first.slice(0, i);
  }
  _StringUtils.longestCommonPrefix = longestCommonPrefix;
  function longestCommonSuffix(strings) {
    return longestCommonPrefix(strings.map((s) => {
      var _a;
      return (_a = s == null ? void 0 : s.split("").reverse().join("")) != null ? _a : "";
    })).split("").reverse().join("");
  }
  _StringUtils.longestCommonSuffix = longestCommonSuffix;
  function truncateMiddle(value, maxLength, separator = "...") {
    if (isEmpty(value) || value.length <= maxLength) return value != null ? value : "";
    const charsToShow = maxLength - separator.length;
    const frontChars = Math.ceil(charsToShow / 2);
    const backChars = Math.floor(charsToShow / 2);
    return value.slice(0, frontChars) + separator + value.slice(-backChars);
  }
  _StringUtils.truncateMiddle = truncateMiddle;
  function ellipsis(value, maxLength) {
    return truncate2(value, maxLength, "...");
  }
  _StringUtils.ellipsis = ellipsis;
  function ellipsisMiddle(value, maxLength) {
    return truncateMiddle(value, maxLength, "...");
  }
  _StringUtils.ellipsisMiddle = ellipsisMiddle;
  function pad(value, length, padChar = " ") {
    return center(value, length, padChar);
  }
  _StringUtils.pad = pad;
  function padCenter(value, length, padChar = " ") {
    return center(value, length, padChar);
  }
  _StringUtils.padCenter = padCenter;
  function isAscii(value) {
    return /^[\x00-\x7F]*$/.test(value);
  }
  _StringUtils.isAscii = isAscii;
  function isLowerCase(value) {
    return value === value.toLowerCase();
  }
  _StringUtils.isLowerCase = isLowerCase;
  function isUpperCase(value) {
    return value === value.toUpperCase();
  }
  _StringUtils.isUpperCase = isUpperCase;
  function isCapitalized(value) {
    return value.charAt(0) === value.charAt(0).toUpperCase();
  }
  _StringUtils.isCapitalized = isCapitalized;
  function swapPrefix(value, oldPrefix, newPrefix) {
    if (value.startsWith(oldPrefix)) return newPrefix + value.slice(oldPrefix.length);
    return value;
  }
  _StringUtils.swapPrefix = swapPrefix;
  function swapSuffix(value, oldSuffix, newSuffix) {
    if (value.endsWith(oldSuffix)) return value.slice(0, -oldSuffix.length) + newSuffix;
    return value;
  }
  _StringUtils.swapSuffix = swapSuffix;
  function ensurePrefix(value, prefix) {
    return value.startsWith(prefix) ? value : prefix + value;
  }
  _StringUtils.ensurePrefix = ensurePrefix;
  function ensureSuffix(value, suffix) {
    return value.endsWith(suffix) ? value : value + suffix;
  }
  _StringUtils.ensureSuffix = ensureSuffix;
  function removePrefix(value, prefix) {
    return value.startsWith(prefix) ? value.slice(prefix.length) : value;
  }
  _StringUtils.removePrefix = removePrefix;
  function removeSuffix(value, suffix) {
    return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
  }
  _StringUtils.removeSuffix = removeSuffix;
  function take(value, n) {
    var _a;
    return (_a = value == null ? void 0 : value.slice(0, n)) != null ? _a : "";
  }
  _StringUtils.take = take;
  function takeRight(value, n) {
    var _a;
    return (_a = value == null ? void 0 : value.slice(-n)) != null ? _a : "";
  }
  _StringUtils.takeRight = takeRight;
  function takeWhile(value, predicate) {
    let result = "";
    for (const char of value != null ? value : "") {
      if (!predicate(char)) break;
      result += char;
    }
    return result;
  }
  _StringUtils.takeWhile = takeWhile;
  function takeRightWhile(value, predicate) {
    var _a, _b;
    let result = "";
    for (let i = ((_a = value == null ? void 0 : value.length) != null ? _a : 0) - 1; i >= 0; i--) {
      const char = (_b = value == null ? void 0 : value.charAt(i)) != null ? _b : "";
      if (!predicate(char)) break;
      result = char + result;
    }
    return result;
  }
  _StringUtils.takeRightWhile = takeRightWhile;
  function drop(value, n) {
    var _a;
    return (_a = value == null ? void 0 : value.slice(n)) != null ? _a : "";
  }
  _StringUtils.drop = drop;
  function dropRight(value, n) {
    var _a;
    return (_a = value == null ? void 0 : value.slice(0, -n)) != null ? _a : "";
  }
  _StringUtils.dropRight = dropRight;
  function dropWhile(value, predicate) {
    var _a;
    let i = 0;
    for (const char of value != null ? value : "") {
      if (!predicate(char)) break;
      i++;
    }
    return (_a = value == null ? void 0 : value.slice(i)) != null ? _a : "";
  }
  _StringUtils.dropWhile = dropWhile;
  function dropRightWhile(value, predicate) {
    var _a, _b, _c;
    let i = ((_a = value == null ? void 0 : value.length) != null ? _a : 0) - 1;
    while (i >= 0 && predicate((_b = value == null ? void 0 : value.charAt(i)) != null ? _b : "")) i--;
    return (_c = value == null ? void 0 : value.slice(0, i + 1)) != null ? _c : "";
  }
  _StringUtils.dropRightWhile = dropRightWhile;
  function countLines(value) {
    return lineCount(value);
  }
  _StringUtils.countLines = countLines;
  function getLine(value, lineNumber) {
    var _a;
    return (_a = splitLines(value)[lineNumber]) != null ? _a : "";
  }
  _StringUtils.getLine = getLine;
  function getLines(value) {
    return splitLines(value);
  }
  _StringUtils.getLines = getLines;
  function isSingleLine(value) {
    return !(value == null ? void 0 : value.includes("\n"));
  }
  _StringUtils.isSingleLine = isSingleLine;
  function isMultiLine(value) {
    var _a;
    return (_a = value == null ? void 0 : value.includes("\n")) != null ? _a : false;
  }
  _StringUtils.isMultiLine = isMultiLine;
  function normalizeLineEndings(value, lineEnding = "\n") {
    var _a;
    return (_a = value == null ? void 0 : value.replace(/\r\n|\r|\n/g, lineEnding)) != null ? _a : "";
  }
  _StringUtils.normalizeLineEndings = normalizeLineEndings;
  function toCamelCase(value) {
    return camelCase(value);
  }
  _StringUtils.toCamelCase = toCamelCase;
  function toKebabCase(value) {
    return kebabCase(value);
  }
  _StringUtils.toKebabCase = toKebabCase;
  function toSnakeCase(value) {
    return snakeCase(value);
  }
  _StringUtils.toSnakeCase = toSnakeCase;
  function toPascalCase(value) {
    return pascalCase(value);
  }
  _StringUtils.toPascalCase = toPascalCase;
  function toConstantCase(value) {
    return constantCase(value);
  }
  _StringUtils.toConstantCase = toConstantCase;
  function toSentenceCase(value) {
    if (isEmpty(value)) return "";
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }
  _StringUtils.toSentenceCase = toSentenceCase;
  function toTitleCase(value) {
    return capitalizeWords(value);
  }
  _StringUtils.toTitleCase = toTitleCase;
  function toCapitalCase(value) {
    return capitalizeWords(value);
  }
  _StringUtils.toCapitalCase = toCapitalCase;
  function toDotCase(value) {
    var _a;
    return (_a = value == null ? void 0 : value.replace(/([a-z])([A-Z])/g, "$1.$2").replace(/[-_\s]+/g, ".").toLowerCase()) != null ? _a : "";
  }
  _StringUtils.toDotCase = toDotCase;
  function toPathCase(value) {
    var _a;
    return (_a = value == null ? void 0 : value.replace(/([a-z])([A-Z])/g, "$1/$2").replace(/[-_\s]+/g, "/").toLowerCase()) != null ? _a : "";
  }
  _StringUtils.toPathCase = toPathCase;
  function stripTags(value) {
    var _a;
    return (_a = value == null ? void 0 : value.replace(/<[^>]*>/g, "")) != null ? _a : "";
  }
  _StringUtils.stripTags = stripTags;
  function stripNumbers(value) {
    var _a;
    return (_a = value == null ? void 0 : value.replace(/\d+/g, "")) != null ? _a : "";
  }
  _StringUtils.stripNumbers = stripNumbers;
  function stripWhitespace(value) {
    var _a;
    return (_a = value == null ? void 0 : value.replace(/\s+/g, "")) != null ? _a : "";
  }
  _StringUtils.stripWhitespace = stripWhitespace;
  function stripPunctuation(value) {
    var _a;
    return (_a = value == null ? void 0 : value.replace(/[^\w\s]/g, "")) != null ? _a : "";
  }
  _StringUtils.stripPunctuation = stripPunctuation;
  function normalizeWhitespace(value) {
    var _a;
    return (_a = value == null ? void 0 : value.replace(/\s+/g, " ").trim()) != null ? _a : "";
  }
  _StringUtils.normalizeWhitespace = normalizeWhitespace;
  function includesAll(value, searches) {
    return searches.every((search) => {
      var _a;
      return (_a = value == null ? void 0 : value.includes(search)) != null ? _a : false;
    });
  }
  _StringUtils.includesAll = includesAll;
  function includesAny(value, searches) {
    return searches.some((search) => {
      var _a;
      return (_a = value == null ? void 0 : value.includes(search)) != null ? _a : false;
    });
  }
  _StringUtils.includesAny = includesAny;
})(StringUtils || (StringUtils = {}));

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/utils/encoding.js
var Encoding;
(function(_Encoding) {
  function base64Encode2(input) {
    var _a, _b, _c;
    let bytes;
    if (typeof input === "string") bytes = new TextEncoder().encode(input);
    else bytes = input;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";
    let i = 0;
    while (i < bytes.length) {
      const a = (_a = bytes[i++]) != null ? _a : 0;
      const b = i < bytes.length ? (_b = bytes[i++]) != null ? _b : 0 : 0;
      const c = i < bytes.length ? (_c = bytes[i++]) != null ? _c : 0 : 0;
      const bitmap = a << 16 | b << 8 | c;
      result += chars[bitmap >> 18 & 63];
      result += chars[bitmap >> 12 & 63];
      result += i > bytes.length + 1 ? "=" : chars[bitmap >> 6 & 63];
      result += i > bytes.length ? "=" : chars[bitmap & 63];
    }
    return result;
  }
  _Encoding.base64Encode = base64Encode2;
  function base64Decode2(input) {
    var _a, _b, _c, _d;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    input = input.replace(/[^A-Za-z0-9+/]/g, "");
    const len = input.length;
    let result = "";
    let i = 0;
    while (i < len) {
      const a = chars.indexOf((_a = input[i++]) != null ? _a : "");
      const b = chars.indexOf((_b = input[i++]) != null ? _b : "");
      const c = chars.indexOf((_c = input[i++]) != null ? _c : "");
      const d = chars.indexOf((_d = input[i++]) != null ? _d : "");
      const bitmap = a << 18 | b << 12 | c << 6 | d;
      result += String.fromCharCode(bitmap >> 16 & 255);
      if (c !== 64 && input[i - 2] !== "=") result += String.fromCharCode(bitmap >> 8 & 255);
      if (d !== 64 && input[i - 1] !== "=") result += String.fromCharCode(bitmap & 255);
    }
    return result;
  }
  _Encoding.base64Decode = base64Decode2;
  function base64UrlEncode2(input) {
    return base64Encode2(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }
  _Encoding.base64UrlEncode = base64UrlEncode2;
  function base64UrlDecode2(input) {
    input = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = input.length % 4;
    if (pad) input += "=".repeat(4 - pad);
    return base64Decode2(input);
  }
  _Encoding.base64UrlDecode = base64UrlDecode2;
  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  _Encoding.base64ToBytes = base64ToBytes;
  function bytesToBase64(bytes) {
    var _a;
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode((_a = bytes[i]) != null ? _a : 0);
    return btoa(binary);
  }
  _Encoding.bytesToBase64 = bytesToBase64;
  function utf8Encode(input) {
    return new TextEncoder().encode(input);
  }
  _Encoding.utf8Encode = utf8Encode;
  function utf8Decode(input) {
    return new TextDecoder().decode(input);
  }
  _Encoding.utf8Decode = utf8Decode;
  function hexEncode2(input) {
    const bytes = typeof input === "string" ? utf8Encode(input) : input;
    return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  _Encoding.hexEncode = hexEncode2;
  function hexDecode2(input) {
    const bytes = new Uint8Array(input.length / 2);
    for (let i = 0; i < input.length; i += 2) bytes[i / 2] = parseInt(input.substr(i, 2), 16);
    return utf8Decode(bytes);
  }
  _Encoding.hexDecode = hexDecode2;
  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    return bytes;
  }
  _Encoding.hexToBytes = hexToBytes;
  function bytesToHex(bytes) {
    return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  _Encoding.bytesToHex = bytesToHex;
  function urlEncode(input) {
    return encodeURIComponent(input);
  }
  _Encoding.urlEncode = urlEncode;
  function urlDecode(input) {
    return decodeURIComponent(input);
  }
  _Encoding.urlDecode = urlDecode;
  function urlEncodeComponent(input) {
    return encodeURIComponent(input);
  }
  _Encoding.urlEncodeComponent = urlEncodeComponent;
  function urlDecodeComponent(input) {
    return decodeURIComponent(input);
  }
  _Encoding.urlDecodeComponent = urlDecodeComponent;
  function htmlEncode(input) {
    const htmlEntities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "/": "&#x2F;",
      "`": "&#x60;",
      "=": "&#x3D;"
    };
    return input.replace(/[&<>"'`=/]/g, (char) => htmlEntities[char] || char);
  }
  _Encoding.htmlEncode = htmlEncode;
  function htmlDecode(input) {
    const htmlEntities = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&#39;": "'",
      "&#x27;": "'",
      "&#x2F;": "/",
      "&#x60;": "`",
      "&#x3D;": "=",
      "&nbsp;": " "
    };
    return input.replace(/&[^;]+;/g, (entity) => htmlEntities[entity] || entity);
  }
  _Encoding.htmlDecode = htmlDecode;
  function jsonEncode(value, replacer, space) {
    return JSON.stringify(value, replacer, space);
  }
  _Encoding.jsonEncode = jsonEncode;
  function jsonDecode(input) {
    return JSON.parse(input);
  }
  _Encoding.jsonDecode = jsonDecode;
  function jsonEncodePretty(value, indent = 2) {
    return JSON.stringify(value, null, indent);
  }
  _Encoding.jsonEncodePretty = jsonEncodePretty;
  function tryJsonDecode(input, defaultValue) {
    try {
      return JSON.parse(input);
    } catch {
      return defaultValue;
    }
  }
  _Encoding.tryJsonDecode = tryJsonDecode;
  function isJson(input) {
    try {
      JSON.parse(input);
      return true;
    } catch {
      return false;
    }
  }
  _Encoding.isJson = isJson;
  function xmlEncode(input) {
    const xmlEntities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;"
    };
    return input.replace(/[&<>"']/g, (char) => xmlEntities[char] || char);
  }
  _Encoding.xmlEncode = xmlEncode;
  function xmlDecode(input) {
    const xmlEntities = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'"
    };
    return input.replace(/&[^;]+;/g, (entity) => xmlEntities[entity] || entity);
  }
  _Encoding.xmlDecode = xmlDecode;
  function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  _Encoding.escapeRegex = escapeRegex;
  function escapeSql(input) {
    return input.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, (char) => {
      return {
        "\0": "\\0",
        "\b": "\\b",
        "	": "\\t",
        "": "\\z",
        "\n": "\\n",
        "\r": "\\r",
        '"': '\\"',
        "'": "\\'",
        "\\": "\\\\",
        "%": "\\%"
      }[char] || char;
    });
  }
  _Encoding.escapeSql = escapeSql;
  function escapeShell(input) {
    return input.replace(/[^A-Za-z0-9_\-.,:\/@\n]/g, (char) => {
      if (char === "\n") return "'\\n'";
      return `\\${char}`;
    });
  }
  _Encoding.escapeShell = escapeShell;
  function escapeCString(input) {
    return input.replace(/[\\"'\n\r\t\b\f\v\0]/g, (char) => {
      return {
        "\\": "\\\\",
        '"': '\\"',
        "'": "\\'",
        "\n": "\\n",
        "\r": "\\r",
        "	": "\\t",
        "\b": "\\b",
        "\f": "\\f",
        "\v": "\\v",
        "\0": "\\0"
      }[char] || char;
    });
  }
  _Encoding.escapeCString = escapeCString;
  function unescapeCString(input) {
    return input.replace(/\\([\\\"'nrtbfv0])/g, (_, char) => {
      return {
        "\\": "\\",
        '"': '"',
        "'": "'",
        "n": "\n",
        "r": "\r",
        "t": "	",
        "b": "\b",
        "f": "\f",
        "v": "\v",
        "0": "\0"
      }[char] || char;
    });
  }
  _Encoding.unescapeCString = unescapeCString;
  function camelToSnake(input) {
    return input.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }
  _Encoding.camelToSnake = camelToSnake;
  function snakeToCamel(input) {
    return input.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
  _Encoding.snakeToCamel = snakeToCamel;
  function camelToKebab(input) {
    return input.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  }
  _Encoding.camelToKebab = camelToKebab;
  function kebabToCamel(input) {
    return input.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
  _Encoding.kebabToCamel = kebabToCamel;
  function camelToPascal(input) {
    return input.charAt(0).toUpperCase() + input.slice(1);
  }
  _Encoding.camelToPascal = camelToPascal;
  function pascalToCamel(input) {
    return input.charAt(0).toLowerCase() + input.slice(1);
  }
  _Encoding.pascalToCamel = pascalToCamel;
  function pascalToSnake(input) {
    return camelToSnake(input);
  }
  _Encoding.pascalToSnake = pascalToSnake;
  function snakeToPascal(input) {
    return camelToPascal(snakeToCamel(input));
  }
  _Encoding.snakeToPascal = snakeToPascal;
  function pascalToKebab(input) {
    return camelToKebab(input);
  }
  _Encoding.pascalToKebab = pascalToKebab;
  function kebabToPascal(input) {
    return camelToPascal(kebabToCamel(input));
  }
  _Encoding.kebabToPascal = kebabToPascal;
  function toSnakeCase(input) {
    return input.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[-\s]+/g, "_").toLowerCase();
  }
  _Encoding.toSnakeCase = toSnakeCase;
  function toKebabCase(input) {
    return input.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[_\s]+/g, "-").toLowerCase();
  }
  _Encoding.toKebabCase = toKebabCase;
  function toCamelCase(input) {
    return input.replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : "").replace(/^(.)/, (char) => char.toLowerCase());
  }
  _Encoding.toCamelCase = toCamelCase;
  function toPascalCase(input) {
    const camel = toCamelCase(input);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
  }
  _Encoding.toPascalCase = toPascalCase;
  function toConstantCase(input) {
    return toSnakeCase(input).toUpperCase();
  }
  _Encoding.toConstantCase = toConstantCase;
  function toSentenceCase(input) {
    return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
  }
  _Encoding.toSentenceCase = toSentenceCase;
  function toTitleCase(input) {
    return input.replace(/\b\w/g, (char) => char.toUpperCase());
  }
  _Encoding.toTitleCase = toTitleCase;
  function toCapitalCase(input) {
    return input.replace(/[-_\s]+(.)?/g, (_, char) => char ? ` ${char.toUpperCase()}` : "").trim();
  }
  _Encoding.toCapitalCase = toCapitalCase;
  function toDotCase(input) {
    return input.replace(/([a-z])([A-Z])/g, "$1.$2").replace(/[-_\s]+/g, ".").toLowerCase();
  }
  _Encoding.toDotCase = toDotCase;
  function toPathCase(input) {
    return input.replace(/([a-z])([A-Z])/g, "$1/$2").replace(/[-_\s]+/g, "/").toLowerCase();
  }
  _Encoding.toPathCase = toPathCase;
  function rot13(input) {
    return input.replace(/[a-zA-Z]/g, (char) => {
      const start = char <= "Z" ? 65 : 97;
      return String.fromCharCode((char.charCodeAt(0) - start + 13) % 26 + start);
    });
  }
  _Encoding.rot13 = rot13;
  function caesarCipher(input, shift) {
    return input.replace(/[a-zA-Z]/g, (char) => {
      const start = char <= "Z" ? 65 : 97;
      const shifted = ((char.charCodeAt(0) - start + shift) % 26 + 26) % 26;
      return String.fromCharCode(shifted + start);
    });
  }
  _Encoding.caesarCipher = caesarCipher;
  function caesarDecipher(input, shift) {
    return caesarCipher(input, -shift);
  }
  _Encoding.caesarDecipher = caesarDecipher;
  function xorEncode(input, key) {
    var _a, _b;
    const inputBytes = utf8Encode(input);
    const keyBytes = utf8Encode(key);
    const result = new Uint8Array(inputBytes.length);
    for (let i = 0; i < inputBytes.length; i++) result[i] = ((_a = inputBytes[i]) != null ? _a : 0) ^ ((_b = keyBytes[i % keyBytes.length]) != null ? _b : 0);
    return bytesToHex(result);
  }
  _Encoding.xorEncode = xorEncode;
  function xorDecode(input, key) {
    var _a, _b;
    const inputBytes = hexToBytes(input);
    const keyBytes = utf8Encode(key);
    const result = new Uint8Array(inputBytes.length);
    for (let i = 0; i < inputBytes.length; i++) result[i] = ((_a = inputBytes[i]) != null ? _a : 0) ^ ((_b = keyBytes[i % keyBytes.length]) != null ? _b : 0);
    return utf8Decode(result);
  }
  _Encoding.xorDecode = xorDecode;
  function charCodeEncode(input) {
    return Array.from(input).map((char) => char.charCodeAt(0));
  }
  _Encoding.charCodeEncode = charCodeEncode;
  function charCodeDecode(codes) {
    return String.fromCharCode(...codes);
  }
  _Encoding.charCodeDecode = charCodeDecode;
  function binaryEncode(input) {
    return Array.from(input).map((char) => char.charCodeAt(0).toString(2).padStart(8, "0")).join(" ");
  }
  _Encoding.binaryEncode = binaryEncode;
  function binaryDecode(input) {
    return input.split(/\s+/).map((byte) => String.fromCharCode(parseInt(byte, 2))).join("");
  }
  _Encoding.binaryDecode = binaryDecode;
  function octalEncode(input) {
    return Array.from(input).map((char) => char.charCodeAt(0).toString(8).padStart(3, "0")).join(" ");
  }
  _Encoding.octalEncode = octalEncode;
  function octalDecode(input) {
    return input.split(/\s+/).map((byte) => String.fromCharCode(parseInt(byte, 8))).join("");
  }
  _Encoding.octalDecode = octalDecode;
  function decimalEncode(input) {
    return Array.from(input).map((char) => char.charCodeAt(0).toString(10)).join(" ");
  }
  _Encoding.decimalEncode = decimalEncode;
  function decimalDecode(input) {
    return input.split(/\s+/).map((code) => String.fromCharCode(parseInt(code, 10))).join("");
  }
  _Encoding.decimalDecode = decimalDecode;
  function punycodeEncode(input) {
    const prefix = "xn--";
    if (input.startsWith(prefix)) return input;
    const asciiPart = input.replace(/[^\x00-\x7F]/g, "");
    const nonAsciiPart = input.replace(/[\x00-\x7F]/g, "");
    if (!nonAsciiPart) return input;
    return prefix + asciiPart + "-" + nonAsciiPart.split("").map((c) => c.charCodeAt(0).toString(36)).join("");
  }
  _Encoding.punycodeEncode = punycodeEncode;
  function slugify(input) {
    return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
  }
  _Encoding.slugify = slugify;
  function unslugify(input) {
    return input.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
  _Encoding.unslugify = unslugify;
  function queryStringEncode(params) {
    return Object.entries(params).filter(([, value]) => value !== void 0 && value !== null).map(([key, value]) => {
      if (Array.isArray(value)) return value.map((v) => `${urlEncode(key)}=${urlEncode(String(v))}`).join("&");
      return `${urlEncode(key)}=${urlEncode(String(value))}`;
    }).join("&");
  }
  _Encoding.queryStringEncode = queryStringEncode;
  function queryStringDecode(query) {
    const result = {};
    if (!query) return result;
    query = query.replace(/^[?#]/, "");
    for (const pair of query.split("&")) {
      const parts = pair.split("=");
      const key = parts[0];
      const value = parts[1];
      if (!key) continue;
      const decodedKey = urlDecode(key);
      const decodedValue = value ? urlDecode(value) : "";
      if (result[decodedKey]) if (Array.isArray(result[decodedKey])) result[decodedKey].push(decodedValue);
      else result[decodedKey] = [result[decodedKey], decodedValue];
      else result[decodedKey] = decodedValue;
    }
    return result;
  }
  _Encoding.queryStringDecode = queryStringDecode;
  function formDataEncode(data) {
    return Object.entries(data).filter(([, value]) => value !== void 0 && value !== null).map(([key, value]) => `${urlEncode(key)}=${urlEncode(String(value))}`).join("&");
  }
  _Encoding.formDataEncode = formDataEncode;
  function mimeTypeToExtension(mimeType) {
    return {
      "application/json": "json",
      "application/xml": "xml",
      "application/pdf": "pdf",
      "application/zip": "zip",
      "application/gzip": "gz",
      "application/x-tar": "tar",
      "application/x-rar-compressed": "rar",
      "application/x-7z-compressed": "7z",
      "application/vnd.ms-excel": "xls",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
      "application/vnd.ms-powerpoint": "ppt",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
      "application/msword": "doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "text/plain": "txt",
      "text/html": "html",
      "text/css": "css",
      "text/javascript": "js",
      "text/csv": "csv",
      "text/xml": "xml",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/svg+xml": "svg",
      "image/webp": "webp",
      "image/bmp": "bmp",
      "image/tiff": "tiff",
      "image/x-icon": "ico",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
      "audio/aac": "aac",
      "video/mp4": "mp4",
      "video/mpeg": "mpeg",
      "video/webm": "webm",
      "video/ogg": "ogv",
      "video/x-msvideo": "avi",
      "video/quicktime": "mov"
    }[mimeType.toLowerCase()] || "";
  }
  _Encoding.mimeTypeToExtension = mimeTypeToExtension;
  function extensionToMimeType(extension) {
    return {
      "json": "application/json",
      "xml": "application/xml",
      "pdf": "application/pdf",
      "zip": "application/zip",
      "gz": "application/gzip",
      "tar": "application/x-tar",
      "rar": "application/x-rar-compressed",
      "7z": "application/x-7z-compressed",
      "xls": "application/vnd.ms-excel",
      "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "ppt": "application/vnd.ms-powerpoint",
      "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "doc": "application/msword",
      "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "txt": "text/plain",
      "html": "text/html",
      "htm": "text/html",
      "css": "text/css",
      "js": "text/javascript",
      "csv": "text/csv",
      "jpg": "image/jpeg",
      "jpeg": "image/jpeg",
      "png": "image/png",
      "gif": "image/gif",
      "svg": "image/svg+xml",
      "webp": "image/webp",
      "bmp": "image/bmp",
      "tiff": "image/tiff",
      "tif": "image/tiff",
      "ico": "image/x-icon",
      "mp3": "audio/mpeg",
      "wav": "audio/wav",
      "ogg": "audio/ogg",
      "aac": "audio/aac",
      "mp4": "video/mp4",
      "mpeg": "video/mpeg",
      "mpg": "video/mpeg",
      "webm": "video/webm",
      "ogv": "video/ogg",
      "avi": "video/x-msvideo",
      "mov": "video/quicktime"
    }[extension.toLowerCase().replace(/^\./, "")] || "application/octet-stream";
  }
  _Encoding.extensionToMimeType = extensionToMimeType;
  function charsetEncode(input, _charset) {
    return new TextEncoder().encode(input);
  }
  _Encoding.charsetEncode = charsetEncode;
  function charsetDecode(input, charset) {
    return new TextDecoder(charset).decode(input);
  }
  _Encoding.charsetDecode = charsetDecode;
  function stripBom(input) {
    if (input.charCodeAt(0) === 65279) return input.slice(1);
    return input;
  }
  _Encoding.stripBom = stripBom;
  function addBom(input, bom = "utf-8") {
    return {
      "utf-8": "\uFEFF",
      "utf-16le": "\uFFFE",
      "utf-16be": "\uFEFF"
    }[bom] + input;
  }
  _Encoding.addBom = addBom;
  function normalizeEncoding(input, fromEncoding, toEncoding) {
    return charsetDecode(charsetEncode(input, fromEncoding), toEncoding);
  }
  _Encoding.normalizeEncoding = normalizeEncoding;
  function isValidBase64(input) {
    if (!input || input.length % 4 !== 0) return false;
    return /^[A-Za-z0-9+/]*={0,2}$/.test(input);
  }
  _Encoding.isValidBase64 = isValidBase64;
  function isValidHex(input) {
    return /^[0-9a-fA-F]*$/.test(input) && input.length % 2 === 0;
  }
  _Encoding.isValidHex = isValidHex;
  function isValidUrl(input) {
    try {
      new URL(input);
      return true;
    } catch {
      return false;
    }
  }
  _Encoding.isValidUrl = isValidUrl;
  function isValidEmail(input) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
  }
  _Encoding.isValidEmail = isValidEmail;
  function detectEncoding(input) {
    if (input.charCodeAt(0) === 65279) return "utf-8-bom";
    if (input.charCodeAt(0) === 65534) return "utf-16le";
    if (input.charCodeAt(0) === 65279 && input.charCodeAt(1) === 0) return "utf-16be";
    if (/[\u4e00-\u9fa5]/.test(input)) return "utf-8";
    return "ascii";
  }
  _Encoding.detectEncoding = detectEncoding;
})(Encoding || (Encoding = {}));
Encoding.base64Encode;
Encoding.base64Decode;
Encoding.base64UrlEncode;
Encoding.base64UrlDecode;
Encoding.utf8Encode;
Encoding.utf8Decode;
Encoding.hexEncode;
Encoding.hexDecode;
Encoding.urlEncode;
Encoding.urlDecode;
Encoding.htmlEncode;
Encoding.htmlDecode;
Encoding.jsonEncode;
Encoding.jsonDecode;
Encoding.xmlEncode;
Encoding.xmlDecode;
Encoding.escapeRegex;
Encoding.escapeSql;
Encoding.escapeShell;
Encoding.queryStringEncode;
Encoding.queryStringDecode;
Encoding.slugify;
Encoding.unslugify;

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/utils/date.js
var MILLISECONDS_IN_SECOND = 1e3;
var MILLISECONDS_IN_MINUTE = 60 * MILLISECONDS_IN_SECOND;
var MILLISECONDS_IN_HOUR = 60 * MILLISECONDS_IN_MINUTE;
var MILLISECONDS_IN_DAY = 24 * MILLISECONDS_IN_HOUR;
var MILLISECONDS_IN_WEEK = 7 * MILLISECONDS_IN_DAY;
var TIME_UNITS_IN_MS = {
  millisecond: 1,
  second: MILLISECONDS_IN_SECOND,
  minute: MILLISECONDS_IN_MINUTE,
  hour: MILLISECONDS_IN_HOUR,
  day: MILLISECONDS_IN_DAY,
  week: MILLISECONDS_IN_WEEK,
  month: 30 * MILLISECONDS_IN_DAY,
  quarter: 90 * MILLISECONDS_IN_DAY,
  year: 365 * MILLISECONDS_IN_DAY
};

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/http/stream-parser.js
function extractStreamLines(buffer, flush = false) {
  const lines = [];
  let lineStart = 0;
  let index = 0;
  while (index < buffer.length) {
    const character = buffer[index];
    if (character === "\n") {
      lines.push(buffer.slice(lineStart, index));
      index += 1;
      lineStart = index;
      continue;
    }
    if (character === "\r") {
      if (!flush && index === buffer.length - 1) break;
      lines.push(buffer.slice(lineStart, index));
      index += buffer[index + 1] === "\n" ? 2 : 1;
      lineStart = index;
      continue;
    }
    index += 1;
  }
  if (flush && lineStart < buffer.length) {
    lines.push(buffer.slice(lineStart));
    lineStart = buffer.length;
  }
  return {
    lines,
    remainder: buffer.slice(lineStart)
  };
}
var ServerSentEventDataParser = class {
  constructor() {
    __publicField(this, "dataLines", []);
    __publicField(this, "firstLine", true);
  }
  pushLine(rawLine) {
    const line = this.firstLine && rawLine.charCodeAt(0) === 65279 ? rawLine.slice(1) : rawLine;
    this.firstLine = false;
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return;
    const separatorIndex = line.indexOf(":");
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    let value = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.dataLines.push(value);
  }
  flush() {
    return this.dispatch();
  }
  dispatch() {
    if (this.dataLines.length === 0) return;
    const data = this.dataLines.join("\n");
    this.dataLines = [];
    return data === "" || data === "[DONE]" ? void 0 : data;
  }
};
function normalizeLegacyStreamLine(line) {
  const trimmedLine = line.trim();
  if (trimmedLine === "" || trimmedLine === "data: [DONE]") return;
  if (trimmedLine.startsWith("data: ")) return trimmedLine.slice(6);
  return trimmedLine;
}

// ../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/dist/http/base-client.js
var SDKWORK_API_PREFIXES = [
  "/app/v3/api",
  "/backend/v3/api",
  "/gateway/v3/api"
];
function dedupeSdkWorkApiPath(baseUrl, path) {
  for (const prefix of SDKWORK_API_PREFIXES) if (baseUrl.endsWith(prefix) && path.startsWith(prefix)) {
    const remainder = path.slice(prefix.length);
    return remainder.startsWith("/") ? remainder : `/${remainder}`;
  }
  return path;
}
function isApiResultEnvelope(value) {
  return value !== null && value !== void 0 && typeof value === "object" && !Array.isArray(value) && "code" in value && ("data" in value || "msg" in value || "message" in value);
}
var IDENTITY_PROJECTION_HEADER_NAMES = /* @__PURE__ */ new Set([
  "x-sdkwork-tenant-id",
  "x-sdkwork-app-id",
  "x-sdkwork-user-id",
  "x-sdkwork-organization-id",
  "x-sdkwork-actor-id",
  "x-sdkwork-actor-kind",
  "x-sdkwork-session-id",
  "x-sdkwork-environment",
  "x-sdkwork-deployment-profile",
  "x-sdkwork-deployment-mode",
  "x-sdkwork-runtime-target",
  "x-sdkwork-auth-level",
  "x-sdkwork-data-scope",
  "x-sdkwork-permission-scope",
  "x-sdkwork-device-id",
  "x-sdkwork-context-signature",
  "x-sdkwork-operation-id",
  "x-sdkwork-subject-tenant-id",
  "x-sdkwork-subject-organization-id",
  "x-sdkwork-subject-user-id",
  "x-sdkwork-subject-timestamp",
  "x-sdkwork-subject-signature",
  "x-tenant-id",
  "x-app-id",
  "x-organization-id",
  "x-platform",
  "x-user-id"
]);
function stripIdentityProjectionHeaders(headers) {
  for (const name of Object.keys(headers)) if (IDENTITY_PROJECTION_HEADER_NAMES.has(name.toLowerCase())) delete headers[name];
}
var BaseHttpClient = class {
  constructor(config) {
    __publicField(this, "config");
    __publicField(this, "authConfig");
    __publicField(this, "logger");
    __publicField(this, "cache");
    __publicField(this, "interceptors");
    var _a, _b, _c, _d;
    this.config = {
      baseUrl: config.baseUrl,
      timeout: (_a = config.timeout) != null ? _a : 3e4,
      headers: (_b = config.headers) != null ? _b : {},
      retry: {
        maxRetries: 3,
        retryDelay: 1e3,
        retryBackoff: "exponential",
        maxRetryDelay: 3e4,
        ...config.retry
      },
      cache: {
        enabled: false,
        ttl: 300 * 1e3,
        maxSize: 100,
        ...config.cache
      },
      logger: {
        level: "info",
        prefix: "[SDK]",
        timestamp: true,
        colors: true,
        ...config.logger
      }
    };
    this.logger = createLogger(this.config.logger);
    this.cache = createCacheStore(this.config.cache);
    this.interceptors = (_c = config.interceptors) != null ? _c : {
      request: [],
      response: [],
      error: []
    };
    const authMode = this.determineAuthMode(config);
    const tokenManager = (_d = config.tokenManager) != null ? _d : new DefaultAuthTokenManager({
      ...config.accessToken !== void 0 ? { accessToken: config.accessToken } : {},
      ...config.authToken !== void 0 ? { authToken: config.authToken } : {}
    });
    this.authConfig = {
      authMode,
      ...config.apiKey !== void 0 ? { apiKey: config.apiKey } : {},
      tokenManager
    };
  }
  determineAuthMode(config) {
    if (config.apiKey) return "apikey";
    return "dual-token";
  }
  getAuthMode() {
    return this.authConfig.authMode;
  }
  setAuthMode(mode) {
    this.authConfig.authMode = mode;
  }
  getTokenManager() {
    return this.authConfig.tokenManager;
  }
  setTokenManager(manager) {
    this.authConfig.tokenManager = manager;
  }
  setApiKey(apiKey) {
    var _a;
    this.authConfig.apiKey = apiKey;
    this.authConfig.authMode = "apikey";
    (_a = this.authConfig.tokenManager) == null ? void 0 : _a.clearTokens();
  }
  setAuthToken(token) {
    var _a;
    (_a = this.authConfig.tokenManager) == null ? void 0 : _a.setAuthToken(token);
    if (this.authConfig.authMode === "apikey") {
      this.authConfig.authMode = "dual-token";
      delete this.authConfig.apiKey;
    }
  }
  setAccessToken(token) {
    var _a;
    (_a = this.authConfig.tokenManager) == null ? void 0 : _a.setAccessToken(token);
    if (this.authConfig.authMode === "apikey") {
      this.authConfig.authMode = "dual-token";
      delete this.authConfig.apiKey;
    }
  }
  clearAuthToken() {
    var _a;
    (_a = this.authConfig.tokenManager) == null ? void 0 : _a.clearTokens();
  }
  addRequestInterceptor(interceptor) {
    this.interceptors.request.push(interceptor);
    return () => {
      const index = this.interceptors.request.indexOf(interceptor);
      if (index > -1) this.interceptors.request.splice(index, 1);
    };
  }
  addResponseInterceptor(interceptor) {
    this.interceptors.response.push(interceptor);
    return () => {
      const index = this.interceptors.response.indexOf(interceptor);
      if (index > -1) this.interceptors.response.splice(index, 1);
    };
  }
  addErrorInterceptor(interceptor) {
    this.interceptors.error.push(interceptor);
    return () => {
      const index = this.interceptors.error.indexOf(interceptor);
      if (index > -1) this.interceptors.error.splice(index, 1);
    };
  }
  clearCache() {
    this.cache.clear();
  }
  getConfig() {
    var _a, _b;
    return {
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      authMode: this.authConfig.authMode,
      apiKey: this.authConfig.apiKey,
      accessToken: (_a = this.authConfig.tokenManager) == null ? void 0 : _a.getAccessToken(),
      authToken: (_b = this.authConfig.tokenManager) == null ? void 0 : _b.getAuthToken()
    };
  }
  isAuthenticated() {
    var _a, _b;
    return (_b = (_a = this.authConfig.tokenManager) == null ? void 0 : _a.isValid()) != null ? _b : false;
  }
  buildBaseUrl(path, params) {
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    let url = `${baseUrl}${dedupeSdkWorkApiPath(baseUrl, path.startsWith("/") ? path : `/${path}`)}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item !== void 0 && item !== null) searchParams.append(key, String(item));
          });
          return;
        }
        if (value !== void 0 && value !== null) searchParams.append(key, String(value));
      });
      const queryString = searchParams.toString();
      if (queryString) url += `?${queryString}`;
    }
    return url;
  }
  buildHeaders(config, skipAuth = false) {
    const headers = {
      "Content-Type": MIME_TYPES.JSON,
      ...this.config.headers,
      ...config.headers
    };
    if (!skipAuth && !config.skipAuth) {
      const authHeaders = buildAuthHeaders(this.authConfig.authMode, this.authConfig.apiKey, this.authConfig.tokenManager);
      Object.assign(headers, authHeaders);
    }
    stripIdentityProjectionHeaders(headers);
    return headers;
  }
  serializeRequestBody(body, headers) {
    if (body === void 0 || body === null) return;
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      delete headers["Content-Type"];
      return body;
    }
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      return body.toString();
    }
    if (typeof Blob !== "undefined" && body instanceof Blob) {
      delete headers["Content-Type"];
      return body;
    }
    if (typeof ArrayBuffer !== "undefined") {
      if (body instanceof ArrayBuffer) {
        delete headers["Content-Type"];
        return body;
      }
      if (ArrayBuffer.isView(body)) {
        delete headers["Content-Type"];
        return body;
      }
    }
    if (typeof body === "string") {
      headers["Content-Type"] = headers["Content-Type"] || "text/plain;charset=UTF-8";
      return body;
    }
    return JSON.stringify(body);
  }
  async applyRequestInterceptors(config) {
    let processedConfig = config;
    for (const interceptor of this.interceptors.request) processedConfig = await interceptor(processedConfig);
    return processedConfig;
  }
  async applyResponseInterceptors(response, config) {
    let processedResponse = response;
    for (const interceptor of this.interceptors.response) processedResponse = await interceptor(processedResponse, config);
    return processedResponse;
  }
  async applyErrorInterceptors(error, config) {
    for (const interceptor of this.interceptors.error) await interceptor(error, config);
  }
  async handleErrorResponse(response, config) {
    var _a;
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let problem;
    try {
      const result = await response.json();
      errorMessage = String(result.detail || result.msg || result.message || result.title || errorMessage);
      if (((_a = response.headers.get("content-type")) == null ? void 0 : _a.includes("application/problem+json")) || "status" in result && "code" in result && "traceId" in result) problem = result;
    } catch {
    }
    const error = SdkError.fromHttpStatus(response.status, errorMessage, problem === void 0 ? void 0 : { problem });
    await this.applyErrorInterceptors(error, config);
    throw error;
  }
  async processResponse(response, config) {
    if (!response.ok) await this.handleErrorResponse(response, config);
    if (response.status === HTTP_STATUS.NO_CONTENT) return;
    const contentType = response.headers.get("content-type");
    if (contentType == null ? void 0 : contentType.includes(MIME_TYPES.JSON)) {
      const body = await response.text();
      if (!body.trim()) return;
      const result = JSON.parse(body);
      if (!isApiResultEnvelope(result)) return result;
      if (!SUCCESS_CODES.includes(result.code) && !SUCCESS_CODES.includes(String(result.code))) throw SdkError.fromApiResult(result, response.status);
      return result.data;
    }
    if (contentType == null ? void 0 : contentType.includes("text/")) return await response.text();
    return await response.json();
  }
  async executeFetch(url, options) {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeout);
    const abortHandler = () => controller.abort();
    if (options.signal) if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", abortHandler, { once: true });
    try {
      this.logger.debug(`${options.method} ${url}`);
      return await fetch(url, {
        method: options.method,
        headers: options.headers,
        ...options.body !== void 0 ? { body: options.body } : {},
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          if (timedOut) throw new TimeoutError(`Request timeout after ${options.timeout}ms`, options.timeout);
          throw new CancelledError("Request was cancelled");
        }
        throw new NetworkError(error.message);
      }
      throw new NetworkError("Unknown network error");
    } finally {
      clearTimeout(timeoutId);
      if (options.signal) options.signal.removeEventListener("abort", abortHandler);
    }
  }
  async execute(config) {
    var _a;
    const processedConfig = await this.applyRequestInterceptors(config);
    const url = this.buildBaseUrl(processedConfig.url, processedConfig.params);
    const headers = this.buildHeaders(processedConfig);
    const serializedBody = this.serializeRequestBody(processedConfig.body, headers);
    const response = await this.executeFetch(url, {
      method: processedConfig.method,
      headers,
      ...serializedBody !== void 0 ? { body: serializedBody } : {},
      timeout: (_a = processedConfig.timeout) != null ? _a : this.config.timeout,
      ...processedConfig.signal !== void 0 ? { signal: processedConfig.signal } : {}
    });
    return this.processResponse(response, processedConfig);
  }
  async upload(path, options) {
    var _a, _b;
    const formData = new FormData();
    formData.append((_a = options.fieldName) != null ? _a : "file", options.file);
    if (options.additionalData) Object.entries(options.additionalData).forEach(([key, value]) => {
      formData.append(key, value);
    });
    const config = {
      url: path,
      method: "POST",
      body: formData,
      skipAuth: false
    };
    const processedConfig = await this.applyRequestInterceptors(config);
    const url = this.buildBaseUrl(processedConfig.url, processedConfig.params);
    const headers = this.buildHeaders(processedConfig);
    delete headers["Content-Type"];
    const response = await this.executeFetch(url, {
      method: "POST",
      headers,
      body: formData,
      timeout: (_b = processedConfig.timeout) != null ? _b : this.config.timeout,
      ...processedConfig.signal !== void 0 ? { signal: processedConfig.signal } : {}
    });
    return this.processResponse(response, processedConfig);
  }
  async download(path, _options) {
    var _a;
    const config = {
      url: path,
      method: "GET",
      skipAuth: false
    };
    const processedConfig = await this.applyRequestInterceptors(config);
    const url = this.buildBaseUrl(processedConfig.url, processedConfig.params);
    const headers = this.buildHeaders(processedConfig);
    const response = await this.executeFetch(url, {
      method: "GET",
      headers,
      timeout: (_a = processedConfig.timeout) != null ? _a : this.config.timeout,
      ...processedConfig.signal !== void 0 ? { signal: processedConfig.signal } : {}
    });
    if (!response.ok) await this.handleErrorResponse(response, processedConfig);
    return response.blob();
  }
  async *stream(path, options) {
    var _a, _b, _c, _d;
    const config = {
      url: path,
      method: (_a = options == null ? void 0 : options.method) != null ? _a : "POST",
      ...(options == null ? void 0 : options.body) !== void 0 ? { body: options.body } : {},
      ...(options == null ? void 0 : options.headers) !== void 0 ? { headers: options.headers } : {},
      ...(options == null ? void 0 : options.params) !== void 0 ? { params: options.params } : {},
      ...(options == null ? void 0 : options.timeout) !== void 0 ? { timeout: options.timeout } : {},
      ...(options == null ? void 0 : options.signal) !== void 0 ? { signal: options.signal } : {},
      ...(options == null ? void 0 : options.skipAuth) !== void 0 ? { skipAuth: options.skipAuth } : {},
      ...(options == null ? void 0 : options.metadata) !== void 0 ? { metadata: options.metadata } : {}
    };
    const processedConfig = await this.applyRequestInterceptors(config);
    const url = this.buildBaseUrl(processedConfig.url, processedConfig.params);
    const headers = this.buildHeaders(processedConfig);
    const serializedBody = this.serializeRequestBody(processedConfig.body, headers);
    const response = await this.executeFetch(url, {
      method: processedConfig.method,
      headers,
      ...serializedBody !== void 0 ? { body: serializedBody } : {},
      timeout: (_b = processedConfig.timeout) != null ? _b : this.config.timeout,
      ...processedConfig.signal !== void 0 ? { signal: processedConfig.signal } : {}
    });
    if (!response.ok) await this.handleErrorResponse(response, processedConfig);
    const reader = (_c = response.body) == null ? void 0 : _c.getReader();
    if (!reader) throw new NetworkError("No response body");
    const decoder = new TextDecoder();
    let buffer = "";
    const eventParser = ((_d = response.headers.get("content-type")) == null ? void 0 : _d.toLowerCase().includes("text/event-stream")) === true ? new ServerSentEventDataParser() : void 0;
    const parseLine = eventParser ? (line) => eventParser.pushLine(line) : normalizeLegacyStreamLine;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const extracted2 = extractStreamLines(buffer);
        buffer = extracted2.remainder;
        for (const line of extracted2.lines) {
          const data = parseLine(line);
          if (data !== void 0) yield data;
        }
      }
      buffer += decoder.decode();
      const extracted = extractStreamLines(buffer, true);
      for (const line of extracted.lines) {
        const data = parseLine(line);
        if (data !== void 0) yield data;
      }
      const finalData = eventParser == null ? void 0 : eventParser.flush();
      if (finalData !== void 0) yield finalData;
    } finally {
      reader.releaseLock();
    }
  }
};

// packages/sdkwork-mail-mp-core/src/config/resolveAppSdkBaseUrl.ts
var APP_API_PREFIX = "/app/v3/api";
var API_BASE_URL_ENV_KEY = "SDKWORK_API_BASE_URL";
function stripAppApiSuffix(pathname) {
  const normalized = pathname.replace(/\/+$/u, "");
  if (!normalized || normalized === APP_API_PREFIX) {
    return "";
  }
  if (normalized.endsWith(APP_API_PREFIX)) {
    return normalized.slice(0, -APP_API_PREFIX.length) || "";
  }
  return normalized;
}
function normalizeApiBaseUrl(apiBaseUrl) {
  try {
    const parsed = new URL(apiBaseUrl);
    const normalizedPath = stripAppApiSuffix(parsed.pathname);
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return apiBaseUrl.replace(/\/app\/v3\/api\/?$/u, "");
  }
}
function resolveAppSdkBaseUrl(apiBaseUrl) {
  const [configured = ""] = splitBaseUrls(
    apiBaseUrl != null ? apiBaseUrl : resolveBaseUrl({ envKey: API_BASE_URL_ENV_KEY }).url
  );
  return normalizeApiBaseUrl(configured);
}

// ../../../sdkwork-utils/packages/sdkwork-utils-typescript/src/runtime/binary.js
var textEncoder = new TextEncoder();
function toUtf8(value) {
  return textEncoder.encode(value);
}
var HEX = "0123456789abcdef";
function hexEncode(bytes) {
  let result = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === void 0) {
      continue;
    }
    result += HEX[byte >> 4];
    result += HEX[byte & 15];
  }
  return result;
}

// ../../../sdkwork-utils/packages/sdkwork-utils-typescript/src/runtime/sha256.js
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var BLOCK_SIZE = 64;
function rotr(value, shift) {
  return value >>> shift | value << 32 - shift;
}
function readBlockU32(block, byteOffset) {
  return block[byteOffset] << 24 | block[byteOffset + 1] << 16 | block[byteOffset + 2] << 8 | block[byteOffset + 3];
}
function sha256Block(state, block, offset) {
  const words = new Uint32Array(64);
  for (let index = 0; index < 16; index += 1) {
    words[index] = readBlockU32(block, offset + index * 4);
  }
  for (let index = 16; index < 64; index += 1) {
    const wordMinus15 = words[index - 15];
    const wordMinus2 = words[index - 2];
    const wordMinus16 = words[index - 16];
    const wordMinus7 = words[index - 7];
    const s0 = rotr(wordMinus15, 7) ^ rotr(wordMinus15, 18) ^ wordMinus15 >>> 3;
    const s1 = rotr(wordMinus2, 17) ^ rotr(wordMinus2, 19) ^ wordMinus2 >>> 10;
    words[index] = wordMinus16 + s0 + wordMinus7 + s1 >>> 0;
  }
  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  let f = state[5];
  let g = state[6];
  let h = state[7];
  for (let index = 0; index < 64; index += 1) {
    const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = e & f ^ ~e & g;
    const temp1 = h + s1 + ch + K[index] + words[index] >>> 0;
    const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = a & b ^ a & c ^ b & c;
    const temp2 = s0 + maj >>> 0;
    h = g;
    g = f;
    f = e;
    e = d + temp1 >>> 0;
    d = c;
    c = b;
    b = a;
    a = temp1 + temp2 >>> 0;
  }
  state[0] = state[0] + a >>> 0;
  state[1] = state[1] + b >>> 0;
  state[2] = state[2] + c >>> 0;
  state[3] = state[3] + d >>> 0;
  state[4] = state[4] + e >>> 0;
  state[5] = state[5] + f >>> 0;
  state[6] = state[6] + g >>> 0;
  state[7] = state[7] + h >>> 0;
}
function sha256Digest(value) {
  const bitLength = value.length * 8;
  const paddingLength = (BLOCK_SIZE - (value.length + 9) % BLOCK_SIZE) % BLOCK_SIZE + 9;
  const padded = new Uint8Array(value.length + paddingLength);
  padded.set(value);
  padded[value.length] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 4294967296), false);
  const state = new Uint32Array([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);
  for (let offset = 0; offset < padded.length; offset += BLOCK_SIZE) {
    sha256Block(state, padded, offset);
  }
  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let index = 0; index < state.length; index += 1) {
    digestView.setUint32(index * 4, state[index], false);
  }
  return digest;
}
var SHA256_INITIAL_STATE = new Uint32Array([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
function sha256Hex(value) {
  const bytes = typeof value === "string" ? toUtf8(value) : value;
  return hexEncode(sha256Digest(bytes));
}

// ../../../sdkwork-utils/packages/sdkwork-utils-typescript/src/crypto.js
function sha256Hash(value) {
  return sha256Hex(value);
}

// ../../../sdkwork-utils/packages/sdkwork-utils-typescript/src/money.js
var LOCALE_RULES = {
  "en-us": {
    prefix: true,
    decimal: ".",
    grouping: ",",
    nameSpace: true,
    compact: [
      { exponent: 12, unit: "T" },
      { exponent: 9, unit: "B" },
      { exponent: 6, unit: "M" },
      { exponent: 3, unit: "K" }
    ]
  },
  "zh-cn": {
    prefix: true,
    decimal: ".",
    grouping: ",",
    nameSpace: false,
    compact: [
      { exponent: 12, unit: "\u5146" },
      { exponent: 8, unit: "\u4EBF" },
      { exponent: 4, unit: "\u4E07" }
    ]
  },
  "ja-jp": {
    prefix: true,
    decimal: ".",
    grouping: ",",
    nameSpace: false,
    compact: [
      { exponent: 12, unit: "\u5146" },
      { exponent: 8, unit: "\u5104" },
      { exponent: 4, unit: "\u4E07" }
    ]
  },
  "ko-kr": {
    prefix: true,
    decimal: ".",
    grouping: ",",
    nameSpace: false,
    compact: [
      { exponent: 12, unit: "\uC870" },
      { exponent: 8, unit: "\uC5B5" },
      { exponent: 4, unit: "\uB9CC" }
    ]
  },
  "de-de": {
    prefix: false,
    decimal: ",",
    grouping: ".",
    nameSpace: true,
    compact: [
      { exponent: 12, unit: "Bio." },
      { exponent: 9, unit: "Mrd." },
      { exponent: 6, unit: "Mio." },
      { exponent: 3, unit: "Tsd." }
    ]
  },
  "fr-fr": {
    prefix: false,
    decimal: ",",
    grouping: " ",
    nameSpace: true,
    compact: [
      { exponent: 12, unit: "B" },
      { exponent: 9, unit: "Md" },
      { exponent: 6, unit: "M" },
      { exponent: 3, unit: "k" }
    ]
  },
  "it-it": {
    prefix: false,
    decimal: ",",
    grouping: ".",
    nameSpace: true,
    compact: [
      { exponent: 12, unit: "Bio." },
      { exponent: 9, unit: "Mrd." },
      { exponent: 6, unit: "M" },
      { exponent: 3, unit: "k" }
    ]
  },
  "es-es": {
    prefix: false,
    decimal: ",",
    grouping: ".",
    nameSpace: true,
    compact: [
      { exponent: 12, unit: "T" },
      { exponent: 9, unit: "B" },
      { exponent: 6, unit: "M" },
      { exponent: 3, unit: "k" }
    ]
  },
  "ru-ru": {
    prefix: false,
    decimal: ",",
    grouping: " ",
    nameSpace: true,
    compact: [
      { exponent: 12, unit: "\u0442\u0440\u043B\u043D" },
      { exponent: 9, unit: "\u043C\u043B\u0440\u0434" },
      { exponent: 6, unit: "\u043C\u043B\u043D" },
      { exponent: 3, unit: "\u0442\u044B\u0441." }
    ]
  }
};
var CURRENCY_NAMES = {
  "en-us": {
    USD: "US dollars",
    EUR: "euros",
    GBP: "British pounds",
    CNY: "Chinese yuan",
    JPY: "Japanese yen",
    KRW: "South Korean won",
    HKD: "Hong Kong dollars",
    TWD: "New Taiwan dollars",
    CHF: "Swiss francs",
    CAD: "Canadian dollars",
    AUD: "Australian dollars",
    INR: "Indian rupees",
    BHD: "Bahraini dinars",
    KWD: "Kuwaiti dinars"
  },
  "zh-cn": {
    USD: "\u7F8E\u5143",
    EUR: "\u6B27\u5143",
    GBP: "\u82F1\u9563",
    CNY: "\u4EBA\u6C11\u5E01",
    JPY: "\u65E5\u5143",
    KRW: "\u97E9\u5143",
    HKD: "\u6E2F\u5E01",
    TWD: "\u65B0\u53F0\u5E01",
    CHF: "\u745E\u58EB\u6CD5\u90CE",
    CAD: "\u52A0\u62FF\u5927\u5143",
    AUD: "\u6FB3\u5927\u5229\u4E9A\u5143",
    INR: "\u5370\u5EA6\u5362\u6BD4",
    BHD: "\u5DF4\u6797\u7B2C\u7EB3\u5C14",
    KWD: "\u79D1\u5A01\u7279\u7B2C\u7EB3\u5C14"
  },
  "de-de": {
    USD: "US-Dollar",
    EUR: "Euro",
    GBP: "Britisches Pfund",
    CNY: "Chinesischer Yuan",
    JPY: "Japanischer Yen",
    KRW: "S\xFCdkoreanischer Won",
    HKD: "Hongkong-Dollar",
    TWD: "Neuer Taiwan-Dollar",
    CHF: "Schweizer Franken",
    CAD: "Kanadischer Dollar",
    AUD: "Australischer Dollar",
    INR: "Indische Rupie",
    BHD: "Bahrainischer Dinar",
    KWD: "Kuwaitischer Dinar"
  },
  "fr-fr": {
    USD: "dollar am\xE9ricain",
    EUR: "euro",
    GBP: "livre sterling",
    CNY: "yuan chinois",
    JPY: "yen japonais",
    KRW: "won sud-cor\xE9en",
    HKD: "dollar de Hong Kong",
    TWD: "nouveau dollar de Ta\xEFwan",
    CHF: "franc suisse",
    CAD: "dollar canadien",
    AUD: "dollar australien",
    INR: "roupie indienne",
    BHD: "dinar bahre\xEFni",
    KWD: "dinar kowe\xEFtien"
  },
  "it-it": {
    USD: "dollaro statunitense",
    EUR: "euro",
    GBP: "sterlina britannica",
    CNY: "yuan cinese",
    JPY: "yen giapponese",
    KRW: "won sudcoreano",
    HKD: "dollaro di Hong Kong",
    TWD: "nuovo dollaro taiwanese",
    CHF: "franco svizzero",
    CAD: "dollaro canadese",
    AUD: "dollaro australiano",
    INR: "rupia indiana",
    BHD: "dinaro bahreinita",
    KWD: "dinaro kuwaitiano"
  },
  "es-es": {
    USD: "d\xF3lar estadounidense",
    EUR: "euro",
    GBP: "libra esterlina",
    CNY: "yuan chino",
    JPY: "yen japon\xE9s",
    KRW: "won surcoreano",
    HKD: "d\xF3lar de Hong Kong",
    TWD: "nuevo d\xF3lar taiwan\xE9s",
    CHF: "franco suizo",
    CAD: "d\xF3lar canadiense",
    AUD: "d\xF3lar australiano",
    INR: "rupia india",
    BHD: "dinar bahrein\xED",
    KWD: "dinar kuwait\xED"
  },
  "ja-jp": {
    USD: "\u7C73\u30C9\u30EB",
    EUR: "\u30E6\u30FC\u30ED",
    GBP: "\u82F1\u30DD\u30F3\u30C9",
    CNY: "\u4E2D\u56FD\u4EBA\u6C11\u5143",
    JPY: "\u65E5\u672C\u5186",
    KRW: "\u97D3\u56FD\u30A6\u30A9\u30F3",
    HKD: "\u9999\u6E2F\u30C9\u30EB",
    TWD: "\u53F0\u6E7E\u30C9\u30EB",
    CHF: "\u30B9\u30A4\u30B9\u30D5\u30E9\u30F3",
    CAD: "\u30AB\u30CA\u30C0\u30C9\u30EB",
    AUD: "\u30AA\u30FC\u30B9\u30C8\u30E9\u30EA\u30A2\u30C9\u30EB",
    INR: "\u30A4\u30F3\u30C9\u30EB\u30D4\u30FC",
    BHD: "\u30D0\u30FC\u30EC\u30FC\u30F3\u30C7\u30A3\u30FC\u30CA\u30FC\u30EB",
    KWD: "\u30AF\u30A6\u30A7\u30FC\u30C8\u30C7\u30A3\u30CA\u30FC\u30EB"
  },
  "ko-kr": {
    USD: "\uBBF8\uAD6D \uB2EC\uB7EC",
    EUR: "\uC720\uB85C",
    GBP: "\uC601\uAD6D \uD30C\uC6B4\uB4DC",
    CNY: "\uC911\uAD6D \uC704\uC548",
    JPY: "\uC77C\uBCF8 \uC5D4",
    KRW: "\uB300\uD55C\uBBFC\uAD6D \uC6D0",
    HKD: "\uD64D\uCF69 \uB2EC\uB7EC",
    TWD: "\uC2E0 \uB300\uB9CC \uB2EC\uB7EC",
    CHF: "\uC2A4\uC704\uC2A4 \uD504\uB791",
    CAD: "\uCE90\uB098\uB2E4 \uB2EC\uB7EC",
    AUD: "\uD638\uC8FC \uB2EC\uB7EC",
    INR: "\uC778\uB3C4 \uB8E8\uD53C",
    BHD: "\uBC14\uB808\uC778 \uB514\uB098\uB974",
    KWD: "\uCFE0\uC6E8\uC774\uD2B8 \uB514\uB098\uB974"
  },
  "ru-ru": {
    USD: "\u0434\u043E\u043B\u043B\u0430\u0440 \u0421\u0428\u0410",
    EUR: "\u0435\u0432\u0440\u043E",
    GBP: "\u0431\u0440\u0438\u0442\u0430\u043D\u0441\u043A\u0438\u0439 \u0444\u0443\u043D\u0442",
    CNY: "\u043A\u0438\u0442\u0430\u0439\u0441\u043A\u0438\u0439 \u044E\u0430\u043D\u044C",
    JPY: "\u044F\u043F\u043E\u043D\u0441\u043A\u0430\u044F \u0438\u0435\u043D\u0430",
    KRW: "\u044E\u0436\u043D\u043E\u043A\u043E\u0440\u0435\u0439\u0441\u043A\u0430\u044F \u0432\u043E\u043D\u0430",
    HKD: "\u0433\u043E\u043D\u043A\u043E\u043D\u0433\u0441\u043A\u0438\u0439 \u0434\u043E\u043B\u043B\u0430\u0440",
    TWD: "\u043D\u043E\u0432\u044B\u0439 \u0442\u0430\u0439\u0432\u0430\u043D\u044C\u0441\u043A\u0438\u0439 \u0434\u043E\u043B\u043B\u0430\u0440",
    CHF: "\u0448\u0432\u0435\u0439\u0446\u0430\u0440\u0441\u043A\u0438\u0439 \u0444\u0440\u0430\u043D\u043A",
    CAD: "\u043A\u0430\u043D\u0430\u0434\u0441\u043A\u0438\u0439 \u0434\u043E\u043B\u043B\u0430\u0440",
    AUD: "\u0430\u0432\u0441\u0442\u0440\u0430\u043B\u0438\u0439\u0441\u043A\u0438\u0439 \u0434\u043E\u043B\u043B\u0430\u0440",
    INR: "\u0438\u043D\u0434\u0438\u0439\u0441\u043A\u0430\u044F \u0440\u0443\u043F\u0438\u044F",
    BHD: "\u0431\u0430\u0445\u0440\u0435\u0439\u043D\u0441\u043A\u0438\u0439 \u0434\u0438\u043D\u0430\u0440",
    KWD: "\u043A\u0443\u0432\u0435\u0439\u0442\u0441\u043A\u0438\u0439 \u0434\u0438\u043D\u0430\u0440"
  }
};
var DEFAULT_LOCALE_RULES = LOCALE_RULES["en-us"];
var DEFAULT_CURRENCY_NAMES = CURRENCY_NAMES["en-us"];

// ../../sdks/sdkwork-mail-app-sdk/sdkwork-mail-app-sdk-typescript/generated/server-openapi/src/http/client.ts
var _HttpClient = class _HttpClient extends BaseHttpClient {
  constructor(config) {
    super(config);
  }
  static normalizeCredential(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
  }
  getInternalAuthConfig() {
    const self = this;
    self.authConfig = self.authConfig || {};
    return self.authConfig;
  }
  getInternalHeaders() {
    const self = this;
    self.config = self.config || {};
    self.config.headers = self.config.headers || {};
    return self.config.headers;
  }
  buildRequestHeaders(headers, contentType) {
    const mergedHeaders = {
      ...headers != null ? headers : {}
    };
    if (contentType && contentType.toLowerCase() !== "multipart/form-data") {
      mergedHeaders["Content-Type"] = contentType;
    }
    return Object.keys(mergedHeaders).length > 0 ? mergedHeaders : void 0;
  }
  async applySdkworkRequestBodyFingerprint(headers, body) {
    if (!_HttpClient.SDKWORK_V3_REQUEST_FINGERPRINTS || body == null || !this.hasNonEmptyHeader(headers, "Idempotency-Key") || this.hasNonEmptyHeader(headers, "X-Content-SHA256") || this.hasNonEmptyHeader(headers, "X-Idempotency-Fingerprint")) {
      return headers;
    }
    const fingerprint = await this.createSdkworkRequestBodyFingerprint(body);
    if (!fingerprint) {
      return headers;
    }
    const normalizedFingerprintHeader = fingerprint.header.toLowerCase();
    const preparedHeaders = Object.fromEntries(
      Object.entries(headers != null ? headers : {}).filter(
        ([headerName]) => headerName.toLowerCase() !== normalizedFingerprintHeader
      )
    );
    return {
      ...preparedHeaders,
      [fingerprint.header]: fingerprint.value
    };
  }
  hasNonEmptyHeader(headers, name) {
    const normalizedName = name.toLowerCase();
    return Object.entries(headers != null ? headers : {}).some(
      ([headerName, value]) => headerName.toLowerCase() === normalizedName && value.trim().length > 0
    );
  }
  async createSdkworkRequestBodyFingerprint(body) {
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      const canonicalForm = await this.serializeSdkworkFormData(body);
      return {
        header: "X-Idempotency-Fingerprint",
        value: await this.sha256Hex(new TextEncoder().encode(canonicalForm))
      };
    }
    const bytes = await this.serializeSdkworkRequestBodyBytes(body);
    if (!bytes) {
      return void 0;
    }
    return {
      header: "X-Content-SHA256",
      value: await this.sha256Hex(bytes)
    };
  }
  async serializeSdkworkRequestBodyBytes(body) {
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return new TextEncoder().encode(body.toString());
    }
    if (typeof Blob !== "undefined" && body instanceof Blob) {
      return new Uint8Array(await body.arrayBuffer());
    }
    if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
      return new Uint8Array(body.slice(0));
    }
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(body)) {
      return new Uint8Array(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
    }
    if (typeof body === "string") {
      return new TextEncoder().encode(body);
    }
    const serialized = JSON.stringify(body);
    return serialized === void 0 ? void 0 : new TextEncoder().encode(serialized);
  }
  async serializeSdkworkFormData(body) {
    const parts = [];
    for (const [name, value] of body.entries()) {
      if (typeof value === "string") {
        parts.push({ kind: "field", name, value });
        continue;
      }
      const bytes = new Uint8Array(await value.arrayBuffer());
      parts.push({
        kind: "file",
        name,
        fileName: "name" in value ? String(value.name) : "",
        contentType: value.type,
        size: value.size,
        contentSha256: await this.sha256Hex(bytes)
      });
    }
    return JSON.stringify(parts);
  }
  async sha256Hex(bytes) {
    return sha256Hash(bytes);
  }
  buildHeaders(config, skipAuth = false) {
    const headers = super.buildHeaders(config, skipAuth);
    if (config == null ? void 0 : config.accessTokenOnly) {
      this.stripCredentialHeaders(headers, true);
      return headers;
    }
    if (!skipAuth && !(config == null ? void 0 : config.skipAuth)) {
      return headers;
    }
    this.stripCredentialHeaders(headers, false);
    return headers;
  }
  stripCredentialHeaders(headers, preserveAccessToken) {
    [
      ...preserveAccessToken ? [] : [_HttpClient.ACCESS_TOKEN_HEADER, "Access-Token"],
      "Authorization",
      ["X", "API", "Key"].join("-"),
      "X-Tenant-Id",
      "X-App-Id",
      "X-Organization-Id",
      "X-Platform",
      "X-User-Id",
      "X-Sdkwork-Tenant-Id",
      "X-Sdkwork-App-Id",
      "X-Sdkwork-User-Id",
      "X-Sdkwork-Organization-Id",
      "X-Sdkwork-Actor-Id",
      "X-Sdkwork-Actor-Kind",
      "X-Sdkwork-Session-Id",
      "X-Sdkwork-Environment",
      "X-Sdkwork-Deployment-Profile",
      "X-Sdkwork-Deployment-Mode",
      "X-Sdkwork-Runtime-Target",
      "X-Sdkwork-Auth-Level",
      "X-Sdkwork-Data-Scope",
      "X-Sdkwork-Permission-Scope",
      "X-Sdkwork-Device-Id",
      "X-Sdkwork-Context-Signature",
      "X-Sdkwork-Operation-Id",
      "X-Sdkwork-Subject-Tenant-Id",
      "X-Sdkwork-Subject-Organization-Id",
      "X-Sdkwork-Subject-User-Id",
      "X-Sdkwork-Subject-Timestamp",
      "X-Sdkwork-Subject-Signature"
    ].forEach((key) => {
      delete headers[key];
    });
  }
  buildRequestBody(body, contentType) {
    if (body == null) {
      return body;
    }
    const normalizedContentType = (contentType != null ? contentType : "").toLowerCase();
    if (normalizedContentType === "application/x-www-form-urlencoded") {
      return this.encodeFormBody(body);
    }
    if (normalizedContentType === "multipart/form-data") {
      return this.encodeMultipartBody(body);
    }
    return body;
  }
  encodeMultipartBody(body) {
    if (body instanceof FormData) {
      return body;
    }
    const formData = new FormData();
    if (body instanceof Map) {
      for (const [key, value] of body.entries()) {
        this.appendMultipartValue(formData, String(key), value);
      }
      return formData;
    }
    if (typeof body === "object") {
      const record = body;
      for (const [key, value] of Object.entries(record)) {
        if (this.isMultipartMetadataField(key)) {
          continue;
        }
        this.appendMultipartValue(formData, key, value, this.resolveMultipartFileName(record, key));
      }
      return formData;
    }
    this.appendMultipartValue(formData, "value", body);
    return formData;
  }
  appendMultipartValue(formData, key, value, fileName) {
    if (value == null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.appendMultipartValue(formData, key, item, fileName));
      return;
    }
    if (value instanceof Blob) {
      if (fileName) {
        formData.append(key, value, fileName);
        return;
      }
      formData.append(key, value);
      return;
    }
    if (value instanceof Date) {
      formData.append(key, value.toISOString());
      return;
    }
    if (typeof value === "object") {
      formData.append(key, JSON.stringify(value));
      return;
    }
    formData.append(key, String(value));
  }
  resolveMultipartFileName(record, key) {
    const fieldSpecificName = record[`${key}FileName`];
    if (typeof fieldSpecificName === "string" && fieldSpecificName.trim()) {
      return fieldSpecificName.trim();
    }
    const genericName = record.fileName;
    if (key === "file" && typeof genericName === "string" && genericName.trim()) {
      return genericName.trim();
    }
    return void 0;
  }
  isMultipartMetadataField(key) {
    return key === "fileName" || key.endsWith("FileName");
  }
  encodeFormBody(body) {
    if (body instanceof URLSearchParams) {
      return body.toString();
    }
    if (typeof body === "string") {
      return body;
    }
    const params = new URLSearchParams();
    if (body instanceof Map) {
      for (const [key, value] of body.entries()) {
        this.appendFormValue(params, String(key), value);
      }
      return params.toString();
    }
    if (typeof body === "object") {
      for (const [key, value] of Object.entries(body)) {
        this.appendFormValue(params, key, value);
      }
      return params.toString();
    }
    params.append("value", String(body));
    return params.toString();
  }
  appendFormValue(params, key, value) {
    if (value == null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.appendFormValue(params, key, item));
      return;
    }
    if (value instanceof Date) {
      params.append(key, value.toISOString());
      return;
    }
    if (typeof value === "object") {
      params.append(key, JSON.stringify(value));
      return;
    }
    params.append(key, String(value));
  }
  setAuthToken(token) {
    super.setAuthToken(token);
  }
  setAccessToken(token) {
    const headers = this.getInternalHeaders();
    headers[_HttpClient.ACCESS_TOKEN_HEADER] = token;
    super.setAccessToken(token);
  }
  setTokenManager(manager) {
    const baseProto = Object.getPrototypeOf(_HttpClient.prototype);
    if (typeof baseProto.setTokenManager === "function") {
      baseProto.setTokenManager.call(this, manager);
      return;
    }
    this.getInternalAuthConfig().tokenManager = manager;
  }
  applyAccessTokenOnlyHeaders(headers) {
    var _a;
    const authConfig = this.getInternalAuthConfig();
    const tokenManager = authConfig.tokenManager;
    const accessToken = (_a = tokenManager == null ? void 0 : tokenManager.getAccessToken) == null ? void 0 : _a.call(tokenManager);
    if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
      throw new Error(
        "access-token-only request requires Access-Token before request dispatch"
      );
    }
    const result = { ...headers != null ? headers : {} };
    this.stripCredentialHeaders(result, false);
    result[_HttpClient.ACCESS_TOKEN_HEADER] = accessToken.trim();
    return result;
  }
  applySdkworkAuthHeaders(headers) {
    var _a, _b;
    const authConfig = this.getInternalAuthConfig();
    const tokenManager = authConfig.tokenManager;
    const accessToken = _HttpClient.normalizeCredential((_a = tokenManager == null ? void 0 : tokenManager.getAccessToken) == null ? void 0 : _a.call(tokenManager));
    const authToken = _HttpClient.normalizeCredential((_b = tokenManager == null ? void 0 : tokenManager.getAuthToken) == null ? void 0 : _b.call(tokenManager));
    if (_HttpClient.REQUIRES_SDKWORK_ACCESS_TOKEN && (typeof accessToken !== "string" || accessToken.trim().length === 0)) {
      throw new Error("non-open-api request requires Access-Token before request dispatch");
    }
    if (!accessToken && !authToken) {
      return headers;
    }
    const authHeaders = buildAuthHeaders("dual-token", void 0, tokenManager);
    return Object.keys(authHeaders).length > 0 ? { ...headers != null ? headers : {}, ...authHeaders } : headers;
  }
  unwrapSdkworkV3Payload(payload, unwrapKind = "data") {
    if (!_HttpClient.SDKWORK_V3_UNWRAP || payload == null || typeof payload !== "object") {
      return payload;
    }
    const record = payload;
    if (record.code !== 0 || !("data" in record)) {
      return this.unwrapSdkworkV3Data(record, unwrapKind);
    }
    const data = record.data;
    if (!data || typeof data !== "object") {
      return data;
    }
    return this.unwrapSdkworkV3Data(data, unwrapKind);
  }
  unwrapSdkworkV3Data(data, unwrapKind) {
    if (unwrapKind === "void") {
      return void 0;
    }
    if (unwrapKind === "item" && "item" in data) {
      return data.item;
    }
    return data;
  }
  async request(path, options = {}) {
    const execute = this.execute;
    if (typeof execute !== "function") {
      throw new Error("BaseHttpClient execute method is not available");
    }
    const {
      body,
      headers,
      contentType,
      method = "GET",
      skipAuth,
      accessTokenOnly,
      sdkworkUnwrapKind = "data",
      ...rest
    } = options;
    const requestHeaders = accessTokenOnly ? this.applyAccessTokenOnlyHeaders(headers) : skipAuth ? headers : this.applySdkworkAuthHeaders(headers);
    const requestBody = this.buildRequestBody(body, contentType);
    const preparedHeaders = await this.applySdkworkRequestBodyFingerprint(
      this.buildRequestHeaders(requestHeaders, body == null ? void 0 : contentType),
      requestBody
    );
    const payload = await withRetry(
      () => execute.call(this, {
        url: path,
        method,
        ...rest,
        ...skipAuth !== void 0 ? { skipAuth } : {},
        ...accessTokenOnly !== void 0 ? { accessTokenOnly } : {},
        ...requestBody !== void 0 ? { body: requestBody } : {},
        ...preparedHeaders !== void 0 ? { headers: preparedHeaders } : {}
      }),
      // Per-request retry overrides (e.g. disabling 5xx retries for
      // idempotent-terminal operations like turn execution) flow through
      // options.retry; the default keeps maxRetries: 3.
      { maxRetries: 3, ...options.retry }
    );
    return this.unwrapSdkworkV3Payload(payload, sdkworkUnwrapKind);
  }
  async *streamJson(path, options = {}) {
    const stream = BaseHttpClient.prototype.stream;
    if (typeof stream !== "function") {
      throw new Error("BaseHttpClient stream method is not available");
    }
    const {
      body,
      headers,
      contentType,
      method = "GET",
      skipAuth,
      accessTokenOnly,
      ...rest
    } = options;
    const authHeaders = accessTokenOnly ? this.applyAccessTokenOnlyHeaders(headers) : skipAuth ? headers : this.applySdkworkAuthHeaders(headers);
    const requestBody = this.buildRequestBody(body, contentType);
    const requestHeaders = await this.applySdkworkRequestBodyFingerprint(
      this.buildRequestHeaders(
        { Accept: "text/event-stream", ...authHeaders != null ? authHeaders : {} },
        body == null ? void 0 : contentType
      ),
      requestBody
    );
    for await (const data of stream.call(this, path, {
      method,
      ...rest,
      ...skipAuth !== void 0 ? { skipAuth } : {},
      ...accessTokenOnly !== void 0 ? { accessTokenOnly } : {},
      ...requestBody !== void 0 ? { body: requestBody } : {},
      ...requestHeaders !== void 0 ? { headers: requestHeaders } : {}
    })) {
      if (data === "[DONE]") {
        return;
      }
      if (typeof data !== "string" || data.trim().length === 0) {
        continue;
      }
      yield JSON.parse(data);
    }
  }
  async get(path, params, headers) {
    return this.request(path, {
      method: "GET",
      ...params !== void 0 ? { params } : {},
      ...headers !== void 0 ? { headers } : {}
    });
  }
  async post(path, body, params, headers, contentType) {
    return this.request(path, {
      method: "POST",
      ...body !== void 0 ? { body } : {},
      ...params !== void 0 ? { params } : {},
      ...headers !== void 0 ? { headers } : {},
      ...contentType !== void 0 ? { contentType } : {}
    });
  }
  async put(path, body, params, headers, contentType) {
    return this.request(path, {
      method: "PUT",
      ...body !== void 0 ? { body } : {},
      ...params !== void 0 ? { params } : {},
      ...headers !== void 0 ? { headers } : {},
      ...contentType !== void 0 ? { contentType } : {}
    });
  }
  async delete(path, params, headers) {
    return this.request(path, {
      method: "DELETE",
      ...params !== void 0 ? { params } : {},
      ...headers !== void 0 ? { headers } : {}
    });
  }
  async patch(path, body, params, headers, contentType) {
    return this.request(path, {
      method: "PATCH",
      ...body !== void 0 ? { body } : {},
      ...params !== void 0 ? { params } : {},
      ...headers !== void 0 ? { headers } : {},
      ...contentType !== void 0 ? { contentType } : {}
    });
  }
};
__publicField(_HttpClient, "ACCESS_TOKEN_HEADER", "Access-Token");
__publicField(_HttpClient, "SDKWORK_V3_UNWRAP", true);
__publicField(_HttpClient, "SDKWORK_V3_REQUEST_FINGERPRINTS", true);
__publicField(_HttpClient, "REQUIRES_SDKWORK_ACCESS_TOKEN", true);
var HttpClient = _HttpClient;
function createHttpClient(config) {
  return new HttpClient(config);
}

// ../../sdks/sdkwork-mail-app-sdk/sdkwork-mail-app-sdk-typescript/generated/server-openapi/src/api/paths.ts
var APP_API_PREFIX2 = "/app/v3/api";
function appApiPath(path) {
  if (!path) {
    return APP_API_PREFIX2;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPrefixRaw = (APP_API_PREFIX2 || "").trim();
  const normalizedPrefix = normalizedPrefixRaw ? `/${normalizedPrefixRaw.replace(/^\/+|\/+$/g, "")}` : "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!normalizedPrefix || normalizedPrefix === "/") {
    return normalizedPath;
  }
  if (normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`)) {
    return normalizedPath;
  }
  return `${normalizedPrefix}${normalizedPath}`;
}

// ../../sdks/sdkwork-mail-app-sdk/sdkwork-mail-app-sdk-typescript/generated/server-openapi/src/api/mail-accounts.ts
var MailAccountsMailAccountsApi = class {
  constructor(client) {
    __publicField(this, "client");
    this.client = client;
  }
  async list(requestOptions) {
    return this.client.request(appApiPath(`/mail/accounts`), { ...(requestOptions == null ? void 0 : requestOptions.signal) !== void 0 ? { signal: requestOptions.signal } : {}, ...(requestOptions == null ? void 0 : requestOptions.timeout) !== void 0 ? { timeout: requestOptions.timeout } : {}, method: "GET", sdkworkUnwrapKind: "page" });
  }
};
var MailAccountsMailApi = class {
  constructor(client) {
    __publicField(this, "accounts");
    this.accounts = new MailAccountsMailAccountsApi(client);
  }
};
var MailAccountsApi = class {
  constructor(client) {
    __publicField(this, "mail");
    this.mail = new MailAccountsMailApi(client);
  }
};
function createMailAccountsApi(client) {
  return new MailAccountsApi(client);
}

// ../../sdks/sdkwork-mail-app-sdk/sdkwork-mail-app-sdk-typescript/generated/server-openapi/src/api/mail-folders.ts
var MailFoldersMailFoldersApi = class {
  constructor(client) {
    __publicField(this, "client");
    this.client = client;
  }
  async list(params, requestOptions) {
    const query = buildQueryString([
      { name: "accountId", value: params.accountId, style: "form", explode: true, allowReserved: false }
    ]);
    return this.client.request(appendQueryString(appApiPath(`/mail/folders`), query), { ...(requestOptions == null ? void 0 : requestOptions.signal) !== void 0 ? { signal: requestOptions.signal } : {}, ...(requestOptions == null ? void 0 : requestOptions.timeout) !== void 0 ? { timeout: requestOptions.timeout } : {}, method: "GET", sdkworkUnwrapKind: "page" });
  }
};
var MailFoldersMailApi = class {
  constructor(client) {
    __publicField(this, "folders");
    this.folders = new MailFoldersMailFoldersApi(client);
  }
};
var MailFoldersApi = class {
  constructor(client) {
    __publicField(this, "mail");
    this.mail = new MailFoldersMailApi(client);
  }
};
function createMailFoldersApi(client) {
  return new MailFoldersApi(client);
}
function appendQueryString(path, rawQueryString) {
  const query = rawQueryString.replace(/^\?+/, "");
  if (!query) {
    return path;
  }
  return path.includes("?") ? `${path}&${query}` : `${path}?${query}`;
}
function buildQueryString(parameters) {
  const pairs = [];
  for (const parameter of parameters) {
    appendSerializedParameter(pairs, parameter);
  }
  return pairs.join("&");
}
function appendSerializedParameter(pairs, parameter) {
  if (parameter.value === void 0 || parameter.value === null) {
    return;
  }
  if (parameter.contentType) {
    pairs.push(`${encodeQueryComponent(parameter.name)}=${encodeQueryValue(JSON.stringify(parameter.value), parameter.allowReserved)}`);
    return;
  }
  const style = parameter.style || "form";
  if (style === "deepObject") {
    appendDeepObjectParameter(pairs, parameter.name, parameter.value, parameter.allowReserved);
    return;
  }
  if (Array.isArray(parameter.value)) {
    appendArrayParameter(pairs, parameter.name, parameter.value, style, parameter.explode, parameter.allowReserved);
    return;
  }
  if (typeof parameter.value === "object") {
    appendObjectParameter(pairs, parameter.name, parameter.value, style, parameter.explode, parameter.allowReserved);
    return;
  }
  pairs.push(`${encodeQueryComponent(parameter.name)}=${encodeQueryValue(serializePrimitive(parameter.value), parameter.allowReserved)}`);
}
function appendArrayParameter(pairs, name, value, style, explode, allowReserved) {
  const values = value.filter((item) => item !== void 0 && item !== null).map((item) => serializePrimitive(item));
  if (values.length === 0) {
    return;
  }
  if (style === "form" && explode) {
    for (const item of values) {
      pairs.push(`${encodeQueryComponent(name)}=${encodeQueryValue(item, allowReserved)}`);
    }
    return;
  }
  pairs.push(`${encodeQueryComponent(name)}=${encodeQueryValue(values.join(","), allowReserved)}`);
}
function appendObjectParameter(pairs, name, value, style, explode, allowReserved) {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== void 0 && entryValue !== null);
  if (entries.length === 0) {
    return;
  }
  if (style === "form" && explode) {
    for (const [key, entryValue] of entries) {
      pairs.push(`${encodeQueryComponent(key)}=${encodeQueryValue(serializePrimitive(entryValue), allowReserved)}`);
    }
    return;
  }
  const serialized = entries.flatMap(([key, entryValue]) => [key, serializePrimitive(entryValue)]).join(",");
  pairs.push(`${encodeQueryComponent(name)}=${encodeQueryValue(serialized, allowReserved)}`);
}
function appendDeepObjectParameter(pairs, name, value, allowReserved) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    pairs.push(`${encodeQueryComponent(name)}=${encodeQueryValue(serializePrimitive(value), allowReserved)}`);
    return;
  }
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue === void 0 || entryValue === null) {
      continue;
    }
    pairs.push(`${encodeQueryComponent(`${name}[${key}]`)}=${encodeQueryValue(serializePrimitive(entryValue), allowReserved)}`);
  }
}
function serializePrimitive(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
function encodeQueryComponent(value) {
  return encodeURIComponent(value);
}
function encodeQueryValue(value, allowReserved) {
  const encoded = encodeURIComponent(value);
  if (!allowReserved) {
    return encoded;
  }
  return encoded.replace(/%3A/gi, ":").replace(/%2F/gi, "/").replace(/%3F/gi, "?").replace(/%23/gi, "#").replace(/%5B/gi, "[").replace(/%5D/gi, "]").replace(/%40/gi, "@").replace(/%21/gi, "!").replace(/%24/gi, "$").replace(/%26/gi, "&").replace(/%27/gi, "'").replace(/%28/gi, "(").replace(/%29/gi, ")").replace(/%2A/gi, "*").replace(/%2B/gi, "+").replace(/%2C/gi, ",").replace(/%3B/gi, ";").replace(/%3D/gi, "=");
}

// ../../sdks/sdkwork-mail-app-sdk/sdkwork-mail-app-sdk-typescript/generated/server-openapi/src/api/mail-threads.ts
var MailThreadsMailThreadsApi = class {
  constructor(client) {
    __publicField(this, "client");
    this.client = client;
  }
  async list(params, requestOptions) {
    const query = buildQueryString2([
      { name: "folderId", value: params.folderId, style: "form", explode: true, allowReserved: false }
    ]);
    return this.client.request(appendQueryString2(appApiPath(`/mail/threads`), query), { ...(requestOptions == null ? void 0 : requestOptions.signal) !== void 0 ? { signal: requestOptions.signal } : {}, ...(requestOptions == null ? void 0 : requestOptions.timeout) !== void 0 ? { timeout: requestOptions.timeout } : {}, method: "GET", sdkworkUnwrapKind: "page" });
  }
};
var MailThreadsMailApi = class {
  constructor(client) {
    __publicField(this, "threads");
    this.threads = new MailThreadsMailThreadsApi(client);
  }
};
var MailThreadsApi = class {
  constructor(client) {
    __publicField(this, "mail");
    this.mail = new MailThreadsMailApi(client);
  }
};
function createMailThreadsApi(client) {
  return new MailThreadsApi(client);
}
function appendQueryString2(path, rawQueryString) {
  const query = rawQueryString.replace(/^\?+/, "");
  if (!query) {
    return path;
  }
  return path.includes("?") ? `${path}&${query}` : `${path}?${query}`;
}
function buildQueryString2(parameters) {
  const pairs = [];
  for (const parameter of parameters) {
    appendSerializedParameter2(pairs, parameter);
  }
  return pairs.join("&");
}
function appendSerializedParameter2(pairs, parameter) {
  if (parameter.value === void 0 || parameter.value === null) {
    return;
  }
  if (parameter.contentType) {
    pairs.push(`${encodeQueryComponent2(parameter.name)}=${encodeQueryValue2(JSON.stringify(parameter.value), parameter.allowReserved)}`);
    return;
  }
  const style = parameter.style || "form";
  if (style === "deepObject") {
    appendDeepObjectParameter2(pairs, parameter.name, parameter.value, parameter.allowReserved);
    return;
  }
  if (Array.isArray(parameter.value)) {
    appendArrayParameter2(pairs, parameter.name, parameter.value, style, parameter.explode, parameter.allowReserved);
    return;
  }
  if (typeof parameter.value === "object") {
    appendObjectParameter2(pairs, parameter.name, parameter.value, style, parameter.explode, parameter.allowReserved);
    return;
  }
  pairs.push(`${encodeQueryComponent2(parameter.name)}=${encodeQueryValue2(serializePrimitive2(parameter.value), parameter.allowReserved)}`);
}
function appendArrayParameter2(pairs, name, value, style, explode, allowReserved) {
  const values = value.filter((item) => item !== void 0 && item !== null).map((item) => serializePrimitive2(item));
  if (values.length === 0) {
    return;
  }
  if (style === "form" && explode) {
    for (const item of values) {
      pairs.push(`${encodeQueryComponent2(name)}=${encodeQueryValue2(item, allowReserved)}`);
    }
    return;
  }
  pairs.push(`${encodeQueryComponent2(name)}=${encodeQueryValue2(values.join(","), allowReserved)}`);
}
function appendObjectParameter2(pairs, name, value, style, explode, allowReserved) {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== void 0 && entryValue !== null);
  if (entries.length === 0) {
    return;
  }
  if (style === "form" && explode) {
    for (const [key, entryValue] of entries) {
      pairs.push(`${encodeQueryComponent2(key)}=${encodeQueryValue2(serializePrimitive2(entryValue), allowReserved)}`);
    }
    return;
  }
  const serialized = entries.flatMap(([key, entryValue]) => [key, serializePrimitive2(entryValue)]).join(",");
  pairs.push(`${encodeQueryComponent2(name)}=${encodeQueryValue2(serialized, allowReserved)}`);
}
function appendDeepObjectParameter2(pairs, name, value, allowReserved) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    pairs.push(`${encodeQueryComponent2(name)}=${encodeQueryValue2(serializePrimitive2(value), allowReserved)}`);
    return;
  }
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue === void 0 || entryValue === null) {
      continue;
    }
    pairs.push(`${encodeQueryComponent2(`${name}[${key}]`)}=${encodeQueryValue2(serializePrimitive2(entryValue), allowReserved)}`);
  }
}
function serializePrimitive2(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
function encodeQueryComponent2(value) {
  return encodeURIComponent(value);
}
function encodeQueryValue2(value, allowReserved) {
  const encoded = encodeURIComponent(value);
  if (!allowReserved) {
    return encoded;
  }
  return encoded.replace(/%3A/gi, ":").replace(/%2F/gi, "/").replace(/%3F/gi, "?").replace(/%23/gi, "#").replace(/%5B/gi, "[").replace(/%5D/gi, "]").replace(/%40/gi, "@").replace(/%21/gi, "!").replace(/%24/gi, "$").replace(/%26/gi, "&").replace(/%27/gi, "'").replace(/%28/gi, "(").replace(/%29/gi, ")").replace(/%2A/gi, "*").replace(/%2B/gi, "+").replace(/%2C/gi, ",").replace(/%3B/gi, ";").replace(/%3D/gi, "=");
}

// ../../sdks/sdkwork-mail-app-sdk/sdkwork-mail-app-sdk-typescript/generated/server-openapi/src/api/mail-messages.ts
var MailMessagesMailMessagesApi = class {
  constructor(client) {
    __publicField(this, "client");
    this.client = client;
  }
  async list(params, requestOptions) {
    const query = buildQueryString3([
      { name: "folderId", value: params.folderId, style: "form", explode: true, allowReserved: false },
      { name: "page_size", value: params.pageSize, style: "form", explode: true, allowReserved: false },
      { name: "cursor", value: params.cursor, style: "form", explode: true, allowReserved: false }
    ]);
    return this.client.request(appendQueryString3(appApiPath(`/mail/messages`), query), { ...(requestOptions == null ? void 0 : requestOptions.signal) !== void 0 ? { signal: requestOptions.signal } : {}, ...(requestOptions == null ? void 0 : requestOptions.timeout) !== void 0 ? { timeout: requestOptions.timeout } : {}, method: "GET", sdkworkUnwrapKind: "page" });
  }
  async create(body, requestOptions) {
    return this.client.request(appApiPath(`/mail/messages`), { ...(requestOptions == null ? void 0 : requestOptions.signal) !== void 0 ? { signal: requestOptions.signal } : {}, ...(requestOptions == null ? void 0 : requestOptions.timeout) !== void 0 ? { timeout: requestOptions.timeout } : {}, method: "POST", body, contentType: "application/json", sdkworkUnwrapKind: "item" });
  }
  async retrieve(messageId, requestOptions) {
    return this.client.request(appApiPath(`/mail/messages/${serializePathParameter(messageId, { name: "messageId", style: "simple", explode: false })}`), { ...(requestOptions == null ? void 0 : requestOptions.signal) !== void 0 ? { signal: requestOptions.signal } : {}, ...(requestOptions == null ? void 0 : requestOptions.timeout) !== void 0 ? { timeout: requestOptions.timeout } : {}, method: "GET", sdkworkUnwrapKind: "item" });
  }
  async update(messageId, body, requestOptions) {
    return this.client.request(appApiPath(`/mail/messages/${serializePathParameter(messageId, { name: "messageId", style: "simple", explode: false })}`), { ...(requestOptions == null ? void 0 : requestOptions.signal) !== void 0 ? { signal: requestOptions.signal } : {}, ...(requestOptions == null ? void 0 : requestOptions.timeout) !== void 0 ? { timeout: requestOptions.timeout } : {}, method: "PATCH", body, contentType: "application/json", sdkworkUnwrapKind: "item" });
  }
  async delete(messageId, requestOptions) {
    return this.client.request(appApiPath(`/mail/messages/${serializePathParameter(messageId, { name: "messageId", style: "simple", explode: false })}`), { ...(requestOptions == null ? void 0 : requestOptions.signal) !== void 0 ? { signal: requestOptions.signal } : {}, ...(requestOptions == null ? void 0 : requestOptions.timeout) !== void 0 ? { timeout: requestOptions.timeout } : {}, method: "DELETE" });
  }
};
var MailMessagesMailApi = class {
  constructor(client) {
    __publicField(this, "messages");
    this.messages = new MailMessagesMailMessagesApi(client);
  }
};
var MailMessagesApi = class {
  constructor(client) {
    __publicField(this, "mail");
    this.mail = new MailMessagesMailApi(client);
  }
};
function createMailMessagesApi(client) {
  return new MailMessagesApi(client);
}
function appendQueryString3(path, rawQueryString) {
  const query = rawQueryString.replace(/^\?+/, "");
  if (!query) {
    return path;
  }
  return path.includes("?") ? `${path}&${query}` : `${path}?${query}`;
}
function serializePathParameter(value, spec) {
  if (value === void 0 || value === null) {
    return "";
  }
  const style = spec.style || "simple";
  if (Array.isArray(value)) {
    return serializePathArray(spec.name, value, style, spec.explode);
  }
  if (typeof value === "object") {
    return serializePathObject(spec.name, value, style, spec.explode);
  }
  return pathPrefix(spec.name, style, false) + encodePathValue(serializePathPrimitive(value));
}
function serializePathArray(name, values, style, explode) {
  const serialized = values.filter((item) => item !== void 0 && item !== null).map((item) => encodePathValue(serializePathPrimitive(item)));
  if (serialized.length === 0) {
    return pathPrefix(name, style, false);
  }
  if (style === "matrix") {
    return explode ? serialized.map((item) => `;${name}=${item}`).join("") : `;${name}=${serialized.join(",")}`;
  }
  return pathPrefix(name, style, false) + serialized.join(explode ? "." : ",");
}
function serializePathObject(name, value, style, explode) {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== void 0 && entryValue !== null);
  if (entries.length === 0) {
    return pathPrefix(name, style, true);
  }
  if (style === "matrix") {
    return explode ? entries.map(([key, entryValue]) => `;${encodePathValue(key)}=${encodePathValue(serializePathPrimitive(entryValue))}`).join("") : `;${name}=${entries.flatMap(([key, entryValue]) => [encodePathValue(key), encodePathValue(serializePathPrimitive(entryValue))]).join(",")}`;
  }
  const serialized = explode ? entries.map(([key, entryValue]) => `${encodePathValue(key)}=${encodePathValue(serializePathPrimitive(entryValue))}`).join(style === "label" ? "." : ",") : entries.flatMap(([key, entryValue]) => [encodePathValue(key), encodePathValue(serializePathPrimitive(entryValue))]).join(",");
  return pathPrefix(name, style, true) + serialized;
}
function pathPrefix(name, style, _objectValue) {
  if (style === "label") return ".";
  if (style === "matrix") return `;${name}`;
  return "";
}
function encodePathValue(value) {
  return encodeURIComponent(value);
}
function serializePathPrimitive(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
function buildQueryString3(parameters) {
  const pairs = [];
  for (const parameter of parameters) {
    appendSerializedParameter3(pairs, parameter);
  }
  return pairs.join("&");
}
function appendSerializedParameter3(pairs, parameter) {
  if (parameter.value === void 0 || parameter.value === null) {
    return;
  }
  if (parameter.contentType) {
    pairs.push(`${encodeQueryComponent3(parameter.name)}=${encodeQueryValue3(JSON.stringify(parameter.value), parameter.allowReserved)}`);
    return;
  }
  const style = parameter.style || "form";
  if (style === "deepObject") {
    appendDeepObjectParameter3(pairs, parameter.name, parameter.value, parameter.allowReserved);
    return;
  }
  if (Array.isArray(parameter.value)) {
    appendArrayParameter3(pairs, parameter.name, parameter.value, style, parameter.explode, parameter.allowReserved);
    return;
  }
  if (typeof parameter.value === "object") {
    appendObjectParameter3(pairs, parameter.name, parameter.value, style, parameter.explode, parameter.allowReserved);
    return;
  }
  pairs.push(`${encodeQueryComponent3(parameter.name)}=${encodeQueryValue3(serializePrimitive3(parameter.value), parameter.allowReserved)}`);
}
function appendArrayParameter3(pairs, name, value, style, explode, allowReserved) {
  const values = value.filter((item) => item !== void 0 && item !== null).map((item) => serializePrimitive3(item));
  if (values.length === 0) {
    return;
  }
  if (style === "form" && explode) {
    for (const item of values) {
      pairs.push(`${encodeQueryComponent3(name)}=${encodeQueryValue3(item, allowReserved)}`);
    }
    return;
  }
  pairs.push(`${encodeQueryComponent3(name)}=${encodeQueryValue3(values.join(","), allowReserved)}`);
}
function appendObjectParameter3(pairs, name, value, style, explode, allowReserved) {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== void 0 && entryValue !== null);
  if (entries.length === 0) {
    return;
  }
  if (style === "form" && explode) {
    for (const [key, entryValue] of entries) {
      pairs.push(`${encodeQueryComponent3(key)}=${encodeQueryValue3(serializePrimitive3(entryValue), allowReserved)}`);
    }
    return;
  }
  const serialized = entries.flatMap(([key, entryValue]) => [key, serializePrimitive3(entryValue)]).join(",");
  pairs.push(`${encodeQueryComponent3(name)}=${encodeQueryValue3(serialized, allowReserved)}`);
}
function appendDeepObjectParameter3(pairs, name, value, allowReserved) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    pairs.push(`${encodeQueryComponent3(name)}=${encodeQueryValue3(serializePrimitive3(value), allowReserved)}`);
    return;
  }
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue === void 0 || entryValue === null) {
      continue;
    }
    pairs.push(`${encodeQueryComponent3(`${name}[${key}]`)}=${encodeQueryValue3(serializePrimitive3(entryValue), allowReserved)}`);
  }
}
function serializePrimitive3(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
function encodeQueryComponent3(value) {
  return encodeURIComponent(value);
}
function encodeQueryValue3(value, allowReserved) {
  const encoded = encodeURIComponent(value);
  if (!allowReserved) {
    return encoded;
  }
  return encoded.replace(/%3A/gi, ":").replace(/%2F/gi, "/").replace(/%3F/gi, "?").replace(/%23/gi, "#").replace(/%5B/gi, "[").replace(/%5D/gi, "]").replace(/%40/gi, "@").replace(/%21/gi, "!").replace(/%24/gi, "$").replace(/%26/gi, "&").replace(/%27/gi, "'").replace(/%28/gi, "(").replace(/%29/gi, ")").replace(/%2A/gi, "*").replace(/%2B/gi, "+").replace(/%2C/gi, ",").replace(/%3B/gi, ";").replace(/%3D/gi, "=");
}

// ../../sdks/sdkwork-mail-app-sdk/sdkwork-mail-app-sdk-typescript/generated/server-openapi/src/api/mail-verification.ts
var MailVerificationMailVerificationApi = class {
  constructor(client) {
    __publicField(this, "client");
    this.client = client;
  }
  async send(body, requestOptions) {
    return this.client.request(appApiPath(`/mail/verification/send`), { ...(requestOptions == null ? void 0 : requestOptions.signal) !== void 0 ? { signal: requestOptions.signal } : {}, ...(requestOptions == null ? void 0 : requestOptions.timeout) !== void 0 ? { timeout: requestOptions.timeout } : {}, method: "POST", body, contentType: "application/json", sdkworkUnwrapKind: "item" });
  }
  async verify(body, requestOptions) {
    return this.client.request(appApiPath(`/mail/verification/verify`), { ...(requestOptions == null ? void 0 : requestOptions.signal) !== void 0 ? { signal: requestOptions.signal } : {}, ...(requestOptions == null ? void 0 : requestOptions.timeout) !== void 0 ? { timeout: requestOptions.timeout } : {}, method: "POST", body, contentType: "application/json", sdkworkUnwrapKind: "item" });
  }
};
var MailVerificationMailApi = class {
  constructor(client) {
    __publicField(this, "verification");
    this.verification = new MailVerificationMailVerificationApi(client);
  }
};
var MailVerificationApi = class {
  constructor(client) {
    __publicField(this, "mail");
    this.mail = new MailVerificationMailApi(client);
  }
};
function createMailVerificationApi(client) {
  return new MailVerificationApi(client);
}

// ../../sdks/sdkwork-mail-app-sdk/sdkwork-mail-app-sdk-typescript/generated/server-openapi/src/api/mail-transactional.ts
var MailTransactionalMailTransactionalApi = class {
  constructor(client) {
    __publicField(this, "client");
    this.client = client;
  }
  async send(body, requestOptions) {
    return this.client.request(appApiPath(`/mail/transactional/send`), { ...(requestOptions == null ? void 0 : requestOptions.signal) !== void 0 ? { signal: requestOptions.signal } : {}, ...(requestOptions == null ? void 0 : requestOptions.timeout) !== void 0 ? { timeout: requestOptions.timeout } : {}, method: "POST", body, contentType: "application/json", sdkworkUnwrapKind: "item" });
  }
};
var MailTransactionalMailApi = class {
  constructor(client) {
    __publicField(this, "transactional");
    this.transactional = new MailTransactionalMailTransactionalApi(client);
  }
};
var MailTransactionalApi = class {
  constructor(client) {
    __publicField(this, "mail");
    this.mail = new MailTransactionalMailApi(client);
  }
};
function createMailTransactionalApi(client) {
  return new MailTransactionalApi(client);
}

// ../../sdks/sdkwork-mail-app-sdk/sdkwork-mail-app-sdk-typescript/generated/server-openapi/src/sdk.ts
var SdkworkAppClient = class {
  constructor(config) {
    __publicField(this, "httpClient");
    __publicField(this, "mailAccounts");
    __publicField(this, "mailFolders");
    __publicField(this, "mailThreads");
    __publicField(this, "mailMessages");
    __publicField(this, "mailVerification");
    __publicField(this, "mailTransactional");
    this.httpClient = createHttpClient(config);
    this.mailAccounts = createMailAccountsApi(this.httpClient);
    this.mailFolders = createMailFoldersApi(this.httpClient);
    this.mailThreads = createMailThreadsApi(this.httpClient);
    this.mailMessages = createMailMessagesApi(this.httpClient);
    this.mailVerification = createMailVerificationApi(this.httpClient);
    this.mailTransactional = createMailTransactionalApi(this.httpClient);
  }
  setAuthToken(token) {
    this.httpClient.setAuthToken(token);
    return this;
  }
  setAccessToken(token) {
    this.httpClient.setAccessToken(token);
    return this;
  }
  setTokenManager(manager) {
    this.httpClient.setTokenManager(manager);
    return this;
  }
  get http() {
    return this.httpClient;
  }
};
function createClient(config) {
  return new SdkworkAppClient(config);
}

// ../../sdks/sdkwork-mail-app-sdk/sdkwork-mail-app-sdk-typescript/src/index.ts
function createMailAppClient(config) {
  return createClient(config);
}
function createClient2(config) {
  return createMailAppClient(config);
}

// packages/sdkwork-mail-mp-core/src/sdk/createAppSdkClient.ts
function buildMailAppSdkHeaders(session) {
  return {
    "x-sdkwork-tenant-id": session.tenantId,
    "x-sdkwork-organization-id": session.organizationId,
    "x-sdkwork-user-id": session.userId,
    "x-sdkwork-actor-id": session.userId,
    "x-sdkwork-permission-scope": DEFAULT_APP_PERMISSION_SCOPE
  };
}
function createMailAppSdkClient({
  apiBaseUrl,
  session,
  tokenManager,
  platform = "mp-weixin"
}) {
  return createClient2({
    baseUrl: resolveAppSdkBaseUrl(apiBaseUrl),
    tokenManager,
    authToken: session == null ? void 0 : session.authToken,
    accessToken: session == null ? void 0 : session.accessToken,
    tenantId: session == null ? void 0 : session.tenantId,
    organizationId: session == null ? void 0 : session.organizationId,
    headers: session ? buildMailAppSdkHeaders(session) : void 0,
    platform
  });
}

// src/bootstrap/tokenManager.ts
var activeTokenManager = null;
function createTokenManager2(getAccessToken) {
  return {
    getAccessToken,
    getAuthToken: getAccessToken
  };
}
function setTokenManager(tokenManager) {
  activeTokenManager = tokenManager;
}
function getTokenManager() {
  return activeTokenManager != null ? activeTokenManager : void 0;
}

// src/bootstrap/hostAdapters.ts
var activeHostAdapters = null;
function registerHostAdapters() {
  if (!activeHostAdapters) {
    const hasWx = typeof globalThis.wx !== "undefined";
    activeHostAdapters = {
      secureStorage: hasWx ? createWeixinSecureStorage() : null
    };
  }
  return activeHostAdapters;
}
function getHostAdapters() {
  return activeHostAdapters != null ? activeHostAdapters : registerHostAdapters();
}

// src/bootstrap/appAuth.ts
function parseStoredSession(raw) {
  var _a, _b, _c, _d, _e;
  try {
    const parsed = JSON.parse(raw);
    if (!((_a = parsed.accessToken) == null ? void 0 : _a.trim())) {
      return null;
    }
    return {
      accessToken: parsed.accessToken.trim(),
      authToken: ((_b = parsed.authToken) == null ? void 0 : _b.trim()) || parsed.accessToken.trim(),
      tenantId: ((_c = parsed.tenantId) == null ? void 0 : _c.trim()) || DEFAULT_APP_SESSION.tenantId,
      organizationId: ((_d = parsed.organizationId) == null ? void 0 : _d.trim()) || DEFAULT_APP_SESSION.organizationId,
      userId: ((_e = parsed.userId) == null ? void 0 : _e.trim()) || DEFAULT_APP_SESSION.userId
    };
  } catch {
    return null;
  }
}
function migrateLegacyAppSession(storage) {
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
function loadAppSession() {
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
function saveAppSession(session) {
  var _a;
  (_a = getHostAdapters().secureStorage) == null ? void 0 : _a.setItem(mail_MP_SESSION_STORAGE_KEY, JSON.stringify(session));
}
function createAppTokenManager(session) {
  return createTokenManager2(() => session.accessToken);
}
function consumeAppbaseCallbackSession(query) {
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
function bootstrapAppAuth() {
  const session = loadAppSession();
  if (!session) {
    return null;
  }
  setTokenManager(createAppTokenManager(session));
  return session;
}

// src/bootstrap/environment.ts
var RUNTIME_CONFIG_KEY = "sdkwork.Mail.runtime.config";
var defaultEnvironment = {
  apiBaseUrl: "http://127.0.0.1:18090/app/v3/api",
  appbaseLoginUrl: "http://127.0.0.1:3900",
  defaultMediaMode: "video"
};
function normalizeBaseUrl(value, fallback) {
  const [normalized] = splitBaseUrls(String(value != null ? value : "").trim());
  return normalized || fallback;
}
function readStoredRuntimeConfig() {
  var _a;
  try {
    const wxStorage = globalThis.wx;
    const raw = (_a = wxStorage == null ? void 0 : wxStorage.getStorageSync) == null ? void 0 : _a.call(wxStorage, RUNTIME_CONFIG_KEY);
    if (raw && typeof raw === "object") {
      return raw;
    }
    if (typeof raw === "string" && raw.trim()) {
      return JSON.parse(raw);
    }
  } catch {
    return {};
  }
  return {};
}
function resolveEnvironment() {
  var _a;
  const stored = readStoredRuntimeConfig();
  return {
    apiBaseUrl: normalizeBaseUrl(stored.apiBaseUrl, defaultEnvironment.apiBaseUrl),
    appbaseLoginUrl: normalizeBaseUrl(stored.appbaseLoginUrl, defaultEnvironment.appbaseLoginUrl),
    defaultMediaMode: (_a = stored.defaultMediaMode) != null ? _a : defaultEnvironment.defaultMediaMode
  };
}
function saveRuntimeEnvironment(config) {
  var _a;
  const next = {
    ...resolveEnvironment(),
    ...config
  };
  if (config.apiBaseUrl !== void 0) {
    next.apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl, defaultEnvironment.apiBaseUrl);
  }
  const wxStorage = globalThis.wx;
  (_a = wxStorage == null ? void 0 : wxStorage.setStorageSync) == null ? void 0 : _a.call(wxStorage, RUNTIME_CONFIG_KEY, next);
  return next;
}

// src/bootstrap/appClient.ts
var appSdkClient = null;
function initAppSdkClient() {
  const environment = resolveEnvironment();
  appSdkClient = createMailAppSdkClient({
    apiBaseUrl: environment.apiBaseUrl,
    session: loadAppSession(),
    tokenManager: getTokenManager(),
    platform: "mp-weixin"
  });
  return appSdkClient;
}
function getAppSdkClient() {
  return appSdkClient != null ? appSdkClient : initAppSdkClient();
}

// src/bootstrap/iamRuntime.ts
function bootstrap(query = {}) {
  installWeixinFetch();
  registerHostAdapters();
  consumeAppbaseCallbackSession(query);
  bootstrapAppAuth();
  initAppSdkClient();
}

// packages/sdkwork-mail-mp-mail/src/services/mailAppServices.ts
function readItems(payload) {
  return Array.isArray(payload == null ? void 0 : payload.items) ? payload.items : [];
}
function createMailAppServices(client) {
  return {
    async listAccounts() {
      const response = await client.mailAccounts.mail.accounts.list();
      return readItems(response);
    },
    async listFolders(accountId) {
      const response = await client.mailFolders.mail.folders.list({ accountId });
      return readItems(response);
    },
    async listMessages(folderId) {
      const response = await client.mailMessages.mail.messages.list({ folderId });
      return readItems(response);
    },
    async retrieveMessage(messageId) {
      const response = await client.mailMessages.mail.messages.retrieve(messageId);
      if (!response.data) {
        throw new Error(`mail message not found: ${messageId}`);
      }
      return response.data;
    }
  };
}

// src/bootstrap/appServices.ts
var appServices = null;
function createAppServices() {
  appServices = createMailAppServices(getAppSdkClient());
  return appServices;
}

// src/bootstrap/runtimeBundle.ts
function getServices() {
  return createAppServices();
}
function bootstrapMailMiniProgram(query = {}) {
  installWeixinFetch();
  bootstrap(query);
}
async function listMailAccounts() {
  return getServices().listAccounts();
}
async function listMailFolders(accountId) {
  return getServices().listFolders(accountId);
}
async function listMailMessages(folderId) {
  return getServices().listMessages(folderId);
}
async function getMailMessage(messageId) {
  return getServices().retrieveMessage(messageId);
}
function configureMailRuntime(config) {
  return saveRuntimeEnvironment(config);
}
function getMailRuntimeEnvironment() {
  return resolveEnvironment();
}
