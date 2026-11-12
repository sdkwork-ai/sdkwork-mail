export {
  DEFAULT_APP_PERMISSION_SCOPE,
  DEFAULT_APP_SESSION,
  type MailAppSession,
} from "./session/appSession";
export {
  buildAppbaseLoginUrl,
  parseAppbaseCallbackSession,
  stripAppbaseCallbackFromLocation,
} from "./session/appbaseAuthBridge";
export { resolveAppSdkBaseUrl } from "./config/resolveAppSdkBaseUrl";
export {
  buildMailAppSdkHeaders,
  createMailAppSdkClient,
  type CreateMailAppSdkClientOptions,
} from "./sdk/createAppSdkClient";
export { getMailAppSdkClient, resetMailAppSdkClient } from "./sdk/appSdkClient";
export {
  mail_IAM_SESSION_CHANGED_EVENT,
  mail_IAM_SESSION_STORAGE_KEY,
  applyMailIamSessionTokens,
  clearMailIamSessionTokens,
  getMailGlobalTokenManager,
  isMailIamSessionAuthenticated,
  readMailIamSessionTokens,
  toMailAppSession,
  type MailIamSession,
} from "./session/iamSession";
export {
  LEGACY_MAIL_ADMIN_SESSION_STORAGE_KEYS,
  MAIL_ADMIN_SESSION_STORAGE_KEY,
  clearMailAdminSessionStorage,
  parseMailAdminSessionRecord,
  purgeLegacyMailAdminSessionStorage,
  readMailAdminSessionStorage,
  resolveMailAdminSessionBindingKey,
  writeMailAdminSessionStorage,
  type MailAdminSessionBindingSource,
  type MailAdminSessionRecord,
  type MailAdminSessionStorageLike,
  type MailAdminSessionStorages,
} from "./session/adminSessionStorage";
export type { MailAppSdkClient, MailAppSdkPort } from "./sdk/appSdkPort";
