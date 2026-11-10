from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/presentator"
    redis_url: str = "redis://localhost:6379/0"
    storage_dir: str = "storage"
    libreoffice_bin: str = "soffice"

    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str = "gpt-4o-mini"
    llm_max_attempts: int = 3
    llm_timeout_seconds: float = 90.0

    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
