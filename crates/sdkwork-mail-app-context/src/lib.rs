use std::collections::BTreeSet;

use axum::http::HeaderMap;
use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::Sha256;

const APP_CONTEXT_SIGNATURE_SECRET_ENV: &str = "SDKWORK_MAIL_APP_CONTEXT_SIGNATURE_SECRET";
const APP_CONTEXT_REQUIRE_SIGNATURE_ENV: &str = "SDKWORK_MAIL_APP_CONTEXT_REQUIRE_SIGNATURE";
const APP_CONTEXT_SIGNATURE_HEADER: &str = "x-sdkwork-context-signature";
pub const APP_CONTEXT_SIGNED_HEADER_NAMES: &[&str] = &[
    "x-sdkwork-app-id",
    "x-sdkwork-tenant-id",
    "x-sdkwork-organization-id",
    "x-sdkwork-user-id",
    "x-sdkwork-session-id",
    "x-sdkwork-environment",
    "x-sdkwork-deployment-mode",
    "x-sdkwork-auth-level",
    "x-sdkwork-data-scope",
    "x-sdkwork-permission-scope",
    "x-sdkwork-actor-id",
    "x-sdkwork-actor-kind",
    "x-sdkwork-device-id",
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppContext {
    pub tenant_id: String,
    pub organization_id: Option<String>,
    pub user_id: String,
    pub session_id: Option<String>,
    pub app_id: Option<String>,
    pub environment: Option<String>,
    pub deployment_mode: Option<String>,
    pub auth_level: Option<String>,
    pub data_scope: BTreeSet<String>,
    pub permission_scope: BTreeSet<String>,
    pub actor_id: String,
    pub actor_kind: String,
    pub device_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppContextError {
    code: &'static str,
    message: String,
}

impl AppContextError {
    pub fn code(&self) -> &'static str {
        self.code
    }

    pub fn message(&self) -> &str {
        self.message.as_str()
    }

    fn missing(message: impl Into<String>) -> Self {
        Self {
            code: "app_context_missing",
            message: message.into(),
        }
    }

    fn invalid(message: impl Into<String>) -> Self {
        Self {
            code: "app_context_invalid",
            message: message.into(),
        }
    }
}

impl std::fmt::Display for AppContextError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppContextError {}

impl AppContext {
    pub fn has_permission(&self, permission: &str) -> bool {
        if permission.trim().is_empty() {
            return false;
        }
        // `tenant.admin` is a legacy platform-admin marker, not a grant pattern.
        if self
            .permission_scope
            .iter()
            .any(|scope| scope == "tenant.admin")
        {
            return true;
        }
        // Wildcard-aware (AUTHORIZATION_STATE_SPEC 3.5): `*`, `{domain}.*`, and
        // `*.{action}` grants must authorize without re-login or re-expansion.
        self.permission_scope.iter().any(|granted| {
            sdkwork_web_core::request_context::permission_code_matches(granted, permission)
        })
    }
}

pub fn resolve_app_context(headers: &HeaderMap) -> Result<AppContext, AppContextError> {
    validate_app_context_signature(headers, AppContextSignatureConfig::from_env())?;
    resolve_app_context_projection(headers)
}

pub fn resolve_app_context_with_signature_config(
    headers: &HeaderMap,
    signature_config: AppContextSignatureConfig,
) -> Result<AppContext, AppContextError> {
    validate_app_context_signature(headers, signature_config)?;
    resolve_app_context_projection(headers)
}

pub fn resolve_app_context_projection(headers: &HeaderMap) -> Result<AppContext, AppContextError> {
    let tenant_id = resolve_header(headers, &["x-sdkwork-tenant-id"])?;
    let user_id = resolve_header(headers, &["x-sdkwork-user-id"])?;
    let session_id = resolve_optional_header(headers, &["x-sdkwork-session-id"]);
    let app_id = resolve_optional_header(headers, &["x-sdkwork-app-id"]);
    let environment = resolve_optional_header(headers, &["x-sdkwork-environment"]);
    let deployment_mode = resolve_optional_header(headers, &["x-sdkwork-deployment-mode"]);
    let auth_level = resolve_optional_header(headers, &["x-sdkwork-auth-level"]);
    let actor_id = resolve_optional_header(headers, &["x-sdkwork-actor-id"])
        .unwrap_or_else(|| user_id.clone());
    let actor_kind = resolve_optional_header(headers, &["x-sdkwork-actor-kind"])
        .unwrap_or_else(|| "user".to_owned());
    let organization_id = resolve_optional_header(headers, &["x-sdkwork-organization-id"]);
    let device_id = resolve_optional_header(headers, &["x-sdkwork-device-id"]);
    let data_scope = resolve_scope_from_headers(headers, &["x-sdkwork-data-scope"]);
    let permission_scope = resolve_scope_from_headers(headers, &["x-sdkwork-permission-scope"]);

    Ok(AppContext {
        tenant_id,
        organization_id,
        user_id,
        session_id,
        app_id,
        environment,
        deployment_mode,
        auth_level,
        data_scope,
        permission_scope,
        actor_id,
        actor_kind,
        device_id,
    })
}

fn resolve_header(headers: &HeaderMap, names: &[&str]) -> Result<String, AppContextError> {
    resolve_optional_header(headers, names).ok_or_else(|| {
        AppContextError::missing(format!("missing sdkwork app context header: {}", names[0]))
    })
}

fn resolve_optional_header(headers: &HeaderMap, names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| {
        headers
            .get(*name)
            .and_then(|value| value.to_str().ok())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn resolve_scope_from_headers(headers: &HeaderMap, names: &[&str]) -> BTreeSet<String> {
    let mut scope = BTreeSet::new();

    for name in names {
        if let Some(value) = headers.get(*name).and_then(|value| value.to_str().ok()) {
            append_scope_str(&mut scope, value);
        }
    }

    scope
}

fn append_scope_str(scope: &mut BTreeSet<String>, raw: &str) {
    for token in raw.split(|ch: char| ch.is_whitespace() || ch == ',') {
        let item = token.trim();
        if !item.is_empty() {
            scope.insert(item.to_owned());
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppContextSignatureConfig {
    pub require_signature: bool,
    pub shared_secret: Option<String>,
}

impl AppContextSignatureConfig {
    pub fn from_env() -> Self {
        Self {
            require_signature: parse_truthy_env_flag(
                std::env::var(APP_CONTEXT_REQUIRE_SIGNATURE_ENV).ok(),
            ),
            shared_secret: std::env::var(APP_CONTEXT_SIGNATURE_SECRET_ENV)
                .ok()
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty()),
        }
    }
}

fn validate_app_context_signature(
    headers: &HeaderMap,
    config: AppContextSignatureConfig,
) -> Result<(), AppContextError> {
    if !config.require_signature {
        return Ok(());
    }

    let shared_secret = config.shared_secret.ok_or_else(|| {
        AppContextError::invalid(format!(
            "{APP_CONTEXT_SIGNATURE_SECRET_ENV} must be configured when {APP_CONTEXT_REQUIRE_SIGNATURE_ENV}=true"
        ))
    })?;
    let received_signature = resolve_optional_header(headers, &[APP_CONTEXT_SIGNATURE_HEADER])
        .ok_or_else(|| {
            AppContextError::invalid(format!(
                "missing app context signature header: {APP_CONTEXT_SIGNATURE_HEADER}"
            ))
        })?;
    let expected_signature = sign_app_context_headers(headers, shared_secret.as_str())?;

    if !constant_time_eq(received_signature.as_bytes(), expected_signature.as_bytes()) {
        return Err(AppContextError::invalid(
            "app context signature validation failed",
        ));
    }

    Ok(())
}

pub fn sign_app_context_headers(
    headers: &HeaderMap,
    secret: &str,
) -> Result<String, AppContextError> {
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| AppContextError::invalid("invalid app context signature secret bytes"))?;
    let payload = canonicalize_app_context_headers(headers);
    mac.update(payload.as_bytes());
    let digest = mac.finalize().into_bytes();
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest))
}

pub fn canonicalize_app_context_headers(headers: &HeaderMap) -> String {
    APP_CONTEXT_SIGNED_HEADER_NAMES
        .iter()
        .map(|name| {
            let value = resolve_optional_header(headers, &[*name]).unwrap_or_default();
            format!("{name}:{value}")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }

    let mut diff: u8 = 0;
    for (&a, &b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

fn parse_truthy_env_flag(raw: Option<String>) -> bool {
    raw.as_deref().map(str::trim).is_some_and(|value| {
        matches!(
            value.to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        )
    })
}

/// Maps a framework-resolved [`WebRequestContext`] into the Mail domain [`AppContext`].
pub fn app_context_from_web_request(
    context: &sdkwork_web_core::WebRequestContext,
) -> Option<AppContext> {
    let principal = context.principal.as_ref()?;
    Some(app_context_from_web_principal(principal))
}

pub fn app_context_from_web_principal(
    principal: &sdkwork_web_core::WebRequestPrincipal,
) -> AppContext {
    use sdkwork_web_core::{WebAuthLevel, WebDeploymentMode, WebEnvironment, WebSubjectType};

    let environment = match principal.app.environment {
        WebEnvironment::Dev => Some("dev".to_owned()),
        WebEnvironment::Test => Some("test".to_owned()),
        WebEnvironment::Prod => Some("prod".to_owned()),
    };
    let deployment_mode = match principal.app.deployment_mode {
        WebDeploymentMode::Saas => Some("saas".to_owned()),
        WebDeploymentMode::Local => Some("local".to_owned()),
        WebDeploymentMode::Private => Some("private".to_owned()),
    };
    let auth_level = match principal.auth.auth_level {
        WebAuthLevel::Anonymous => Some("anonymous".to_owned()),
        WebAuthLevel::Password => Some("password".to_owned()),
        WebAuthLevel::Mfa => Some("mfa".to_owned()),
        WebAuthLevel::System | WebAuthLevel::ApiKey => Some("system".to_owned()),
    };
    let actor_kind = match principal.subject.subject_type {
        WebSubjectType::User => "user".to_owned(),
        WebSubjectType::Service => "service".to_owned(),
        WebSubjectType::System => "system".to_owned(),
        WebSubjectType::ApiKey => "api_key".to_owned(),
    };

    AppContext {
        tenant_id: principal.tenant_id().to_owned(),
        organization_id: principal.organization_id().map(str::to_owned),
        user_id: principal.user_id().to_owned(),
        session_id: principal.session_id().map(str::to_owned),
        app_id: Some(principal.app_id().to_owned()),
        environment,
        deployment_mode,
        auth_level,
        data_scope: principal.scopes.data_scope.iter().cloned().collect(),
        permission_scope: principal.scopes.permission_scope.iter().cloned().collect(),
        actor_id: principal.user_id().to_owned(),
        actor_kind,
        device_id: None,
    }
}
