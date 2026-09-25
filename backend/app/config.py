"""Application settings, loaded from environment variables / .env."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str
    sync_database_url: str
    # Neon requires TLS; a self-hosted Postgres on the same internal Docker network
    # has no cert configured and doesn't need one. True by default since Neon was
    # the original/default target — set to false via env var for an internal host.
    db_ssl_required: bool = True

    # Auth
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # App
    environment: str = "development"
    cors_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3000"
    # Public URL of this API — used to build SSLCommerz callback/IPN URLs, which
    # must be reachable from SSLCommerz's servers (so never localhost in production).
    backend_url: str = "http://127.0.0.1:8000"

    # SSLCommerz (payment gateway) — sandbox by default
    sslcommerz_store_id: str | None = None
    sslcommerz_store_passwd: str | None = None
    sslcommerz_is_live: bool = False

    @property
    def sslcommerz_configured(self) -> bool:
        return bool(self.sslcommerz_store_id and self.sslcommerz_store_passwd)

    @property
    def sslcommerz_api_url(self) -> str:
        if self.sslcommerz_is_live:
            return "https://securepay.sslcommerz.com/gwprocess/v4/api.php"
        return "https://sandbox-gw.sslcommerz.com/gwprocess/v4/api.php"

    @property
    def sslcommerz_validation_url(self) -> str:
        if self.sslcommerz_is_live:
            return "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php"
        return "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php"

    # Shown to a traveler who picks bank transfer at checkout — set a real bank
    # name/account/routing number via env var before this is used with real money.
    bank_transfer_instructions: str = "Bank transfer details have not been configured yet — contact support."

    # Cloudflare R2 (S3-compatible object storage)
    r2_account_id: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket_name: str | None = None
    r2_endpoint_url: str | None = None

    @property
    def r2_configured(self) -> bool:
        return all([self.r2_access_key_id, self.r2_secret_access_key, self.r2_bucket_name, self.r2_endpoint_url])

    # Elasticsearch (Sprint 27-28: free-text search) — a single-node container on the
    # same Dokploy VPS/Docker network as this API, reachable by its container name.
    # No credentials: internal-only, never publicly exposed. See core/search_engine.py
    # for the graceful-degradation behavior when it's unreachable (e.g. local dev).
    elasticsearch_url: str = "http://ovigo-elasticsearch:9200"

    # Triptel Partner Reseller API (Phase 5: eSIM store) — see TRIPTEL_PARTNER_API.md.
    # Optional so the app boots with the store simply unavailable when unset.
    triptel_api_base_url: str = "https://triptel.co/api/v1/partner"
    triptel_api_key: str | None = None
    triptel_webhook_secret: str | None = None

    @property
    def triptel_configured(self) -> bool:
        return bool(self.triptel_api_key)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # Email delivery (SMTP) — see app/core/email.py. Optional so the app boots fine
    # with notifications staying in-app-only until this is configured, same pattern
    # as R2/Triptel/SSLCommerz above.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_from_name: str = "Ovigo"
    smtp_use_tls: bool = True

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password and self.smtp_from_email)

    # Web Push (VAPID) — see app/core/push.py. Self-hosted, no third-party account:
    # the key pair is generated once and set here, unlike the provider credentials above.
    vapid_private_key: str | None = None
    vapid_public_key: str | None = None
    vapid_claim_email: str | None = None

    @property
    def vapid_configured(self) -> bool:
        return bool(self.vapid_private_key and self.vapid_public_key and self.vapid_claim_email)


@lru_cache
def get_settings() -> Settings:
    return Settings()
