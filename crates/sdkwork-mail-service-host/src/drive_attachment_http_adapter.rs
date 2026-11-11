//! Split-deployment sdkwork-drive adapter (HTTP).
//!
//! `MODULE_SPEC.md` §4.2 makes the in-process port the default; this module
//! exists only for an explicit split deployment where sdkwork-drive really runs
//! in another process or container. It is selected by
//! `SDKWORK_MAIL_DRIVE_MODE=http`, is built during startup, and is recorded in
//! `specs/backend-module-call-boundary.allow.json` (MODULE_SPEC.md §4.2.3).
//!
//! A missing `SDKWORK_DRIVE_FACADE_URL` is a startup error, never a failure of
//! the first message: `create_message` validates attachments before it writes
//! the message row.
//!
//! The HTTP status mapping this module feeds is unchanged from the original
//! facade adapter: `200` success, `404`/`403`/other `4xx` a validation error,
//! `5xx` an unavailable error.

use sdkwork_communication_mail_service::{
    CreateMailAttachmentInput, MailDriveAttachmentError, MailDriveAttachmentFuture,
    MailDriveAttachmentPort, validate_mail_attachment_fields,
};
use sdkwork_utils_rust::string::{is_blank, trim};

use crate::drive_attachment_port::MailDriveAttachmentBootstrapError;

/// Base URL of the Drive facade used by a split deployment.
pub const MAIL_DRIVE_FACADE_URL_ENV: &str = "SDKWORK_DRIVE_FACADE_URL";

const MAIL_DRIVE_AUTH_TOKEN_ENV: &str = "SDKWORK_AUTH_TOKEN";
const MAIL_DRIVE_ACCESS_TOKEN_ENV: &str = "SDKWORK_ACCESS_TOKEN";

/// Drive attachment validation over Drive's app-api.
#[derive(Clone)]
pub(crate) struct HttpMailDriveAttachmentPort {
    base_url: String,
    client: reqwest::Client,
    auth_token: Option<String>,
    access_token: Option<String>,
}

impl HttpMailDriveAttachmentPort {
    /// Build the split-deployment adapter from the documented environment
    /// contract.
    ///
    /// # Errors
    ///
    /// Fails when the drive endpoint is absent or blank. This is a startup
    /// failure on purpose (MODULE_SPEC.md §4.2.3): the in-process port is the
    /// default, so an HTTP deployment must be configured before it serves.
    pub(crate) fn from_env() -> Result<Self, MailDriveAttachmentBootstrapError> {
        let base_url = read_env(MAIL_DRIVE_FACADE_URL_ENV).ok_or(
            MailDriveAttachmentBootstrapError::MissingEndpoint {
                variable: MAIL_DRIVE_FACADE_URL_ENV,
            },
        )?;
        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_owned(),
            client: reqwest::Client::new(),
            auth_token: read_env(MAIL_DRIVE_AUTH_TOKEN_ENV),
            access_token: read_env(MAIL_DRIVE_ACCESS_TOKEN_ENV),
        })
    }

    async fn validate_node_exists(&self, node_id: &str) -> Result<(), MailDriveAttachmentError> {
        let url = format!("{}/app/v3/api/drive/nodes/{node_id}", self.base_url);
        let mut request = self.client.get(url);
        if let Some(token) = &self.auth_token {
            request = request.header("Authorization", format!("Bearer {token}"));
        }
        if let Some(token) = &self.access_token {
            request = request.header("Access-Token", token);
        }
        let response = request.send().await.map_err(|error| {
            MailDriveAttachmentError::Unavailable(format!(
                "drive facade node lookup failed: {error}"
            ))
        })?;
        match response.status().as_u16() {
            200 => Ok(()),
            404 => Err(MailDriveAttachmentError::Validation(format!(
                "drive node not found: {node_id}"
            ))),
            403 => Err(MailDriveAttachmentError::Validation(format!(
                "drive node access denied: {node_id}"
            ))),
            status if status >= 500 => Err(MailDriveAttachmentError::Unavailable(format!(
                "drive facade returned status {status} for node {node_id}"
            ))),
            status => Err(MailDriveAttachmentError::Validation(format!(
                "drive node validation failed with status {status}: {node_id}"
            ))),
        }
    }
}

impl MailDriveAttachmentPort for HttpMailDriveAttachmentPort {
    fn validate_attachments<'a>(
        &'a self,
        _tenant_id: &'a str,
        _owner_user_id: &'a str,
        attachments: &'a [CreateMailAttachmentInput],
    ) -> MailDriveAttachmentFuture<'a> {
        Box::pin(async move {
            for attachment in attachments {
                validate_mail_attachment_fields(attachment)?;
                self.validate_node_exists(&trim(&attachment.drive_node_id))
                    .await?;
            }
            Ok(())
        })
    }
}

fn read_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| trim(&value).to_owned())
        .filter(|value| !is_blank(Some(value.as_str())))
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_endpoint_variable_lives_only_in_the_opt_in_adapter() {
        // Regression guard for MODULE_SPEC.md §4.2.2/§4.2.3: the sibling
        // endpoint may be read only here, behind `SDKWORK_MAIL_DRIVE_MODE=http`,
        // and only after startup validation.
        let source = include_str!("drive_attachment_http_adapter.rs");
        let production = source
            .split("#[cfg(test)]")
            .next()
            .expect("the module has a production section");
        assert!(
            production.contains("MAIL_DRIVE_FACADE_URL_ENV"),
            "{production}"
        );
        assert!(
            production.contains("MailDriveAttachmentBootstrapError::MissingEndpoint"),
            "a missing endpoint must abort startup instead of the first request"
        );
    }

    #[test]
    fn the_adapter_keeps_the_facade_status_mapping() {
        let source = include_str!("drive_attachment_http_adapter.rs");
        assert!(source.contains("404 =>"), "{source}");
        assert!(source.contains("403 =>"), "{source}");
        assert!(source.contains("status >= 500"), "{source}");
    }
}
