class MailAppSession {
  const MailAppSession({
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

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'authToken': authToken,
        'tenantId': tenantId,
        'organizationId': organizationId,
        'userId': userId,
      };

  factory MailAppSession.fromJson(Map<String, dynamic> json) {
    final accessToken = json['accessToken']?.toString().trim() ?? '';
    final authToken = json['authToken']?.toString().trim() ?? accessToken;
    return MailAppSession(
      accessToken: accessToken,
      authToken: authToken,
      tenantId: json['tenantId']?.toString().trim().isNotEmpty == true
          ? json['tenantId'].toString().trim()
          : defaultAppSession.tenantId,
      organizationId: json['organizationId']?.toString().trim().isNotEmpty == true
          ? json['organizationId'].toString().trim()
          : defaultAppSession.organizationId,
      userId: json['userId']?.toString().trim().isNotEmpty == true
          ? json['userId'].toString().trim()
          : defaultAppSession.userId,
    );
  }
}

const defaultAppPermissionScope =
    'mail.messages.read mail.messages.write mail.verification.write mail.transactional.write';

const defaultAppSession = MailAppSession(
  accessToken: '',
  authToken: '',
  tenantId: 'default',
  organizationId: 'default',
  userId: 'user',
);

const MailFlutterMobileSessionStorageKey = 'sdkwork-mail-flutter-mobile:session:v1';
const legacyMailFlutterMobileSessionStorageKeys = <String>[
  'sdkwork.Mail.app.session',
];
