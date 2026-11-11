//! Mail's Drive attachment port (MODULE_SPEC.md §4.2, in-process first).
//!
//! A mail message references attachment bytes that live in sdkwork-drive
//! (`mail_attachment.drive_node_id`). Every SDKWork packaged deployment runs one
//! backend process against one PostgreSQL, so Mail reaches Drive **in-process**:
//! it depends on `sdkwork-drive-workspace-service` and calls Drive's own
//! service/repository APIs on the pool the process already owns.
//!
//! # What the HTTP facade did, and what this port reproduces
//!
//! The previous adapter called Drive's app-api `GET /app/v3/api/drive/nodes/{id}`
//! with a service credential. That route:
//!
//! - resolved the node **inside the caller's tenant** (`dr_drive_node.tenant_id`),
//! - required the resolved subject to hold the `reader` role on the node
//!   (`acl::ensure_ctx_node_role(..., "reader")`), and
//! - reported a missing node as `404`, a denied node as `403`, and a Drive-side
//!   failure as `5xx`.
//!
//! All three behaviours are preserved here, using Drive's own building blocks
//! rather than a re-implementation (MODULE_SPEC.md §4.2.7):
//!
//! | Need | Drive API |
//! | --- | --- |
//! | node by tenant + id, active | `DriveUploaderStore::find_active_node` (`SqlUploaderStore`) |
//! | its space by tenant + id, active | `DriveUploaderStore::find_active_space` (`SqlUploaderStore`) |
//! | effective node role | `SqlDrivePermissionService::resolve_effective_node_access` + `allows_role` |
//!
//! The subject is the **message owner** (`owner_user_id`), which is the identity
//! the Drive route authorized; the tenant comes from the request context, never
//! from a deployment default.
//!
//! # Attachment creation is a write path
//!
//! `MailProductService::create_message` runs this validation **before** the
//! message row is written, so an unavailable Drive can never surface after the
//! message exists. Nothing here reorders that.
//!
//! # Error mapping (unchanged HTTP status codes)
//!
//! | Condition | Port error | Mail app-api status |
//! | --- | --- | --- |
//! | node missing / soft-deleted / archived or trashed / space not active | `Validation` | `400` (was Drive `404`) |
//! | effective role does not satisfy `reader` | `Validation` | `400` (was Drive `403`) |
//! | Drive-side failure (SQL/permission store) | `Unavailable` | `503` (was Drive `5xx`) |
//!
//! `find_active_node` is the predicate Drive's own read and download routes use
//! (`download_handlers::create_node_download_grant`), so an attachment that can
//! no longer be downloaded is refused at create time instead of being accepted
//! on the strength of being merely non-deleted.
//!
//! # Split deployment (explicit opt-in only)
//!
//! `SDKWORK_MAIL_DRIVE_MODE=http` selects
//! [`drive_attachment_http_adapter`], which reads the Drive facade endpoint
//! variable declared in that module. That path exists only for a real split
//! deployment; it is validated at startup (a missing endpoint aborts the boot
//! instead of failing the first message) and is recorded in
//! `specs/backend-module-call-boundary.allow.json`. Any other value, and any
//! deployment that configures nothing, uses the in-process port.

use std::collections::HashSet;
use std::sync::Arc;

use sqlx::PgPool;

use sdkwork_communication_mail_service::{
    CreateMailAttachmentInput, LocalMailDriveAttachmentPort, MailDriveAttachmentError,
    MailDriveAttachmentFuture, MailDriveAttachmentPort, validate_mail_attachment_fields,
};
use sdkwork_drive_workspace_service::DriveServiceError;
use sdkwork_drive_workspace_service::application::permission_service::SqlDrivePermissionService;
use sdkwork_drive_workspace_service::infrastructure::sql::uploader_store::SqlUploaderStore;
use sdkwork_drive_workspace_service::ports::permission_store::ResolveEffectiveNodeAccessCommand;
use sdkwork_drive_workspace_service::ports::uploader_store::{
    DriveUploaderNodeRecord, DriveUploaderStore,
};
use sdkwork_utils_rust::string::trim;

use crate::drive_attachment_http_adapter::HttpMailDriveAttachmentPort;

/// Selects how Mail reaches sdkwork-drive.
pub const MAIL_DRIVE_MODE_ENV: &str = "SDKWORK_MAIL_DRIVE_MODE";

/// The role Drive's node read routes require on the node
/// (`acl::ensure_ctx_node_role(..., "reader")`).
const DRIVE_READ_ROLE: &str = "reader";

