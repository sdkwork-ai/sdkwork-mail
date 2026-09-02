use std::sync::Arc;

use sdkwork_api_mail_assembly::bootstrap_mail_api_service_from_env;
use sdkwork_iam_web_adapter::{
    IamAuditEmitter, IamSecurityEventEmitter, build_web_framework_builder,
    iam_web_request_context_resolver_from_database_pool_for_audiences,
    iam_web_request_context_resolver_from_env,
};
use sdkwork_web_bootstrap::{ApiModuleRegistry, ComposedApiAssembly, infra_public_path_prefixes};
use sdkwork_web_core::{RateLimitPolicy, SecurityPolicy};

const APPLICATION_ID: &str = "sdkwork-mail";

fn mail_security_policy() -> SecurityPolicy {
    SecurityPolicy {
        rate_limit: RateLimitPolicy {
            enabled: true,
            ..RateLimitPolicy::default()
        },
        ..SecurityPolicy::default()
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let bootstrap = bootstrap_mail_api_service_from_env().await?;
    let database_pool = bootstrap.database_pool.clone();
    let contribution =
        sdkwork_api_mail_assembly::assemble_api_router_with_bootstrap(bootstrap).await?;
    let environment = std::env::var("SDKWORK_ENVIRONMENT")
        .or_else(|_| std::env::var("SDKWORK_MAIL_ENVIRONMENT"))
        .unwrap_or_else(|_| "development".to_owned());
    let production = matches!(
        environment.trim().to_ascii_lowercase().as_str(),
        "prod" | "production"
    );
    let resolver = if production {
        let pool = database_pool
            .clone()
            .ok_or_else(|| anyhow::anyhow!("production Mail gateway requires PostgreSQL"))?;
        iam_web_request_context_resolver_from_database_pool_for_audiences(
            pool,
            &[APPLICATION_ID, "mail"],
        )
        .await
        .map_err(anyhow::Error::msg)?
    } else {
        iam_web_request_context_resolver_from_env().await
    };
    let mut framework = build_web_framework_builder(
        resolver,
        contribution.route_manifest.clone(),
        infra_public_path_prefixes(),
    )
    .security_policy(mail_security_policy());
    if production {
        let postgres_pool = database_pool
            .as_ref()
            .and_then(|pool| pool.as_postgres())
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("production Mail gateway requires PostgreSQL"))?;
        framework = framework
            .audit_emitter(Arc::new(IamAuditEmitter::new(
                postgres_pool.clone(),
                APPLICATION_ID,
                environment.clone(),
            )))
            .security_event_emitter(Arc::new(IamSecurityEventEmitter::new(
                postgres_pool,
                environment,
            )));
    }
    let mut module_registry = ApiModuleRegistry::new();
    module_registry.add_modules(vec![contribution]);
    let app = module_registry
        .try_compose("SDKWork Mail API")
        .map_err(anyhow::Error::msg)?
        .into_hosted(framework)
        .router;

    let bind_addr = std::env::var("SDKWORK_MAIL_APPLICATION_PUBLIC_INGRESS_BIND")
        .unwrap_or_else(|_| "127.0.0.1:18090".into());
    let listener = tokio::net::TcpListener::bind(bind_addr.as_str()).await?;
    tracing::info!(%bind_addr, "sdkwork-api-mail-standalone-gateway listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    tracing::info!("sdkwork-api-mail-standalone-gateway stopped");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
}
