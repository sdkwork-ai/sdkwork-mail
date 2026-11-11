mod drive_attachment_http_adapter;
pub mod drive_attachment_port;
pub mod mailbox_sync;
pub mod outbound;
pub mod providers;
pub mod service;
pub mod transactional;
pub mod transport_resolver;

pub use drive_attachment_port::{
    MAIL_DRIVE_MODE_ENV, MailDriveAttachmentBootstrapError, MailDriveAttachmentMode,
    build_mail_drive_attachment_port_from_env, mail_drive_attachment_mode,
    resolve_mail_drive_attachment_mode,
};
pub use service::MailProductService;