/// The Drive subject type a signed-in mail user is authorized as
/// (`sdkwork-routes-drive-app-api` `validate_subject_type`).
const DRIVE_USER_SUBJECT_TYPE: &str = "user";

/// How this process reaches sdkwork-drive.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MailDriveAttachmentMode {
    /// Call Drive's service/repository crates in this process over the host
    /// pool. The default: no endpoint, no service credential, no extra hop.
    InProcess,
    /// Address Drive's app-api over HTTP. Only valid for an explicit split
    /// deployment where Drive runs in another process or container.
    Http,
}

impl MailDriveAttachmentMode {
    /// Stable spelling used in logs, health output, and the opt-in value.
    pub fn label(self) -> &'static str {
        match self {
            Self::InProcess => "in-process",
            Self::Http => "http",
        }
    }
}

/// Why the attachment port could not be built at startup.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MailDriveAttachmentBootstrapError {
    /// `SDKWORK_MAIL_DRIVE_MODE` carried a value this build does not know.
    UnsupportedMode(String),
    /// The HTTP opt-in was selected without its endpoint.
    MissingEndpoint { variable: &'static str },
}

impl std::fmt::Display for MailDriveAttachmentBootstrapError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnsupportedMode(value) => write!(
                f,
                "unsupported {MAIL_DRIVE_MODE_ENV} value: {value} (expected \"in-process\" or \"http\")"
            ),
            Self::MissingEndpoint { variable } => write!(
                f,
                "{MAIL_DRIVE_MODE_ENV}=http requires {variable}; refusing to boot without it"
            ),
        }
    }
}

impl std::error::Error for MailDriveAttachmentBootstrapError {}

/// Builds the attachment port for this process.
///
/// # Errors
///
/// Fails at startup (never at the first message) when the HTTP opt-in is
/// selected without its endpoint, or when the mode value is unrecognized. The
/// default in-process mode never needs sibling configuration.
pub fn build_mail_drive_attachment_port_from_env(
    pool: Option<PgPool>,
) -> Result<Arc<dyn MailDriveAttachmentPort>, MailDriveAttachmentBootstrapError> {
    match mail_drive_attachment_mode()? {
        MailDriveAttachmentMode::Http => Ok(Arc::new(HttpMailDriveAttachmentPort::from_env()?)),
        MailDriveAttachmentMode::InProcess => Ok(match pool {
            Some(pool) => Arc::new(InProcessMailDriveAttachmentPort::new(pool)),
            // No database means no persistence either (`NoopMailPersistencePort`
            // refuses `create_message`), so there is no Drive data to check
            // against; field validation stays identical to before.
            None => Arc::new(LocalMailDriveAttachmentPort),
        }),
    }
}

/// Resolves the attachment mode from the process environment.
///
/// # Errors
///
/// See [`resolve_mail_drive_attachment_mode`].
pub fn mail_drive_attachment_mode()
-> Result<MailDriveAttachmentMode, MailDriveAttachmentBootstrapError> {
    let configured = std::env::var(MAIL_DRIVE_MODE_ENV).ok();
    resolve_mail_drive_attachment_mode(configured.as_deref())
}

/// Pure mode resolution so the environment-free rules stay unit-testable.
///
/// Absent or blank means [`MailDriveAttachmentMode::InProcess`]; only an
/// explicit `http` selects the split-deployment adapter. An unrecognized value
/// is an error instead of a silent fallback, so a misspelled opt-in cannot look
/// like a working split deployment.
///
/// # Errors
///
/// Returns [`MailDriveAttachmentBootstrapError::UnsupportedMode`] for any other
/// non-blank value.
pub fn resolve_mail_drive_attachment_mode(
    configured: Option<&str>,
) -> Result<MailDriveAttachmentMode, MailDriveAttachmentBootstrapError> {
    match configured.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(MailDriveAttachmentMode::InProcess),
        Some(raw) => match raw.to_ascii_lowercase().as_str() {
            "in-process" | "in_process" | "inprocess" => Ok(MailDriveAttachmentMode::InProcess),
            "http" => Ok(MailDriveAttachmentMode::Http),
            _ => Err(MailDriveAttachmentBootstrapError::UnsupportedMode(
                raw.to_owned(),
            )),
        },
    }
}

/// Drive attachment validation on the host pool (MODULE_SPEC.md §4.2).
#[derive(Debug, Clone)]
pub struct InProcessMailDriveAttachmentPort {
    pool: PgPool,
}

