class MailAdminSession {
  const MailAdminSession({
    required this.accessToken,
    required this.authToken,
    required this.tenantId,
    required this.organizationId,
    required this.userId,
  });

  final String accessToken;
  final String authToken;
  final String tenantId;
  final String organizationId;
  final String userId;
}

const defaultAdminPermissionScope =
    'mail.templates.read mail.templates.write mail.messages.read mail.provider_accounts.read mail.provider_accounts.write mail.marketing_consents.read mail.marketing_consents.write';

const defaultAdminSession = MailAdminSession(
  accessToken: '',
  authToken: '',
  tenantId: 'default',
  organizationId: 'default',
  userId: 'admin',
);

MailAdminSession? _activeAdminSession;

MailAdminSession? loadAdminSession() => _activeAdminSession;

void saveAdminSession(MailAdminSession session) {
  _activeAdminSession = session;
}

void clearAdminSession() {
  _activeAdminSession = null;
}

MailAdminSession? bootstrapAdminAuth() => loadAdminSession();
