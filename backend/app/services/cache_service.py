"""Small DB-backed JSON cache shared by AI analyses and learning resources."""

import json
import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.db.database import engine

_initialized = False


def make_key(namespace: str, payload: str) -> str:
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"{namespace}:{digest}"


async def _ensure_table() -> None:
    global _initialized
    if _initialized:
        return
    async with engine.begin() as connection:
        await connection.execute(text(
            "CREATE TABLE IF NOT EXISTS app_cache (cache_key VARCHAR(512) PRIMARY KEY, "
            "payload TEXT NOT NULL, expires_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL)"
        ))
    _initialized = True


async def get_json(key: str, *, allow_stale: bool = False) -> tuple[object | None, bool]:
    await _ensure_table()
    async with engine.connect() as connection:
        row = (await connection.execute(text(
            "SELECT payload, expires_at FROM app_cache WHERE cache_key = :key"
        ), {"key": key})).first()
    if row is None:
        return None, False
    stale = row.expires_at < datetime.now(timezone.utc).replace(tzinfo=None)
    if stale and not allow_stale:
        return None, False
    return json.loads(row.payload), stale


async def set_json(key: str, payload: object, *, ttl_seconds: int) -> None:
    await _ensure_table()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    async with engine.begin() as connection:
        await connection.execute(text(
            "INSERT INTO app_cache(cache_key, payload, expires_at, updated_at) "
            "VALUES (:key, :payload, :expires, :updated) "
            "ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, "
            "expires_at=excluded.expires_at, updated_at=excluded.updated_at"
        ), {"key": key, "payload": json.dumps(payload),
            "expires": now + timedelta(seconds=ttl_seconds), "updated": now})
