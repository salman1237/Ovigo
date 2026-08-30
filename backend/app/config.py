"""Application settings, loaded from environment variables / .env."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str
    sync_database_url: str

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

    # Cloudflare R2 (S3-compatible object storage)
    r2_account_id: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket_name: str | None = None
    r2_endpoint_url: str | None = None

    @property
    def r2_configured(self) -> bool:
        return all([self.r2_access_key_id, self.r2_secret_access_key, self.r2_bucket_name, self.r2_endpoint_url])

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