impl InProcessMailDriveAttachmentPort {
    /// Build the port over the process database pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Load an active node scoped to the tenant, reporting absence the way the
    /// replaced route's `404` did.
    async fn load_active_node(
        &self,
        tenant_id: &str,
        node_id: &str,
    ) -> Result<DriveUploaderNodeRecord, MailDriveAttachmentError> {
        SqlUploaderStore::new(self.pool.clone())
            .find_active_node(tenant_id, node_id)
            .await
            .map_err(|error| drive_lookup_unavailable(node_id, &error))?
            .ok_or_else(|| drive_node_not_found(node_id))
    }

    /// Require the node's space to be active in the same tenant, as Drive's
    /// route did before authorizing on it.
    async fn ensure_space_active(
        &self,
        tenant_id: &str,
        node: &DriveUploaderNodeRecord,
        node_id: &str,
    ) -> Result<(), MailDriveAttachmentError> {
        let space = SqlUploaderStore::new(self.pool.clone())
            .find_active_space(tenant_id, &node.space_id)
            .await
            .map_err(|error| drive_lookup_unavailable(node_id, &error))?;
        if space.is_none() {
            return Err(drive_node_not_found(node_id));
        }
        Ok(())
    }

    /// Reproduce Drive's `ensure_ctx_node_role(..., "reader")` for the message
    /// owner: an effective role that satisfies `reader` by ownership, direct
    /// grant, or inherited grant.
    async fn ensure_reader(
        &self,
        tenant_id: &str,
        owner_user_id: &str,
        node: &DriveUploaderNodeRecord,
        node_id: &str,
    ) -> Result<(), MailDriveAttachmentError> {
        let access = SqlDrivePermissionService::new(self.pool.clone())
            .resolve_effective_node_access(ResolveEffectiveNodeAccessCommand {
                tenant_id: tenant_id.to_owned(),
                space_id: node.space_id.clone(),
                node_id: node.id.clone(),
                subject_type: DRIVE_USER_SUBJECT_TYPE.to_owned(),
                subject_id: owner_user_id.to_owned(),
            })
            .await
            .map_err(|error| map_permission_error(error, node_id))?;
        if !access.allows_role(DRIVE_READ_ROLE) {
            return Err(MailDriveAttachmentError::Validation(format!(
                "drive node access denied: {node_id}"
            )));
        }
        Ok(())
    }
}

impl MailDriveAttachmentPort for InProcessMailDriveAttachmentPort {
    fn validate_attachments<'a>(
        &'a self,
        tenant_id: &'a str,
        owner_user_id: &'a str,
        attachments: &'a [CreateMailAttachmentInput],
    ) -> MailDriveAttachmentFuture<'a> {
        Box::pin(async move {
            let mut verified_spaces: HashSet<String> = HashSet::new();
            for attachment in attachments {
                validate_mail_attachment_fields(attachment)?;
                let node_id = trim(&attachment.drive_node_id);
                let node = self.load_active_node(tenant_id, &node_id).await?;
                // Attachments of one message usually share a space; resolve each
                // space once instead of once per attachment.
                if verified_spaces.insert(node.space_id.clone()) {
                    self.ensure_space_active(tenant_id, &node, &node_id).await?;
                }
                self.ensure_reader(tenant_id, owner_user_id, &node, &node_id)
                    .await?;
            }
            Ok(())
        })
    }
}

fn drive_node_not_found(node_id: &str) -> MailDriveAttachmentError {
    MailDriveAttachmentError::Validation(format!("drive node not found: {node_id}"))
}

fn drive_lookup_unavailable(node_id: &str, error: &DriveServiceError) -> MailDriveAttachmentError {
    MailDriveAttachmentError::Unavailable(format!(
        "drive node lookup failed for {node_id}: {}",
        error.message()
    ))
}

