from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Interview Copilot API"
    environment: str = Field(default="development")

    upload_dir: str = Field(default="/tmp/uploads")
    max_upload_size_mb: int = Field(default=10)

    database_url: str = Field(
        default="postgresql+asyncpg://copilot:copilot_dev_password@localhost:5432/interview_copilot"
    )

    secret_key: str = Field(default="change-me-in-production")
    access_token_expire_minutes: int = 60 * 24
    refresh_token_expire_days: int = 30
    algorithm: str = "HS256"

    openai_api_key: str = Field(default="")
    anthropic_api_key: str = Field(default="")

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
