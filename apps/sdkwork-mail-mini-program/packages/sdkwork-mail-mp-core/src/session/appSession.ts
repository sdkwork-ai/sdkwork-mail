export interface MailAppSession {
  accessToken: string;
  authToken: string;
  tenantId: string;
  organizationId: string;
  userId: string;
}

export const DEFAULT_APP_SESSION: MailAppSession = {
  accessToken: "",
  authToken: "",
  tenantId: "100001",
  organizationId: "0",
  userId: "1",
};

export const DEFAULT_APP_PERMISSION_SCOPE = "mail.messages.read mail.messages.write mail.verification.write mail.transactional.write";
