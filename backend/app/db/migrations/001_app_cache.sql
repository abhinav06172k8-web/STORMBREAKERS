-- Shared cache for deterministic rubric/answer/concept analyses, quiz sessions and resources.
CREATE TABLE IF NOT EXISTS app_cache (
    cache_key VARCHAR(512) PRIMARY KEY,
    payload TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
