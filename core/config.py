from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Supabase
    supabase_url: str = Field(..., alias="SUPABASE_URL")
    supabase_service_key: str = Field(..., alias="SUPABASE_SERVICE_KEY")

    # LLMs
    groq_api_key: str = Field(..., alias="GROQ_API_KEY")
    gemini_api_key: str = Field(..., alias="GEMINI_API_KEY")
    cerebras_api_key: str = Field(..., alias="CEREBRAS_API_KEY")

    # Media APIs (free tier — no Colab)
    elevenlabs_api_key: str | None = Field(default=None, alias="ELEVENLABS_API_KEY")
    pollinations_token: str | None = Field(default=None, alias="POLLINATIONS_TOKEN")  # optional
    did_api_key: str | None = Field(default=None, alias="DID_API_KEY")
    fal_api_key: str | None = Field(default=None, alias="FAL_API_KEY")
    creatomate_api_key: str | None = Field(default=None, alias="CREATOMATE_API_KEY")
    pexels_api_key: str | None = Field(default=None, alias="PEXELS_API_KEY")
    pixabay_api_key: str | None = Field(default=None, alias="PIXABAY_API_KEY")
    huggingface_api_key: str | None = Field(default=None, alias="HUGGINGFACE_API_KEY")

    # Trend sources
    youtube_api_key: str | None = Field(default=None, alias="YOUTUBE_API_KEY")  # for Data API v3 (key-only)

    # Infra
    redis_url: str = Field(default="redis://redis:6379", alias="REDIS_URL")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    env: str = Field(default="local", alias="ENV")

    # Worker
    video_worker_enabled: bool = Field(default=True, alias="VIDEO_WORKER_ENABLED")
    video_queue_name: str = Field(default="viral:videos:queue", alias="VIDEO_QUEUE_NAME")

    # Cloudflare R2 (S3-compatible) — public hosting for finished videos
    r2_account_id: str | None = Field(default=None, alias="R2_ACCOUNT_ID")
    r2_access_key_id: str | None = Field(default=None, alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: str | None = Field(default=None, alias="R2_SECRET_ACCESS_KEY")
    r2_bucket: str = Field(default="viral-videos", alias="R2_BUCKET")
    r2_public_base_url: str | None = Field(default=None, alias="R2_PUBLIC_BASE_URL")

    # YouTube OAuth (for publishing — separate from Data API key above)
    youtube_client_id: str | None = Field(default=None, alias="YOUTUBE_CLIENT_ID")
    youtube_client_secret: str | None = Field(default=None, alias="YOUTUBE_CLIENT_SECRET")
    youtube_refresh_token: str | None = Field(default=None, alias="YOUTUBE_REFRESH_TOKEN")

    # TikTok Content Posting API v2
    tiktok_client_key: str | None = Field(default=None, alias="TIKTOK_CLIENT_KEY")
    tiktok_client_secret: str | None = Field(default=None, alias="TIKTOK_CLIENT_SECRET")
    tiktok_access_token: str | None = Field(default=None, alias="TIKTOK_ACCESS_TOKEN")

    # Instagram Graph API
    instagram_access_token: str | None = Field(default=None, alias="INSTAGRAM_ACCESS_TOKEN")
    instagram_account_id: str | None = Field(default=None, alias="INSTAGRAM_ACCOUNT_ID")

    # Per-platform posting limits (Redis-enforced)
    publish_max_per_day: int = Field(default=15, alias="PUBLISH_MAX_PER_DAY")
    publish_min_gap_seconds: int = Field(default=1800, alias="PUBLISH_MIN_GAP_SECONDS")

    # Web Push (VAPID) — generate with: python scripts/generate_vapid.py
    vapid_public_key: str | None = Field(default=None, alias="VAPID_PUBLIC_KEY")
    vapid_private_key: str | None = Field(default=None, alias="VAPID_PRIVATE_KEY")
    vapid_subject: str = Field(default="mailto:motivk4716@gmail.com", alias="VAPID_SUBJECT")

    # Daily quotas per provider (soft limits, used for rotation awareness)
    groq_daily_limit: int = 14000
    gemini_daily_limit: int = 1000
    cerebras_daily_limit: int = 14000


@lru_cache
def get_settings() -> Settings:
    return Settings()
