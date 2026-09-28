"""Server-only YouTube search with DB cache, deduplication and stale fallback."""

import asyncio
import hashlib
import logging
import math
import re
import time

import httpx

from app.ai.model_router import AITask, model_router
from app.core.config import settings
from app.services.cache_service import get_json, set_json

logger = logging.getLogger(__name__)
_locks: dict[str, asyncio.Lock] = {}
_rate_lock = asyncio.Lock()
_last_request_at = 0.0
_quota_message = "Learning videos are temporarily unavailable. Continue with the generated explanation and quiz."


def _duration_seconds(value: str | None) -> int | None:
    if not value:
        return None
    match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value)
    if not match:
        return None
    hours, minutes, seconds = (int(part or 0) for part in match.groups())
    return hours * 3600 + minutes * 60 + seconds


async def educational_query(concept: str, sub_concept: str | None = None) -> str:
    from pydantic import BaseModel

    class SearchQuery(BaseModel):
        query: str

    task = f"Create a concise beginner-friendly YouTube learning search query for {concept}."
    if sub_concept:
        task += f" Focus on {sub_concept}."
    result = await model_router.generate(task=AITask.RESOURCE_QUERY, prompt=task, schema=SearchQuery)
    return result.query[:160]


async def search_videos(concept: str, sub_concept: str | None = None) -> dict:
    if not settings.youtube_enabled:
        return {"items": [], "message": _quota_message}
    material = f"{concept.casefold()}|{(sub_concept or '').casefold()}"
    key = "youtube:" + hashlib.sha256(material.encode()).hexdigest()
    try:
        cached, _ = await get_json(key)
        if cached is not None:
            return cached
    except Exception as exc:
        logger.warning("YouTube cache lookup failed (%s)", type(exc).__name__)
    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        try:
            cached, _ = await get_json(key)
            if cached is not None:
                return cached
            stale, _ = await get_json(key, allow_stale=True)
        except Exception as exc:
            stale = None
            logger.warning("YouTube cache unavailable (%s)", type(exc).__name__)
        if not settings.youtube_api_key:
            return stale or {"items": [], "message": _quota_message}
        try:
            query = await educational_query(concept, sub_concept)
            params = {
                "key": settings.youtube_api_key,
                "part": "snippet",
                "type": "video",
                "q": query,
                "maxResults": min(max(settings.youtube_max_results, 1), 10),
                "order": "relevance",
                "relevanceLanguage": settings.youtube_relevance_language,
                "regionCode": settings.youtube_region_code,
                "safeSearch": "strict",
            }
            global _last_request_at
            async with _rate_lock:
                delay = 0.25 - (time.monotonic() - _last_request_at)
                if delay > 0:
                    await asyncio.sleep(delay)
                async with httpx.AsyncClient(timeout=8) as client:
                    response = await client.get("https://www.googleapis.com/youtube/v3/search", params=params)
                _last_request_at = time.monotonic()
            response.raise_for_status()
            data = response.json()
            video_ids = [item.get("id", {}).get("videoId") for item in data.get("items", [])
                         if item.get("id", {}).get("videoId")]
            details_by_id = {}
            if video_ids:
                try:
                    async with httpx.AsyncClient(timeout=8) as client:
                        details_response = await client.get("https://www.googleapis.com/youtube/v3/videos", params={
                            "key": settings.youtube_api_key,
                            "part": "contentDetails,statistics",
                            "id": ",".join(video_ids),
                        })
                    details_response.raise_for_status()
                    details_by_id = {item["id"]: item for item in details_response.json().get("items", [])}
                except Exception as exc:
                    logger.info("YouTube detail lookup unavailable (%s)", type(exc).__name__)
            search_terms = set(re.findall(r"[a-z0-9]+", f"{query} {concept} {sub_concept or ''}".casefold()))
            educational_terms = {"explained", "tutorial", "beginner", "basics", "guide", "lecture", "lesson"}
            items = [{
                "video_id": item["id"]["videoId"],
                "title": item["snippet"]["title"],
                "channel": item["snippet"]["channelTitle"],
                "thumbnail": item["snippet"].get("thumbnails", {}).get("medium", {}).get("url"),
                "url": f"https://www.youtube.com/watch?v={item['id']['videoId']}",
                "duration_seconds": _duration_seconds(details_by_id.get(item["id"]["videoId"], {})
                                                       .get("contentDetails", {}).get("duration")),
                "_rank": _resource_rank(item, details_by_id.get(item["id"]["videoId"], {}),
                                         search_terms, educational_terms),
            } for item in data.get("items", []) if item.get("id", {}).get("videoId")]
            items = [item for item in items if item["duration_seconds"] is None
                     or 45 <= item["duration_seconds"] <= 7200]
            items.sort(key=lambda item: item["_rank"], reverse=True)
            for item in items:
                item.pop("_rank", None)
                item["why_recommended"] = f"Matches {sub_concept or concept} and is an educational resource"
            result = {"items": items, "message": None if items else _quota_message}
            result["query"] = query
            try:
                await set_json(key, result, ttl_seconds=24 * 60 * 60)
            except Exception as exc:
                logger.warning("YouTube cache write failed (%s)", type(exc).__name__)
            return result
        except Exception as exc:
            logger.warning("YouTube search unavailable (%s)", type(exc).__name__)
            return stale or {"items": [], "message": _quota_message}


def _resource_rank(item: dict, details: dict, search_terms: set[str], educational_terms: set[str]) -> float:
    title_tokens = set(re.findall(r"[a-z0-9]+", item.get("snippet", {}).get("title", "").casefold()))
    channel_tokens = set(re.findall(r"[a-z0-9]+", item.get("snippet", {}).get("channelTitle", "").casefold()))
    relevance = len(title_tokens & search_terms) * 2 + len(channel_tokens & search_terms) * 0.5
    educational = len(title_tokens & educational_terms) * 1.5
    views = int(details.get("statistics", {}).get("viewCount", 0) or 0)
    useful_signal = min(math.log10(views + 1), 5) * 0.15
    return relevance + educational + useful_signal
