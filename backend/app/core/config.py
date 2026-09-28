from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "sqlite+aiosqlite:///./eduplus.db"
    ai_provider: str = "local"
    ollama_base_url: str = "http://localhost:11434"
    ollama_text_model: str = "qwen3:8b"
    ollama_vision_model: str = "qwen3-vl:4b"
    ollama_keep_alive: str = "15m"
    ollama_timeout_seconds: float = 180
    ai_max_concurrent_tasks: int = 2
    ai_confidence_threshold: float = 0.65
    ai_cloud_fallback: bool = False
    ai_two_pass_vision: bool = True
    ai_vision_max_dimension: int = 2200
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None
    supabase_storage_bucket: str = "answer-sheets"
    youtube_api_key: str | None = None
    youtube_enabled: bool = True
    youtube_region_code: str = "IN"
    youtube_relevance_language: str = "en"
    youtube_max_results: int = 5
    max_upload_mb: int = 20
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
