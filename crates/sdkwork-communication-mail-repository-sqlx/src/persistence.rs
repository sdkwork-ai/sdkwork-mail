use chrono::NaiveDateTime;
use sdkwork_communication_mail_service::{
    ActiveVerificationChallenge, CreateMailAttachmentInput, CreateMailMessageRequest,
    CreateMailProviderAccountRequest, CreateMailProviderAccountResult,
    CreateMailProviderCredentialInput, CreateMailTemplateRequest, EnsureMailAccountRequest,
    GrantMailMarketingConsentRequest, IngestInboundMailMessageRequest, MailAccount,
    MailAccountStatus, MailAttachment, MailFolder, MailFolderKind, MailMarketingConsent,
    MailMarketingConsentStatus, MailMessage, MailMessageRecipient, MailPersistenceError,
    MailPersistenceFuture, MailPersistencePort, MailPersistenceResult, MailProviderAccount,
    MailProviderAccountStatus, MailProviderCredential, MailProviderCredentialStatus,
    MailRecipientKind, MailSmtpTransportBinding, MailSyncState, MailTemplate, MailTemplateCategory,
    MailTemplateStatus, MailThread, MailTransactionalDelivery, MailTransactionalDeliveryStatus,
    MailVerificationPurpose, UpdateMailMessageRequest, UpdateMailTemplateRequest,
    utc_now_rfc3339_millis,
};
use sdkwork_utils_rust::{is_blank, sha256_hash};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone)]
pub struct MailPostgresPersistencePort {
    pool: PgPool,
}