/// Map Drive's typed errors to the port's two kinds so the HTTP status mapping
/// in `service.rs` stays what the facade adapter produced.
fn map_permission_error(error: DriveServiceError, node_id: &str) -> MailDriveAttachmentError {
    match error {
        DriveServiceError::NotFound(_) => drive_node_not_found(node_id),
        DriveServiceError::PermissionDenied(_) => {
            MailDriveAttachmentError::Validation(format!("drive node access denied: {node_id}"))
        }
        DriveServiceError::Validation(message) => MailDriveAttachmentError::Validation(format!(
            "drive node validation failed for {node_id}: {message}"
        )),
        DriveServiceError::Conflict(message) | DriveServiceError::Internal(message) => {
            MailDriveAttachmentError::Unavailable(format!(
                "drive permission resolution failed for {node_id}: {message}"
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unset_mode_resolves_in_process() {
        assert_eq!(
            resolve_mail_drive_attachment_mode(None),
            Ok(MailDriveAttachmentMode::InProcess)
        );
    }

    #[test]
    fn a_blank_mode_is_treated_as_unset() {
        for value in ["", "   ", "\t"] {
            assert_eq!(
                resolve_mail_drive_attachment_mode(Some(value)),
                Ok(MailDriveAttachmentMode::InProcess),
                "value {value:?} must resolve to the in-process default"
            );
        }
    }

    #[test]
    fn http_is_an_explicit_opt_in() {
        for value in ["http", "HTTP", " Http "] {
            assert_eq!(
                resolve_mail_drive_attachment_mode(Some(value)),
                Ok(MailDriveAttachmentMode::Http),
                "value {value:?} must select the split-deployment adapter"
            );
        }
    }

    #[test]
    fn in_process_spellings_are_accepted() {
        for value in ["in-process", "IN-PROCESS", "in_process", "inprocess"] {
            assert_eq!(
                resolve_mail_drive_attachment_mode(Some(value)),
                Ok(MailDriveAttachmentMode::InProcess),
                "value {value:?} must select the in-process port"
            );
        }
    }

    #[test]
    fn an_unknown_mode_names_the_variable_and_the_accepted_values() {
        let error = resolve_mail_drive_attachment_mode(Some("grpc"))
            .expect_err("an unknown mode must not silently fall back");
        let rendered = error.to_string();
        assert!(rendered.contains(MAIL_DRIVE_MODE_ENV), "{rendered}");
        assert!(rendered.contains("\"in-process\""), "{rendered}");
        assert!(rendered.contains("\"http\""), "{rendered}");
    }

    #[test]
    fn the_http_opt_in_without_an_endpoint_fails_at_startup() {
        let error = MailDriveAttachmentBootstrapError::MissingEndpoint {
            variable: "SDKWORK_DRIVE_FACADE_URL",
        };
        let rendered = error.to_string();
        assert!(rendered.contains(MAIL_DRIVE_MODE_ENV), "{rendered}");
        assert!(rendered.contains("SDKWORK_DRIVE_FACADE_URL"), "{rendered}");
    }

    #[test]
    fn labels_are_the_documented_spellings() {
        assert_eq!(MailDriveAttachmentMode::InProcess.label(), "in-process");
        assert_eq!(MailDriveAttachmentMode::Http.label(), "http");
    }

    #[test]
    fn the_default_port_is_in_process_on_the_host_pool() {
        // Regression guard for MODULE_SPEC.md §4.2: the default path calls
        // Drive's own store, space lookup and permission service in-process,
        // and never depends on a sibling HTTP endpoint.
        let source = include_str!("drive_attachment_port.rs");
        let production = source
            .split("#[cfg(test)]")
            .next()
            .expect("the module has a production section");
        assert!(production.contains("find_active_node("), "{production}");
        assert!(production.contains("find_active_space("), "{production}");
        assert!(
            production.contains("resolve_effective_node_access("),
            "{production}"
        );
        assert!(production.contains("allows_role("), "{production}");
        assert!(production.contains("\"reader\""), "{production}");
        assert!(
            !production.contains("reqwest"),
            "the in-process port must not depend on reqwest"
        );
        assert!(
            !production.contains("SDKWORK_DRIVE_FACADE_URL"),
            "only the opt-in HTTP adapter may address the Drive endpoint"
        );
        assert!(
            !production.contains("_URL\""),
            "the in-process port must not read an endpoint variable"
        );
        assert!(
            !production.contains("is_blank("),
            "field validation is delegated, not re-implemented"
        );
    }

    #[test]
    fn the_tenant_and_subject_come_from_the_request() {
        let source = include_str!("drive_attachment_port.rs");
        let production = source
            .split("#[cfg(test)]")
            .next()
            .expect("the module has a production section");
        assert!(
            production.contains("tenant_id: tenant_id.to_owned()"),
            "the permission command must carry the request tenant"
        );
        assert!(
            production.contains("subject_id: owner_user_id.to_owned()"),
            "the permission command must carry the message owner as subject"
        );
        assert!(
            !production.contains("std::env::var(\"SDKWORK_MAIL_DRIVE_SUBJECT"),
            "the subject must never come from an environment default"
        );
    }
}
