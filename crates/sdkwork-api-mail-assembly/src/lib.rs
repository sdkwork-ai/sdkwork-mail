//! API assembly for sdkwork-mail.
//! Application bootstrap lives in `bootstrap.rs`; route inventory is in `assembly-manifest.json`.
//! SDKWORK-ASSEMBLY-LIB-CUSTOM: exports beyond the canonical materializer template.

mod bootstrap;
mod generated;
mod readiness;

pub use bootstrap::{ApiAssembly, assemble_api_router, assemble_api_router_with_bootstrap, assemble_api_router_with_pool, assemble_api_router_with_service, bootstrap_mail_api_service_from_env, MailApiBootstrap, web_module, web_module_with_pool};

pub fn assembly_route_count() -> usize {
    generated::ROUTE_CRATE_COUNT
}