impl MailPostgresPersistencePort {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl MailPersistencePort for MailPostgresPersistencePort {
    fn list_accounts<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        owner_user_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, Vec<MailAccount>> {
        Box::pin(async move {
            let rows = sqlx::query_as::<_, AccountRow>(
                r#"
                SELECT uuid, tenant_id, organization_id, owner_user_id, email_address, display_name,
                       provider_kind, status, sync_enabled, last_synced_at
                FROM mail_account
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND owner_user_id = $3::bigint
                  AND deleted_at IS NULL
                ORDER BY updated_at DESC
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(parse_id(owner_user_id))
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(rows.into_iter().map(AccountRow::into_account).collect())
        })
    }

    fn list_folders<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        account_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, Vec<MailFolder>> {
        Box::pin(async move {
            let rows = sqlx::query_as::<_, FolderRow>(
                r#"
                SELECT uuid, account_id, folder_kind, name, parent_folder_id, unread_count, total_count, sort_order
                FROM mail_folder
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND account_id = $3
                  AND deleted_at IS NULL
                ORDER BY sort_order ASC, name ASC
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(account_id)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(rows.into_iter().map(FolderRow::into_folder).collect())
        })
    }

    fn list_threads<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        folder_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, Vec<MailThread>> {
        Box::pin(async move {
            let rows = sqlx::query_as::<_, ThreadRow>(
                r#"
                SELECT uuid, account_id, folder_id, subject, snippet, participant_summary,
                       message_count, unread_count, is_starred, last_message_at
                FROM mail_thread
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND folder_id = $3
                  AND deleted_at IS NULL
                ORDER BY last_message_at DESC NULLS LAST
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(folder_id)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(rows.into_iter().map(ThreadRow::into_thread).collect())
        })
    }

    fn list_messages<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        folder_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, Vec<MailMessage>> {
        Box::pin(async move {
            let rows = sqlx::query_as::<_, MessageRow>(
                r#"
                SELECT uuid, account_id, folder_id, thread_id, from_name, from_email, subject, snippet,
                       body_text, body_html, is_read, is_starred, is_draft, has_attachments,
                       sent_at, received_at, size_bytes, metadata
                FROM mail_message
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND folder_id = $3
                  AND deleted_at IS NULL
                ORDER BY received_at DESC NULLS LAST, created_at DESC
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(folder_id)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            let mut messages = Vec::with_capacity(rows.len());
            for row in rows {
                messages.push(row.into_message(Vec::new(), Vec::new()));
            }
            Ok(messages)
        })
    }

    fn retrieve_message<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        message_id: &'a str,
    ) -> MailPersistenceFuture<'a, MailMessage> {
        Box::pin(async move {
            let row = sqlx::query_as::<_, MessageRow>(
                r#"
                SELECT uuid, account_id, folder_id, thread_id, from_name, from_email, subject, snippet,
                       body_text, body_html, is_read, is_starred, is_draft, has_attachments,
                       sent_at, received_at, size_bytes, metadata
                FROM mail_message
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND uuid = $3
                  AND deleted_at IS NULL
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(message_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?
            .ok_or_else(|| MailPersistenceError::NotFound(format!("message not found: {message_id}")))?;

            let recipients = load_recipients(&self.pool, message_id).await?;
            let attachments =
                load_attachments(&self.pool, tenant_id, organization_id, message_id).await?;
            Ok(row.into_message(recipients, attachments))
        })
    }

    fn create_message<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        owner_user_id: &'a str,
        request: CreateMailMessageRequest,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailMessage> {
        Box::pin(async move {
            if is_blank(Some(request.subject.as_str())) {
                return Err(MailPersistenceError::Conflict(
                    "subject is required".to_owned(),
                ));
            }

            let message_id = Uuid::new_v4().to_string();
            let thread_id = request
                .thread_id
                .clone()
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let folder_id = request
                .folder_id
                .clone()
                .unwrap_or_else(|| format!("folder-drafts-{owner_user_id}"));
            let now = utc_now_rfc3339_millis();
            let snippet = request
                .body_text
                .as_deref()
                .or(request.body_html.as_deref())
                .map(|body| body.chars().take(200).collect::<String>());
            let size_bytes = request
                .body_text
                .as_deref()
                .map(|value| value.len() as u64)
                .unwrap_or(0);

            let from_email = request
                .from_email
                .clone()
                .unwrap_or_else(|| owner_user_id.to_owned());
            let from_name = request.from_name.clone();

            let has_attachments = !request.attachments.is_empty();

            sqlx::query(
                r#"
                INSERT INTO mail_message (
                    id, uuid, tenant_id, organization_id, account_id, folder_id, thread_id,
                    from_name, from_email, subject, snippet, body_text, body_html, is_read, is_starred,
                    is_draft, has_attachments, sent_at, received_at, size_bytes, metadata,
                    created_at, updated_at, version
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, $11, $12, $13, FALSE, FALSE,
                    $14, $15, $16::timestamp, $17::timestamp, $18, $19,
                    NOW(), NOW(), 0
                )
                "#,
            )
            .bind(next_id())
            .bind(&message_id)
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(&request.account_id)
            .bind(&folder_id)
            .bind(&thread_id)
            .bind(&from_name)
            .bind(&from_email)
            .bind(&request.subject)
            .bind(&snippet)
            .bind(&request.body_text)
            .bind(&request.body_html)
            .bind(request.is_draft)
            .bind(has_attachments)
            .bind(if request.is_draft {
                None::<String>
            } else {
                Some(now.clone())
            })
            .bind(Some(now.clone()))
            .bind(size_bytes as i64)
            .bind(&request.metadata)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            for recipient in request.to.into_iter().chain(request.cc).chain(request.bcc) {
                insert_recipient(
                    &self.pool,
                    tenant_id,
                    organization_id,
                    &message_id,
                    recipient,
                )
                .await?;
            }

            for attachment in request.attachments {
                insert_attachment(
                    &self.pool,
                    tenant_id,
                    organization_id,
                    &message_id,
                    attachment,
                )
                .await?;
            }

            MailPostgresPersistencePort::new(self.pool.clone())
                .retrieve_message(tenant_id, organization_id, &message_id)
                .await
        })
    }

    fn update_message<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        message_id: &'a str,
        request: UpdateMailMessageRequest,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailMessage> {
        Box::pin(async move {
            let existing = MailPostgresPersistencePort::new(self.pool.clone())
                .retrieve_message(tenant_id, organization_id, message_id)
                .await?;

            let is_read = request.is_read.unwrap_or(existing.is_read);
            let is_starred = request.is_starred.unwrap_or(existing.is_starred);
            let is_draft = request.is_draft.unwrap_or(existing.is_draft);
            let folder_id = request.folder_id.unwrap_or(existing.folder_id);

            sqlx::query(
                r#"
                UPDATE mail_message
                SET is_read = $4, is_starred = $5, is_draft = $6, folder_id = $7, updated_at = NOW(), version = version + 1
                WHERE tenant_id = $1::bigint AND organization_id = $2::bigint AND uuid = $3 AND deleted_at IS NULL
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(message_id)
            .bind(is_read)
            .bind(is_starred)
            .bind(is_draft)
            .bind(&folder_id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            MailPostgresPersistencePort::new(self.pool.clone())
                .retrieve_message(tenant_id, organization_id, message_id)
                .await
        })
    }

    fn delete_message<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        message_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, ()> {
        Box::pin(async move {
            let result = sqlx::query(
                r#"
                UPDATE mail_message
                SET deleted_at = NOW(), updated_at = NOW(), version = version + 1
                WHERE tenant_id = $1::bigint AND organization_id = $2::bigint AND uuid = $3 AND deleted_at IS NULL
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(message_id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            if result.rows_affected() == 0 {
                return Err(MailPersistenceError::NotFound(format!(
                    "message not found: {message_id}"
                )));
            }
            Ok(())
        })
    }

    fn list_provider_accounts<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, Vec<MailProviderAccount>>
    {
        Box::pin(async move {
            let rows = sqlx::query_as::<_, ProviderAccountRow>(
                r#"
                SELECT uuid, tenant_id, organization_id, provider_kind, name, host, port, use_tls, status
                FROM mail_provider_account
                WHERE tenant_id = $1::bigint AND organization_id = $2::bigint AND deleted_at IS NULL
                ORDER BY updated_at DESC
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(rows
                .into_iter()
                .map(ProviderAccountRow::into_provider_account)
                .collect())
        })
    }

    fn retrieve_provider_account<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        account_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailProviderAccount> {
        Box::pin(async move {
            load_provider_account(&self.pool, tenant_id, organization_id, account_id).await
        })
    }

    fn create_provider_account<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        request: CreateMailProviderAccountRequest,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<
        'a,
        CreateMailProviderAccountResult,
    > {
        Box::pin(async move {
            let provider_kind =
                normalize_provider_kind(&request.provider_kind).ok_or_else(|| {
                    MailPersistenceError::Conflict("providerKind must be smtp or imap".to_owned())
                })?;
            if request.name.trim().is_empty() || request.host.trim().is_empty() {
                return Err(MailPersistenceError::Conflict(
                    "name and host are required".to_owned(),
                ));
            }
            if request.port == 0 {
                return Err(MailPersistenceError::Conflict(
                    "port must be greater than zero".to_owned(),
                ));
            }

            let now = timestamp_now();
            let account_uuid = Uuid::new_v4().to_string();
            sqlx::query(
                r#"
                INSERT INTO mail_provider_account (
                    id, uuid, tenant_id, organization_id, provider_kind, name, host, port, use_tls,
                    status, created_at, updated_at, version
                ) VALUES (
                    $1, $2, $3::bigint, $4::bigint, $5, $6, $7, $8, $9,
                    1, $10, $10, 0
                )
                "#,
            )
            .bind(next_id())
            .bind(&account_uuid)
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(provider_kind)
            .bind(request.name.trim())
            .bind(request.host.trim())
            .bind(i32::from(request.port))
            .bind(request.use_tls)
            .bind(now)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            let account =
                load_provider_account(&self.pool, tenant_id, organization_id, &account_uuid)
                    .await?;
            let credential = if let Some(input) = request.credential {
                Some(
                    self.create_provider_credential(
                        tenant_id,
                        organization_id,
                        &account_uuid,
                        input,
                    )
                    .await?,
                )
            } else {
                None
            };

            Ok(CreateMailProviderAccountResult {
                account,
                credential,
            })
        })
    }

    fn create_provider_credential<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        provider_account_id: &'a str,
        request: CreateMailProviderCredentialInput,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailProviderCredential> {
        Box::pin(async move {
            validate_secret_ref(&request.secret_ref)?;
            if request.username.trim().is_empty() {
                return Err(MailPersistenceError::Conflict(
                    "username is required".to_owned(),
                ));
            }

            let _account =
                load_provider_account(&self.pool, tenant_id, organization_id, provider_account_id)
                    .await?;

            let now = timestamp_now();
            let credential_uuid = Uuid::new_v4().to_string();
            sqlx::query(
                r#"
                INSERT INTO mail_provider_credential (
                    id, uuid, tenant_id, organization_id, provider_account_id, username, secret_ref,
                    status, created_at, updated_at, version
                ) VALUES (
                    $1, $2, $3::bigint, $4::bigint, $5, $6, $7,
                    1, $8, $8, 0
                )
                "#,
            )
            .bind(next_id())
            .bind(&credential_uuid)
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(provider_account_id)
            .bind(request.username.trim())
            .bind(request.secret_ref.trim())
            .bind(now)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            load_provider_credential(&self.pool, tenant_id, organization_id, &credential_uuid).await
        })
    }

    fn retrieve_active_provider_credential<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        provider_account_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailProviderCredential> {
        Box::pin(async move {
            let row = sqlx::query_as::<_, ProviderCredentialRow>(
                r#"
                SELECT uuid, tenant_id, organization_id, provider_account_id, username, secret_ref, status
                FROM mail_provider_credential
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND provider_account_id = $3
                  AND status = 1
                  AND deleted_at IS NULL
                ORDER BY updated_at DESC
                LIMIT 1
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(provider_account_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?
            .ok_or_else(|| {
                MailPersistenceError::NotFound(format!(
                    "provider credential not found: {provider_account_id}"
                ))
            })?;

            Ok(row.into_credential())
        })
    }

    fn resolve_active_smtp_transport_binding<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<
        'a,
        Option<MailSmtpTransportBinding>,
    > {
        Box::pin(async move {
            let account = sqlx::query_as::<_, ProviderAccountRow>(
                r#"
                SELECT uuid, tenant_id, organization_id, provider_kind, name, host, port, use_tls, status
                FROM mail_provider_account
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND provider_kind = 'smtp'
                  AND status = 1
                  AND deleted_at IS NULL
                ORDER BY updated_at DESC
                LIMIT 1
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            let Some(account) = account else {
                return Ok(None);
            };

            let credential = sqlx::query_as::<_, ProviderCredentialRow>(
                r#"
                SELECT uuid, tenant_id, organization_id, provider_account_id, username, secret_ref, status
                FROM mail_provider_credential
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND provider_account_id = $3
                  AND status = 1
                  AND deleted_at IS NULL
                ORDER BY updated_at DESC
                LIMIT 1
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(&account.uuid)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            let Some(credential) = credential else {
                return Ok(None);
            };

            Ok(Some(MailSmtpTransportBinding {
                provider_account_id: account.uuid.clone(),
                host: account.host,
                port: account.port.max(0) as u16,
                use_tls: account.use_tls,
                username: credential.username.clone(),
                secret_ref: credential.secret_ref,
                from_email: credential.username,
            }))
        })
    }

    fn list_templates<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        category: Option<MailTemplateCategory>,
        purpose: Option<&'a str>,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, Vec<MailTemplate>> {
        Box::pin(async move {
            let category_filter = category.map(template_category_to_db);
            let rows = sqlx::query_as::<_, TemplateRow>(
                r#"
                SELECT uuid, tenant_id, organization_id, template_key, name, category, purpose, locale,
                       subject_template, body_html_template, body_text_template, variable_schema, status, metadata
                FROM mail_template
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND deleted_at IS NULL
                  AND ($3::varchar IS NULL OR category = $3)
                  AND ($4::varchar IS NULL OR purpose = $4)
                ORDER BY updated_at DESC
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(category_filter)
            .bind(purpose)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(rows.into_iter().map(TemplateRow::into_template).collect())
        })
    }

    fn retrieve_template<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        template_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailTemplate> {
        Box::pin(async move {
            let row = sqlx::query_as::<_, TemplateRow>(
                r#"
                SELECT uuid, tenant_id, organization_id, template_key, name, category, purpose, locale,
                       subject_template, body_html_template, body_text_template, variable_schema, status, metadata
                FROM mail_template
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND uuid = $3
                  AND deleted_at IS NULL
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(template_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?
            .ok_or_else(|| {
                MailPersistenceError::NotFound(format!("template not found: {template_id}"))
            })?;

            Ok(row.into_template())
        })
    }

    fn retrieve_template_by_key<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        template_key: &'a str,
        locale: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailTemplate> {
        Box::pin(async move {
            let row = sqlx::query_as::<_, TemplateRow>(
                r#"
                SELECT uuid, tenant_id, organization_id, template_key, name, category, purpose, locale,
                       subject_template, body_html_template, body_text_template, variable_schema, status, metadata
                FROM mail_template
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND template_key = $3
                  AND locale = $4
                  AND deleted_at IS NULL
                  AND status = 1
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(template_key)
            .bind(locale)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?
            .ok_or_else(|| {
                MailPersistenceError::NotFound(format!(
                    "template not found: {template_key}:{locale}"
                ))
            })?;

            Ok(row.into_template())
        })
    }

    fn create_template<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        request: CreateMailTemplateRequest,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailTemplate> {
        Box::pin(async move {
            let now = timestamp_now();
            let template_uuid = Uuid::new_v4().to_string();
            let locale = request.locale.clone().unwrap_or_else(|| "zh-CN".to_owned());
            let variable_schema = request.variable_schema.clone().unwrap_or_else(|| json!({}));
            let metadata = request.metadata.clone().unwrap_or_else(|| json!({}));

            sqlx::query(
                r#"
                INSERT INTO mail_template (
                    id, uuid, tenant_id, organization_id, template_key, name, category, purpose, locale,
                    subject_template, body_html_template, body_text_template, variable_schema, status,
                    metadata, created_at, updated_at, version
                ) VALUES (
                    $1, $2, $3::bigint, $4::bigint, $5, $6, $7, $8, $9,
                    $10, $11, $12, $13, 1,
                    $14, $15, $15, 0
                )
                "#,
            )
            .bind(next_id())
            .bind(&template_uuid)
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(&request.template_key)
            .bind(&request.name)
            .bind(template_category_to_db(request.category))
            .bind(&request.purpose)
            .bind(&locale)
            .bind(&request.subject_template)
            .bind(&request.body_html_template)
            .bind(&request.body_text_template)
            .bind(&variable_schema)
            .bind(&metadata)
            .bind(now)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(MailTemplate {
                id: template_uuid,
                tenant_id: tenant_id.to_owned(),
                organization_id: organization_id.to_owned(),
                template_key: request.template_key,
                name: request.name,
                category: request.category,
                purpose: request.purpose,
                locale,
                subject_template: request.subject_template,
                body_html_template: request.body_html_template,
                body_text_template: request.body_text_template,
                variable_schema,
                status: MailTemplateStatus::Active,
                metadata,
            })
        })
    }

    fn update_template<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        template_id: &'a str,
        request: UpdateMailTemplateRequest,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailTemplate> {
        Box::pin(async move {
            let existing = self
                .retrieve_template(tenant_id, organization_id, template_id)
                .await?;

            let now = timestamp_now();
            let name = request.name.unwrap_or(existing.name);
            let category = request.category.unwrap_or(existing.category);
            let purpose = request.purpose.unwrap_or(existing.purpose);
            let subject_template = request
                .subject_template
                .unwrap_or(existing.subject_template);
            let body_html_template = request.body_html_template.or(existing.body_html_template);
            let body_text_template = request.body_text_template.or(existing.body_text_template);
            let variable_schema = request.variable_schema.unwrap_or(existing.variable_schema);
            let status = request.status.unwrap_or(existing.status);
            let metadata = request.metadata.unwrap_or(existing.metadata);

            sqlx::query(
                r#"
                UPDATE mail_template
                SET name = $4,
                    category = $5,
                    purpose = $6,
                    subject_template = $7,
                    body_html_template = $8,
                    body_text_template = $9,
                    variable_schema = $10,
                    status = $11,
                    metadata = $12,
                    updated_at = $13,
                    version = version + 1
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND uuid = $3
                  AND deleted_at IS NULL
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(template_id)
            .bind(&name)
            .bind(template_category_to_db(category))
            .bind(&purpose)
            .bind(&subject_template)
            .bind(&body_html_template)
            .bind(&body_text_template)
            .bind(&variable_schema)
            .bind(template_status_to_db(status))
            .bind(&metadata)
            .bind(now)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(MailTemplate {
                id: template_id.to_owned(),
                tenant_id: tenant_id.to_owned(),
                organization_id: organization_id.to_owned(),
                template_key: existing.template_key,
                name,
                category,
                purpose,
                locale: existing.locale,
                subject_template,
                body_html_template,
                body_text_template,
                variable_schema,
                status,
                metadata,
            })
        })
    }

    fn delete_template<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        template_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, ()> {
        Box::pin(async move {
            let now = timestamp_now();
            let result = sqlx::query(
                r#"
                UPDATE mail_template
                SET deleted_at = $4, updated_at = $4, version = version + 1
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND uuid = $3
                  AND deleted_at IS NULL
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(template_id)
            .bind(now)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            if result.rows_affected() == 0 {
                return Err(MailPersistenceError::NotFound(format!(
                    "template not found: {template_id}"
                )));
            }
            Ok(())
        })
    }

    fn create_verification_challenge<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        challenge_id: &'a str,
        recipient_email: &'a str,
        purpose: MailVerificationPurpose,
        code_hash: &'a str,
        expires_at: &'a str,
        delivery_id: Option<&'a str>,
        metadata: serde_json::Value,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, String> {
        Box::pin(async move {
            let now = timestamp_now();
            let expires = parse_timestamp(expires_at)?;

            sqlx::query(
                r#"
                INSERT INTO mail_verification_challenge (
                    id, uuid, tenant_id, organization_id, recipient_email, purpose, code_hash,
                    expires_at, attempt_count, max_attempts, delivery_id, metadata,
                    created_at, updated_at, version
                ) VALUES (
                    $1, $2, $3::bigint, $4::bigint, $5, $6, $7,
                    $8, 0, 5, $9, $10,
                    $11, $11, 0
                )
                "#,
            )
            .bind(next_id())
            .bind(challenge_id)
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(recipient_email)
            .bind(purpose.as_str())
            .bind(code_hash)
            .bind(expires)
            .bind(delivery_id)
            .bind(metadata)
            .bind(now)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(challenge_id.to_owned())
        })
    }

    fn find_active_verification_challenge<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        recipient_email: &'a str,
        purpose: MailVerificationPurpose,
        challenge_id: Option<&'a str>,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, ActiveVerificationChallenge>
    {
        Box::pin(async move {
            let row = if let Some(challenge_id) = challenge_id {
                sqlx::query_as::<_, ChallengeRow>(
                    r#"
                    SELECT uuid, recipient_email, purpose, code_hash, expires_at, consumed_at,
                           attempt_count, max_attempts, delivery_id
                    FROM mail_verification_challenge
                    WHERE tenant_id = $1::bigint
                      AND organization_id = $2::bigint
                      AND uuid = $3
                      AND recipient_email = $4
                      AND purpose = $5
                      AND consumed_at IS NULL
                    "#,
                )
                .bind(parse_id(tenant_id))
                .bind(parse_id(organization_id))
                .bind(challenge_id)
                .bind(recipient_email)
                .bind(purpose.as_str())
                .fetch_optional(&self.pool)
                .await
                .map_err(map_sqlx_error)?
            } else {
                sqlx::query_as::<_, ChallengeRow>(
                    r#"
                    SELECT uuid, recipient_email, purpose, code_hash, expires_at, consumed_at,
                           attempt_count, max_attempts, delivery_id
                    FROM mail_verification_challenge
                    WHERE tenant_id = $1::bigint
                      AND organization_id = $2::bigint
                      AND recipient_email = $3
                      AND purpose = $4
                      AND consumed_at IS NULL
                    ORDER BY created_at DESC
                    LIMIT 1
                    "#,
                )
                .bind(parse_id(tenant_id))
                .bind(parse_id(organization_id))
                .bind(recipient_email)
                .bind(purpose.as_str())
                .fetch_optional(&self.pool)
                .await
                .map_err(map_sqlx_error)?
            };

            let row = row.ok_or_else(|| {
                MailPersistenceError::NotFound("verification challenge not found".to_owned())
            })?;

            if row.consumed_at.is_some() {
                return Err(MailPersistenceError::NotFound(
                    "verification challenge already consumed".to_owned(),
                ));
            }
            if row.expires_at <= timestamp_now() {
                return Err(MailPersistenceError::Conflict(
                    "verification challenge expired".to_owned(),
                ));
            }

            Ok(row.into_active())
        })
    }

    fn increment_verification_attempt<'a>(
        &'a self,
        challenge_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, ()> {
        Box::pin(async move {
            sqlx::query(
                r#"
                UPDATE mail_verification_challenge
                SET attempt_count = attempt_count + 1,
                    updated_at = $2,
                    version = version + 1
                WHERE uuid = $1
                "#,
            )
            .bind(challenge_id)
            .bind(timestamp_now())
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
            Ok(())
        })
    }

    fn consume_verification_challenge<'a>(
        &'a self,
        challenge_id: &'a str,
        consumed_at: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, ()> {
        Box::pin(async move {
            let consumed = parse_timestamp(consumed_at)?;
            sqlx::query(
                r#"
                UPDATE mail_verification_challenge
                SET consumed_at = $2,
                    updated_at = $2,
                    version = version + 1
                WHERE uuid = $1
                  AND consumed_at IS NULL
                "#,
            )
            .bind(challenge_id)
            .bind(consumed)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
            Ok(())
        })
    }

    fn create_transactional_delivery<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        template_id: Option<&'a str>,
        template_key: &'a str,
        business_kind: &'a str,
        recipient_email: &'a str,
        from_email: Option<&'a str>,
        subject: &'a str,
        correlation_id: Option<&'a str>,
        metadata: serde_json::Value,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailTransactionalDelivery>
    {
        Box::pin(async move {
            let now = timestamp_now();
            let delivery_uuid = Uuid::new_v4().to_string();

            sqlx::query(
                r#"
                INSERT INTO mail_transactional_delivery (
                    id, uuid, tenant_id, organization_id, template_id, template_key, business_kind,
                    recipient_email, from_email, subject, status, correlation_id, metadata,
                    created_at, updated_at, version
                ) VALUES (
                    $1, $2, $3::bigint, $4::bigint, $5, $6, $7,
                    $8, $9, $10, 0, $11, $12,
                    $13, $13, 0
                )
                "#,
            )
            .bind(next_id())
            .bind(&delivery_uuid)
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(template_id)
            .bind(template_key)
            .bind(business_kind)
            .bind(recipient_email)
            .bind(from_email)
            .bind(subject)
            .bind(correlation_id)
            .bind(&metadata)
            .bind(now)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(MailTransactionalDelivery {
                id: delivery_uuid,
                tenant_id: tenant_id.to_owned(),
                organization_id: organization_id.to_owned(),
                template_id: template_id.map(str::to_owned),
                template_key: template_key.to_owned(),
                business_kind: business_kind.to_owned(),
                recipient_email: recipient_email.to_owned(),
                from_email: from_email.map(str::to_owned),
                subject: subject.to_owned(),
                status: MailTransactionalDeliveryStatus::Queued,
                provider_account_id: None,
                correlation_id: correlation_id.map(str::to_owned),
                last_error: None,
                sent_at: None,
                metadata,
                created_at: utc_now_rfc3339_millis(),
            })
        })
    }

    fn mark_transactional_delivery_sent<'a>(
        &'a self,
        delivery_id: &'a str,
        sent_at: &'a str,
        provider_account_id: Option<&'a str>,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailTransactionalDelivery>
    {
        Box::pin(async move {
            let sent = parse_timestamp(sent_at)?;
            let now = timestamp_now();
            sqlx::query(
                r#"
                UPDATE mail_transactional_delivery
                SET status = 1,
                    sent_at = $2,
                    provider_account_id = $3,
                    updated_at = $4,
                    version = version + 1
                WHERE uuid = $1
                "#,
            )
            .bind(delivery_id)
            .bind(sent)
            .bind(provider_account_id)
            .bind(now)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            load_delivery(&self.pool, delivery_id).await
        })
    }

    fn mark_transactional_delivery_failed<'a>(
        &'a self,
        delivery_id: &'a str,
        last_error: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailTransactionalDelivery>
    {
        Box::pin(async move {
            let now = timestamp_now();
            sqlx::query(
                r#"
                UPDATE mail_transactional_delivery
                SET status = 2,
                    last_error = $2,
                    updated_at = $3,
                    version = version + 1
                WHERE uuid = $1
                "#,
            )
            .bind(delivery_id)
            .bind(last_error)
            .bind(now)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            load_delivery(&self.pool, delivery_id).await
        })
    }

    fn list_transactional_deliveries<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        business_kind: Option<&'a str>,
        recipient_email: Option<&'a str>,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, Vec<MailTransactionalDelivery>>
    {
        Box::pin(async move {
            let rows = sqlx::query_as::<_, DeliveryRow>(
                r#"
                SELECT uuid, tenant_id, organization_id, template_id, template_key, business_kind,
                       recipient_email, from_email, subject, status, provider_account_id,
                       correlation_id, last_error, sent_at, metadata, created_at
                FROM mail_transactional_delivery
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND ($3::varchar IS NULL OR business_kind = $3)
                  AND ($4::varchar IS NULL OR recipient_email = $4)
                ORDER BY created_at DESC
                LIMIT 200
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(business_kind)
            .bind(recipient_email)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(rows.into_iter().map(DeliveryRow::into_delivery).collect())
        })
    }

    fn has_active_marketing_consent<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        recipient_email: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, bool> {
        Box::pin(async move {
            let row = sqlx::query_scalar::<_, i64>(
                r#"
                SELECT COUNT(*)::bigint
                FROM mail_marketing_consent
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND recipient_email = $3
                  AND status = 1
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(recipient_email)
            .fetch_one(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(row > 0)
        })
    }

    fn list_marketing_consents<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        recipient_email: Option<&'a str>,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, Vec<MailMarketingConsent>>
    {
        Box::pin(async move {
            let rows = sqlx::query_as::<_, MarketingConsentRow>(
                r#"
                SELECT uuid, tenant_id, organization_id, recipient_email, status, consent_source,
                       granted_at, revoked_at, metadata
                FROM mail_marketing_consent
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND ($3::varchar IS NULL OR recipient_email = $3)
                ORDER BY updated_at DESC
                LIMIT 200
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(recipient_email)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(rows
                .into_iter()
                .map(MarketingConsentRow::into_consent)
                .collect())
        })
    }

    fn grant_marketing_consent<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        request: GrantMailMarketingConsentRequest,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailMarketingConsent> {
        Box::pin(async move {
            let recipient_email = request.recipient_email.trim().to_ascii_lowercase();
            if recipient_email.is_empty() || !recipient_email.contains('@') {
                return Err(MailPersistenceError::Conflict(
                    "recipientEmail is invalid".to_owned(),
                ));
            }

            let now = timestamp_now();
            let consent_uuid = Uuid::new_v4().to_string();
            let consent_source = request
                .consent_source
                .clone()
                .unwrap_or_else(|| "admin".to_owned());
            let metadata = request.metadata.clone().unwrap_or_else(|| json!({}));

            sqlx::query(
                r#"
                INSERT INTO mail_marketing_consent (
                    id, uuid, tenant_id, organization_id, recipient_email, status, consent_source,
                    granted_at, metadata, created_at, updated_at, version
                ) VALUES (
                    $1, $2, $3::bigint, $4::bigint, $5, 1, $6,
                    $7, $8, $7, $7, 0
                )
                ON CONFLICT (tenant_id, organization_id, recipient_email)
                DO UPDATE SET
                    status = 1,
                    consent_source = EXCLUDED.consent_source,
                    granted_at = EXCLUDED.granted_at,
                    revoked_at = NULL,
                    metadata = EXCLUDED.metadata,
                    updated_at = EXCLUDED.updated_at,
                    version = mail_marketing_consent.version + 1
                "#,
            )
            .bind(next_id())
            .bind(&consent_uuid)
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(&recipient_email)
            .bind(&consent_source)
            .bind(now)
            .bind(&metadata)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            load_marketing_consent_by_email(
                &self.pool,
                tenant_id,
                organization_id,
                &recipient_email,
            )
            .await
        })
    }

    fn revoke_marketing_consent<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        consent_id: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailMarketingConsent> {
        Box::pin(async move {
            let now = timestamp_now();
            let updated = sqlx::query(
                r#"
                UPDATE mail_marketing_consent
                SET status = 0,
                    revoked_at = $4,
                    updated_at = $4,
                    version = version + 1
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND uuid = $3
                  AND status = 1
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(consent_id)
            .bind(now)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            if updated.rows_affected() == 0 {
                return Err(MailPersistenceError::NotFound(format!(
                    "marketing consent not found: {consent_id}"
                )));
            }

            load_marketing_consent(&self.pool, tenant_id, organization_id, consent_id).await
        })
    }

    fn ensure_mail_account<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        request: EnsureMailAccountRequest,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailAccount> {
        Box::pin(async move {
            let account_id = Uuid::new_v4().to_string();
            let metadata = json!({
                "providerAccountId": request.provider_account_id,
            });
            let row = sqlx::query_as::<_, AccountRow>(
                r#"
                INSERT INTO mail_account (
                    id, uuid, tenant_id, organization_id, owner_user_id, email_address,
                    display_name, provider_kind, status, sync_enabled, metadata,
                    created_at, updated_at, version
                ) VALUES (
                    $1, $2, $3::bigint, $4::bigint, $5::bigint, $6,
                    $7, $8, 1, TRUE, $9,
                    NOW(), NOW(), 0
                )
                ON CONFLICT (tenant_id, organization_id, email_address)
                DO UPDATE SET
                    provider_kind = EXCLUDED.provider_kind,
                    metadata = mail_account.metadata || EXCLUDED.metadata,
                    updated_at = NOW(),
                    version = mail_account.version + 1
                RETURNING uuid, tenant_id, organization_id, owner_user_id, email_address, display_name,
                          provider_kind, status, sync_enabled, last_synced_at
                "#,
            )
            .bind(next_id())
            .bind(&account_id)
            .bind(tenant_id)
            .bind(organization_id)
            .bind(&request.owner_user_id)
            .bind(&request.email_address)
            .bind(&request.display_name)
            .bind(&request.provider_kind)
            .bind(&metadata)
            .fetch_one(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(row.into_account())
        })
    }

    fn ensure_system_folder<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        account_id: &'a str,
        folder_kind: MailFolderKind,
        name: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailFolder> {
        Box::pin(async move {
            let folder_id = Uuid::new_v4().to_string();
            let kind_code = folder_kind_code(folder_kind);
            let row = sqlx::query_as::<_, FolderRow>(
                r#"
                INSERT INTO mail_folder (
                    id, uuid, tenant_id, organization_id, account_id, folder_kind, name,
                    unread_count, total_count, sort_order, created_at, updated_at, version
                ) VALUES (
                    $1, $2, $3::bigint, $4::bigint, $5, $6, $7,
                    0, 0, $8, NOW(), NOW(), 0
                )
                ON CONFLICT (account_id, folder_kind, name)
                DO UPDATE SET updated_at = NOW(), version = mail_folder.version + 1
                RETURNING uuid, account_id, folder_kind, name, parent_folder_id, unread_count, total_count, sort_order
                "#,
            )
            .bind(next_id())
            .bind(&folder_id)
            .bind(tenant_id)
            .bind(organization_id)
            .bind(account_id)
            .bind(kind_code)
            .bind(name)
            .bind(folder_sort_order(folder_kind))
            .fetch_one(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(row.into_folder())
        })
    }

    fn retrieve_sync_state<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        account_id: &'a str,
        folder_id: &'a str,
        provider_kind: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, Option<MailSyncState>> {
        Box::pin(async move {
            let row = sqlx::query_as::<_, SyncStateRow>(
                r#"
                SELECT uuid, account_id, folder_id, provider_kind, cursor_token, last_synced_at, last_error
                FROM mail_sync_state
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND account_id = $3
                  AND folder_id = $4
                  AND provider_kind = $5
                  AND status = 1
                LIMIT 1
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(account_id)
            .bind(folder_id)
            .bind(provider_kind)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(row.map(SyncStateRow::into_sync_state))
        })
    }

    fn upsert_sync_state<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        account_id: &'a str,
        folder_id: &'a str,
        provider_kind: &'a str,
        cursor_token: Option<&'a str>,
        last_error: Option<&'a str>,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, MailSyncState> {
        Box::pin(async move {
            let now = timestamp_now();
            let existing = sqlx::query_scalar::<_, String>(
                r#"
                SELECT uuid
                FROM mail_sync_state
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND account_id = $3
                  AND folder_id = $4
                  AND provider_kind = $5
                  AND status = 1
                LIMIT 1
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(account_id)
            .bind(folder_id)
            .bind(provider_kind)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            if let Some(sync_state_id) = existing {
                let updated = sqlx::query_as::<_, SyncStateRow>(
                    r#"
                    UPDATE mail_sync_state
                    SET cursor_token = COALESCE($2, cursor_token),
                        last_synced_at = $3,
                        last_error = $4,
                        updated_at = $3,
                        version = version + 1
                    WHERE uuid = $1
                    RETURNING uuid, account_id, folder_id, provider_kind, cursor_token, last_synced_at, last_error
                    "#,
                )
                .bind(&sync_state_id)
                .bind(cursor_token)
                .bind(now)
                .bind(last_error)
                .fetch_one(&self.pool)
                .await
                .map_err(map_sqlx_error)?;
                return Ok(updated.into_sync_state());
            }

            let sync_state_id = Uuid::new_v4().to_string();
            let inserted = sqlx::query_as::<_, SyncStateRow>(
                r#"
                INSERT INTO mail_sync_state (
                    id, uuid, tenant_id, organization_id, account_id, folder_id, provider_kind,
                    cursor_token, last_synced_at, last_error, status, created_at, updated_at, version
                ) VALUES (
                    $1, $2, $3::bigint, $4::bigint, $5, $6, $7,
                    $8, $9, $10, 1, $9, $9, 0
                )
                RETURNING uuid, account_id, folder_id, provider_kind, cursor_token, last_synced_at, last_error
                "#,
            )
            .bind(next_id())
            .bind(&sync_state_id)
            .bind(tenant_id)
            .bind(organization_id)
            .bind(account_id)
            .bind(folder_id)
            .bind(provider_kind)
            .bind(cursor_token)
            .bind(now)
            .bind(last_error)
            .fetch_one(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            Ok(inserted.into_sync_state())
        })
    }

    fn touch_mail_account_synced_at<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        account_id: &'a str,
        synced_at: &'a str,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, ()> {
        Box::pin(async move {
            sqlx::query(
                r#"
                UPDATE mail_account
                SET last_synced_at = $4::timestamp,
                    updated_at = NOW(),
                    version = version + 1
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND uuid = $3
                  AND deleted_at IS NULL
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(account_id)
            .bind(synced_at)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
            Ok(())
        })
    }

    fn ingest_inbound_message<'a>(
        &'a self,
        tenant_id: &'a str,
        organization_id: &'a str,
        request: IngestInboundMailMessageRequest,
    ) -> sdkwork_communication_mail_service::MailPersistenceFuture<'a, Option<MailMessage>> {
        Box::pin(async move {
            let uid_validity = request.imap_uid_validity.map(|value| value.to_string());
            let duplicate = sqlx::query_scalar::<_, i64>(
                r#"
                SELECT 1
                FROM mail_message
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND account_id = $3
                  AND deleted_at IS NULL
                  AND metadata->'imap'->>'uid' = $4
                  AND (
                    $5::text IS NULL
                    OR metadata->'imap'->>'uidValidity' = $5
                  )
                LIMIT 1
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(&request.account_id)
            .bind(request.imap_uid.to_string())
            .bind(uid_validity)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            if duplicate.is_some() {
                return Ok(None);
            }

            let thread_id = sqlx::query_scalar::<_, String>(
                r#"
                SELECT uuid
                FROM mail_thread
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND folder_id = $3
                  AND subject = $4
                  AND deleted_at IS NULL
                ORDER BY last_message_at DESC NULLS LAST
                LIMIT 1
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(&request.folder_id)
            .bind(&request.subject)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?
            .unwrap_or_else(|| Uuid::new_v4().to_string());

            let received_at = request
                .received_at
                .clone()
                .unwrap_or_else(utc_now_rfc3339_millis);
            let snippet = request.snippet.clone().or_else(|| {
                request
                    .body_text
                    .as_ref()
                    .map(|body| body.chars().take(200).collect())
            });
            let size_bytes = request
                .body_text
                .as_ref()
                .map(|value| value.len() as i64)
                .unwrap_or(0);
            let message_id = Uuid::new_v4().to_string();
            let participant_summary = Some(request.from_email.clone());

            let thread_exists = sqlx::query_scalar::<_, i64>(
                r#"
                SELECT 1 FROM mail_thread
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND uuid = $3
                  AND deleted_at IS NULL
                LIMIT 1
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(&thread_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            if thread_exists.is_none() {
                sqlx::query(
                    r#"
                    INSERT INTO mail_thread (
                        id, uuid, tenant_id, organization_id, account_id, folder_id, subject,
                        snippet, participant_summary, message_count, unread_count, is_starred,
                        last_message_at, created_at, updated_at, version
                    ) VALUES (
                        $1, $2, $3::bigint, $4::bigint, $5, $6, $7,
                        $8, $9, 1, 1, FALSE,
                        $10::timestamp, NOW(), NOW(), 0
                    )
                    "#,
                )
                .bind(next_id())
                .bind(&thread_id)
                .bind(tenant_id)
                .bind(organization_id)
                .bind(&request.account_id)
                .bind(&request.folder_id)
                .bind(&request.subject)
                .bind(&snippet)
                .bind(&participant_summary)
                .bind(&received_at)
                .execute(&self.pool)
                .await
                .map_err(map_sqlx_error)?;
            } else {
                sqlx::query(
                    r#"
                    UPDATE mail_thread
                    SET message_count = message_count + 1,
                        unread_count = unread_count + 1,
                        snippet = COALESCE($4, snippet),
                        participant_summary = COALESCE($5, participant_summary),
                        last_message_at = $6::timestamp,
                        updated_at = NOW(),
                        version = version + 1
                    WHERE tenant_id = $1::bigint
                      AND organization_id = $2::bigint
                      AND uuid = $3
                    "#,
                )
                .bind(parse_id(tenant_id))
                .bind(parse_id(organization_id))
                .bind(&thread_id)
                .bind(&snippet)
                .bind(&participant_summary)
                .bind(&received_at)
                .execute(&self.pool)
                .await
                .map_err(map_sqlx_error)?;
            }

            sqlx::query(
                r#"
                INSERT INTO mail_message (
                    id, uuid, tenant_id, organization_id, account_id, folder_id, thread_id,
                    from_name, from_email, subject, snippet, body_text, body_html, is_read, is_starred,
                    is_draft, has_attachments, sent_at, received_at, size_bytes, metadata,
                    created_at, updated_at, version
                ) VALUES (
                    $1, $2, $3::bigint, $4::bigint, $5, $6, $7,
                    $8, $9, $10, $11, $12, NULL, FALSE, FALSE,
                    FALSE, FALSE, NULL, $13::timestamp, $14, $15,
                    NOW(), NOW(), 0
                )
                "#,
            )
            .bind(next_id())
            .bind(&message_id)
            .bind(tenant_id)
            .bind(organization_id)
            .bind(&request.account_id)
            .bind(&request.folder_id)
            .bind(&thread_id)
            .bind(&request.from_name)
            .bind(&request.from_email)
            .bind(&request.subject)
            .bind(&snippet)
            .bind(&request.body_text)
            .bind(&received_at)
            .bind(size_bytes)
            .bind(&request.metadata)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            sqlx::query(
                r#"
                UPDATE mail_folder
                SET total_count = total_count + 1,
                    unread_count = unread_count + 1,
                    updated_at = NOW(),
                    version = version + 1
                WHERE tenant_id = $1::bigint
                  AND organization_id = $2::bigint
                  AND uuid = $3
                "#,
            )
            .bind(parse_id(tenant_id))
            .bind(parse_id(organization_id))
            .bind(&request.folder_id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

            let message = MailPostgresPersistencePort::new(self.pool.clone())
                .retrieve_message(tenant_id, organization_id, &message_id)
                .await?;
            Ok(Some(message))
        })
    }
}

fn map_sqlx_error(error: sqlx::Error) -> MailPersistenceError {
    MailPersistenceError::Unavailable(error.to_string())
}

fn parse_id(value: &str) -> i64 {
    if let Ok(parsed) = value.parse::<i64>() {
        return parsed;
    }
    let digest = sha256_hash(value.as_bytes());
    i64::from_be_bytes(digest.as_bytes()[..8].try_into().unwrap_or([0; 8]))
}

fn next_id() -> i64 {
    Uuid::new_v4().as_u128() as i64
}

async fn load_recipients(
    pool: &PgPool,
    message_id: &str,
) -> MailPersistenceResult<Vec<MailMessageRecipient>> {
    let rows = sqlx::query_as::<_, RecipientRow>(
        r#"
        SELECT recipient_kind, name, email_address
        FROM mail_message_recipient
        WHERE message_id = $1
        ORDER BY id ASC
        "#,
    )
    .bind(message_id)
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows.into_iter().map(RecipientRow::into_recipient).collect())
}

async fn load_attachments(
    pool: &PgPool,
    tenant_id: &str,
    organization_id: &str,
    message_id: &str,
) -> MailPersistenceResult<Vec<MailAttachment>> {
    let rows = sqlx::query_as::<_, AttachmentRow>(
        r#"
        SELECT uuid, message_id, file_name, content_type, size_bytes, drive_node_id, checksum_sha256
        FROM mail_attachment
        WHERE tenant_id = $1::bigint AND organization_id = $2::bigint AND message_id = $3 AND deleted_at IS NULL
        "#,
    )
    .bind(parse_id(tenant_id))
    .bind(parse_id(organization_id))
    .bind(message_id)
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(AttachmentRow::into_attachment)
        .collect())
}

async fn insert_attachment(
    pool: &PgPool,
    tenant_id: &str,
    organization_id: &str,
    message_id: &str,
    attachment: CreateMailAttachmentInput,
) -> MailPersistenceResult<()> {
    sqlx::query(
        r#"
        INSERT INTO mail_attachment (
            id, uuid, tenant_id, organization_id, message_id, file_name, content_type,
            size_bytes, drive_node_id, checksum_sha256, created_at, updated_at, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), 0)
        "#,
    )
    .bind(next_id())
    .bind(Uuid::new_v4().to_string())
    .bind(parse_id(tenant_id))
    .bind(parse_id(organization_id))
    .bind(message_id)
    .bind(attachment.file_name)
    .bind(attachment.content_type)
    .bind(attachment.size_bytes as i64)
    .bind(Some(attachment.drive_node_id))
    .bind(attachment.checksum_sha256)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;
    Ok(())
}

async fn insert_recipient(
    pool: &PgPool,
    tenant_id: &str,
    organization_id: &str,
    message_id: &str,
    recipient: MailMessageRecipient,
) -> MailPersistenceResult<()> {
    sqlx::query(
        r#"
        INSERT INTO mail_message_recipient (
            id, uuid, tenant_id, organization_id, message_id, recipient_kind, name, email_address, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        "#,
    )
    .bind(next_id())
    .bind(Uuid::new_v4().to_string())
    .bind(parse_id(tenant_id))
    .bind(parse_id(organization_id))
    .bind(message_id)
    .bind(recipient_kind_code(recipient.recipient_kind))
    .bind(recipient.name)
    .bind(recipient.email_address)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;
    Ok(())
}

fn recipient_kind_code(kind: MailRecipientKind) -> &'static str {
    match kind {
        MailRecipientKind::To => "to",
        MailRecipientKind::Cc => "cc",
        MailRecipientKind::Bcc => "bcc",
    }
}

#[derive(sqlx::FromRow)]
struct AccountRow {
    uuid: String,
    tenant_id: i64,
    organization_id: i64,
    owner_user_id: i64,
    email_address: String,
    display_name: Option<String>,
    provider_kind: String,
    status: i32,
    sync_enabled: bool,
    last_synced_at: Option<chrono::NaiveDateTime>,
}

impl AccountRow {
    fn into_account(self) -> MailAccount {
        MailAccount {
            id: self.uuid,
            tenant_id: self.tenant_id.to_string(),
            organization_id: self.organization_id.to_string(),
            owner_user_id: self.owner_user_id.to_string(),
            email_address: self.email_address,
            display_name: self.display_name,
            provider_kind: self.provider_kind,
            status: if self.status == 1 {
                MailAccountStatus::Active
            } else {
                MailAccountStatus::Disabled
            },
            sync_enabled: self.sync_enabled,
            last_synced_at: self.last_synced_at.map(|value| value.to_string()),
        }
    }
}

#[derive(sqlx::FromRow)]
struct FolderRow {
    uuid: String,
    account_id: String,
    folder_kind: String,
    name: String,
    parent_folder_id: Option<String>,
    unread_count: i32,
    total_count: i32,
    sort_order: i32,
}

impl FolderRow {
    fn into_folder(self) -> MailFolder {
        MailFolder {
            id: self.uuid,
            account_id: self.account_id,
            folder_kind: parse_folder_kind(self.folder_kind.as_str()),
            name: self.name,
            parent_folder_id: self.parent_folder_id,
            unread_count: self.unread_count.max(0) as u32,
            total_count: self.total_count.max(0) as u32,
            sort_order: self.sort_order,
        }
    }
}

fn parse_folder_kind(value: &str) -> MailFolderKind {
    match value {
        "sent" => MailFolderKind::Sent,
        "drafts" => MailFolderKind::Drafts,
        "trash" => MailFolderKind::Trash,
        "archive" => MailFolderKind::Archive,
        "spam" => MailFolderKind::Spam,
        "custom" => MailFolderKind::Custom,
        _ => MailFolderKind::Inbox,
    }
}

fn folder_kind_code(kind: MailFolderKind) -> &'static str {
    match kind {
        MailFolderKind::Inbox => "inbox",
        MailFolderKind::Sent => "sent",
        MailFolderKind::Drafts => "drafts",
        MailFolderKind::Trash => "trash",
        MailFolderKind::Archive => "archive",
        MailFolderKind::Spam => "spam",
        MailFolderKind::Custom => "custom",
    }
}

fn folder_sort_order(kind: MailFolderKind) -> i32 {
    match kind {
        MailFolderKind::Inbox => 0,
        MailFolderKind::Sent => 10,
        MailFolderKind::Drafts => 20,
        MailFolderKind::Archive => 30,
        MailFolderKind::Spam => 40,
        MailFolderKind::Trash => 50,
        MailFolderKind::Custom => 100,
    }
}

#[derive(sqlx::FromRow)]
struct SyncStateRow {
    uuid: String,
    account_id: String,
    folder_id: Option<String>,
    provider_kind: String,
    cursor_token: Option<String>,
    last_synced_at: Option<chrono::NaiveDateTime>,
    last_error: Option<String>,
}

impl SyncStateRow {
    fn into_sync_state(self) -> MailSyncState {
        MailSyncState {
            id: self.uuid,
            account_id: self.account_id,
            folder_id: self.folder_id,
            provider_kind: self.provider_kind,
            cursor_token: self.cursor_token,
            last_synced_at: self.last_synced_at.map(|value| value.to_string()),
            last_error: self.last_error,
        }
    }
}

#[derive(sqlx::FromRow)]
struct ThreadRow {
    uuid: String,
    account_id: String,
    folder_id: String,
    subject: String,
    snippet: Option<String>,
    participant_summary: Option<String>,
    message_count: i32,
    unread_count: i32,
    is_starred: bool,
    last_message_at: Option<chrono::NaiveDateTime>,
}

impl ThreadRow {
    fn into_thread(self) -> MailThread {
        MailThread {
            id: self.uuid,
            account_id: self.account_id,
            folder_id: self.folder_id,
            subject: self.subject,
            snippet: self.snippet,
            participant_summary: self.participant_summary,
            message_count: self.message_count.max(0) as u32,
            unread_count: self.unread_count.max(0) as u32,
            is_starred: self.is_starred,
            last_message_at: self.last_message_at.map(|value| value.to_string()),
        }
    }
}

#[derive(sqlx::FromRow)]
struct MessageRow {
    uuid: String,
    account_id: String,
    folder_id: String,
    thread_id: String,
    from_name: Option<String>,
    from_email: String,
    subject: String,
    snippet: Option<String>,
    body_text: Option<String>,
    body_html: Option<String>,
    is_read: bool,
    is_starred: bool,
    is_draft: bool,
    has_attachments: bool,
    sent_at: Option<chrono::NaiveDateTime>,
    received_at: Option<chrono::NaiveDateTime>,
    size_bytes: i64,
    metadata: serde_json::Value,
}

impl MessageRow {
    fn into_message(
        self,
        recipients: Vec<MailMessageRecipient>,
        attachments: Vec<MailAttachment>,
    ) -> MailMessage {
        MailMessage {
            id: self.uuid,
            account_id: self.account_id,
            folder_id: self.folder_id,
            thread_id: self.thread_id,
            from_name: self.from_name,
            from_email: self.from_email,
            subject: self.subject,
            snippet: self.snippet,
            body_text: self.body_text,
            body_html: self.body_html,
            is_read: self.is_read,
            is_starred: self.is_starred,
            is_draft: self.is_draft,
            has_attachments: self.has_attachments,
            sent_at: self.sent_at.map(|value| value.to_string()),
            received_at: self.received_at.map(|value| value.to_string()),
            size_bytes: self.size_bytes.max(0) as u64,
            recipients,
            attachments,
            metadata: if self.metadata.is_null() {
                json!({})
            } else {
                self.metadata
            },
        }
    }
}

#[derive(sqlx::FromRow)]
struct RecipientRow {
    recipient_kind: String,
    name: Option<String>,
    email_address: String,
}

impl RecipientRow {
    fn into_recipient(self) -> MailMessageRecipient {
        MailMessageRecipient {
            recipient_kind: match self.recipient_kind.as_str() {
                "cc" => MailRecipientKind::Cc,
                "bcc" => MailRecipientKind::Bcc,
                _ => MailRecipientKind::To,
            },
            name: self.name,
            email_address: self.email_address,
        }
    }
}

#[derive(sqlx::FromRow)]
struct AttachmentRow {
    uuid: String,
    message_id: String,
    file_name: String,
    content_type: String,
    size_bytes: i64,
    drive_node_id: Option<String>,
    checksum_sha256: Option<String>,
}

impl AttachmentRow {
    fn into_attachment(self) -> MailAttachment {
        MailAttachment {
            id: self.uuid,
            message_id: self.message_id,
            file_name: self.file_name,
            content_type: self.content_type,
            size_bytes: self.size_bytes.max(0) as u64,
            drive_node_id: self.drive_node_id,
            checksum_sha256: self.checksum_sha256,
        }
    }
}

#[derive(sqlx::FromRow)]
struct ProviderAccountRow {
    uuid: String,
    tenant_id: i64,
    organization_id: i64,
    provider_kind: String,
    name: String,
    host: String,
    port: i32,
    use_tls: bool,
    status: i32,
}

impl ProviderAccountRow {
    fn into_provider_account(self) -> MailProviderAccount {
        MailProviderAccount {
            id: self.uuid,
            tenant_id: self.tenant_id.to_string(),
            organization_id: self.organization_id.to_string(),
            provider_kind: self.provider_kind,
            name: self.name,
            host: self.host,
            port: self.port.max(0) as u16,
            use_tls: self.use_tls,
            status: if self.status == 1 {
                MailProviderAccountStatus::Active
            } else {
                MailProviderAccountStatus::Disabled
            },
        }
    }
}

#[derive(sqlx::FromRow)]
#[allow(dead_code)]
struct ProviderCredentialRow {
    uuid: String,
    tenant_id: i64,
    organization_id: i64,
    provider_account_id: String,
    username: String,
    secret_ref: String,
    status: i32,
}

impl ProviderCredentialRow {
    fn into_credential(self) -> MailProviderCredential {
        MailProviderCredential {
            id: self.uuid,
            tenant_id: self.tenant_id.to_string(),
            organization_id: self.organization_id.to_string(),
            provider_account_id: self.provider_account_id,
            username: self.username,
            secret_ref: self.secret_ref,
            status: if self.status == 1 {
                MailProviderCredentialStatus::Active
            } else {
                MailProviderCredentialStatus::Disabled
            },
        }
    }
}

async fn load_provider_account(
    pool: &PgPool,
    tenant_id: &str,
    organization_id: &str,
    account_id: &str,
) -> MailPersistenceResult<MailProviderAccount> {
    let row = sqlx::query_as::<_, ProviderAccountRow>(
        r#"
        SELECT uuid, tenant_id, organization_id, provider_kind, name, host, port, use_tls, status
        FROM mail_provider_account
        WHERE tenant_id = $1::bigint
          AND organization_id = $2::bigint
          AND uuid = $3
          AND deleted_at IS NULL
        "#,
    )
    .bind(parse_id(tenant_id))
    .bind(parse_id(organization_id))
    .bind(account_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| {
        MailPersistenceError::NotFound(format!("provider account not found: {account_id}"))
    })?;

    Ok(row.into_provider_account())
}

async fn load_provider_credential(
    pool: &PgPool,
    tenant_id: &str,
    organization_id: &str,
    credential_id: &str,
) -> MailPersistenceResult<MailProviderCredential> {
    let row = sqlx::query_as::<_, ProviderCredentialRow>(
        r#"
        SELECT uuid, tenant_id, organization_id, provider_account_id, username, secret_ref, status
        FROM mail_provider_credential
        WHERE tenant_id = $1::bigint
          AND organization_id = $2::bigint
          AND uuid = $3
          AND deleted_at IS NULL
        "#,
    )
    .bind(parse_id(tenant_id))
    .bind(parse_id(organization_id))
    .bind(credential_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| {
        MailPersistenceError::NotFound(format!("provider credential not found: {credential_id}"))
    })?;

    Ok(row.into_credential())
}

fn normalize_provider_kind(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "smtp" => Some("smtp"),
        "imap" => Some("imap"),
        _ => None,
    }
}

fn validate_secret_ref(value: &str) -> MailPersistenceResult<()> {
    let trimmed = value.trim();
    if trimmed.starts_with("env:") && trimmed.len() > 4 {
        return Ok(());
    }
    if trimmed.starts_with("secret://mail/") && trimmed.len() > "secret://mail/".len() {
        return Ok(());
    }
    Err(MailPersistenceError::Conflict(
        "secretRef must use env: or secret://mail/ prefix".to_owned(),
    ))
}

async fn load_delivery(
    pool: &PgPool,
    delivery_id: &str,
) -> MailPersistenceResult<MailTransactionalDelivery> {
    let row = sqlx::query_as::<_, DeliveryRow>(
        r#"
        SELECT uuid, tenant_id, organization_id, template_id, template_key, business_kind,
               recipient_email, from_email, subject, status, provider_account_id,
               correlation_id, last_error, sent_at, metadata, created_at
        FROM mail_transactional_delivery
        WHERE uuid = $1
        "#,
    )
    .bind(delivery_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| MailPersistenceError::NotFound(format!("delivery not found: {delivery_id}")))?;

    Ok(row.into_delivery())
}

fn template_category_to_db(category: MailTemplateCategory) -> &'static str {
    match category {
        MailTemplateCategory::Transactional => "transactional",
        MailTemplateCategory::Marketing => "marketing",
    }
}

fn template_status_to_db(status: MailTemplateStatus) -> i32 {
    match status {
        MailTemplateStatus::Active => 1,
        MailTemplateStatus::Disabled => 0,
    }
}

fn db_template_category(value: &str) -> MailTemplateCategory {
    if value == "marketing" {
        MailTemplateCategory::Marketing
    } else {
        MailTemplateCategory::Transactional
    }
}

fn db_template_status(value: i32) -> MailTemplateStatus {
    if value == 1 {
        MailTemplateStatus::Active
    } else {
        MailTemplateStatus::Disabled
    }
}

fn db_delivery_status(value: i32) -> MailTransactionalDeliveryStatus {
    match value {
        1 => MailTransactionalDeliveryStatus::Sent,
        2 => MailTransactionalDeliveryStatus::Failed,
        _ => MailTransactionalDeliveryStatus::Queued,
    }
}

fn db_verification_purpose(value: &str) -> MailVerificationPurpose {
    match value {
        "login_verification" => MailVerificationPurpose::LoginVerification,
        "password_reset" => MailVerificationPurpose::PasswordReset,
        "bind_email" => MailVerificationPurpose::BindEmail,
        _ => MailVerificationPurpose::GenericOtp,
    }
}

fn parse_timestamp(value: &str) -> MailPersistenceResult<NaiveDateTime> {
    NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f")
        .or_else(|_| NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S"))
        .or_else(|_| {
            chrono::DateTime::parse_from_rfc3339(value)
                .map(|value| value.naive_utc())
                .map_err(|error| MailPersistenceError::Unavailable(error.to_string()))
        })
        .map_err(|error| MailPersistenceError::Unavailable(error.to_string()))
}

fn timestamp_now() -> NaiveDateTime {
    sdkwork_utils_rust::now().naive_utc()
}

#[derive(sqlx::FromRow)]
struct TemplateRow {
    uuid: String,
    tenant_id: i64,
    organization_id: i64,
    template_key: String,
    name: String,
    category: String,
    purpose: String,
    locale: String,
    subject_template: String,
    body_html_template: Option<String>,
    body_text_template: Option<String>,
    variable_schema: serde_json::Value,
    status: i32,
    metadata: serde_json::Value,
}

impl TemplateRow {
    fn into_template(self) -> MailTemplate {
        MailTemplate {
            id: self.uuid,
            tenant_id: self.tenant_id.to_string(),
            organization_id: self.organization_id.to_string(),
            template_key: self.template_key,
            name: self.name,
            category: db_template_category(&self.category),
            purpose: self.purpose,
            locale: self.locale,
            subject_template: self.subject_template,
            body_html_template: self.body_html_template,
            body_text_template: self.body_text_template,
            variable_schema: if self.variable_schema.is_null() {
                json!({})
            } else {
                self.variable_schema
            },
            status: db_template_status(self.status),
            metadata: if self.metadata.is_null() {
                json!({})
            } else {
                self.metadata
            },
        }
    }
}

#[derive(sqlx::FromRow)]
struct ChallengeRow {
    uuid: String,
    recipient_email: String,
    purpose: String,
    code_hash: String,
    expires_at: NaiveDateTime,
    consumed_at: Option<NaiveDateTime>,
    attempt_count: i32,
    max_attempts: i32,
    delivery_id: Option<String>,
}

impl ChallengeRow {
    fn into_active(self) -> ActiveVerificationChallenge {
        ActiveVerificationChallenge {
            id: self.uuid,
            recipient_email: self.recipient_email,
            purpose: db_verification_purpose(&self.purpose),
            code_hash: self.code_hash,
            expires_at: self.expires_at.to_string(),
            attempt_count: self.attempt_count,
            max_attempts: self.max_attempts,
            delivery_id: self.delivery_id,
        }
    }
}

#[derive(sqlx::FromRow)]
struct DeliveryRow {
    uuid: String,
    tenant_id: i64,
    organization_id: i64,
    template_id: Option<String>,
    template_key: String,
    business_kind: String,
    recipient_email: String,
    from_email: Option<String>,
    subject: String,
    status: i32,
    provider_account_id: Option<String>,
    correlation_id: Option<String>,
    last_error: Option<String>,
    sent_at: Option<NaiveDateTime>,
    metadata: serde_json::Value,
    created_at: NaiveDateTime,
}

impl DeliveryRow {
    fn into_delivery(self) -> MailTransactionalDelivery {
        MailTransactionalDelivery {
            id: self.uuid,
            tenant_id: self.tenant_id.to_string(),
            organization_id: self.organization_id.to_string(),
            template_id: self.template_id,
            template_key: self.template_key,
            business_kind: self.business_kind,
            recipient_email: self.recipient_email,
            from_email: self.from_email,
            subject: self.subject,
            status: db_delivery_status(self.status),
            provider_account_id: self.provider_account_id,
            correlation_id: self.correlation_id,
            last_error: self.last_error,
            sent_at: self.sent_at.map(|value| value.to_string()),
            metadata: if self.metadata.is_null() {
                json!({})
            } else {
                self.metadata
            },
            created_at: self.created_at.to_string(),
        }
    }
}

#[derive(sqlx::FromRow)]
struct MarketingConsentRow {
    uuid: String,
    tenant_id: i64,
    organization_id: i64,
    recipient_email: String,
    status: i32,
    consent_source: String,
    granted_at: NaiveDateTime,
    revoked_at: Option<NaiveDateTime>,
    metadata: serde_json::Value,
}

impl MarketingConsentRow {
    fn into_consent(self) -> MailMarketingConsent {
        MailMarketingConsent {
            id: self.uuid,
            tenant_id: self.tenant_id.to_string(),
            organization_id: self.organization_id.to_string(),
            recipient_email: self.recipient_email,
            status: if self.status == 1 {
                MailMarketingConsentStatus::Active
            } else {
                MailMarketingConsentStatus::Revoked
            },
            consent_source: self.consent_source,
            granted_at: self.granted_at.to_string(),
            revoked_at: self.revoked_at.map(|value| value.to_string()),
            metadata: if self.metadata.is_null() {
                json!({})
            } else {
                self.metadata
            },
        }
    }
}

async fn load_marketing_consent(
    pool: &PgPool,
    tenant_id: &str,
    organization_id: &str,
    consent_id: &str,
) -> MailPersistenceResult<MailMarketingConsent> {
    let row = sqlx::query_as::<_, MarketingConsentRow>(
        r#"
        SELECT uuid, tenant_id, organization_id, recipient_email, status, consent_source,
               granted_at, revoked_at, metadata
        FROM mail_marketing_consent
        WHERE tenant_id = $1::bigint
          AND organization_id = $2::bigint
          AND uuid = $3
        "#,
    )
    .bind(parse_id(tenant_id))
    .bind(parse_id(organization_id))
    .bind(consent_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| {
        MailPersistenceError::NotFound(format!("marketing consent not found: {consent_id}"))
    })?;

    Ok(row.into_consent())
}

async fn load_marketing_consent_by_email(
    pool: &PgPool,
    tenant_id: &str,
    organization_id: &str,
    recipient_email: &str,
) -> MailPersistenceResult<MailMarketingConsent> {
    let row = sqlx::query_as::<_, MarketingConsentRow>(
        r#"
        SELECT uuid, tenant_id, organization_id, recipient_email, status, consent_source,
               granted_at, revoked_at, metadata
        FROM mail_marketing_consent
        WHERE tenant_id = $1::bigint
          AND organization_id = $2::bigint
          AND recipient_email = $3
        "#,
    )
    .bind(parse_id(tenant_id))
    .bind(parse_id(organization_id))
    .bind(recipient_email)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| {
        MailPersistenceError::NotFound(format!("marketing consent not found: {recipient_email}"))
    })?;

    Ok(row.into_consent())
}
