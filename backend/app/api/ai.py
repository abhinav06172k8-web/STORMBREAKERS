from fastapi import APIRouter

from app.ai.model_router import LocalModelUnavailable, model_router
from app.core.config import settings

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/health")
async def ai_health() -> dict:
    expected = {settings.ollama_text_model, settings.ollama_vision_model}
    try:
        installed = await model_router.local.installed_models()
        missing = sorted(expected - installed)
        return {
            "local_ai": not missing,
            "ollama_reachable": True,
            "text_model": settings.ollama_text_model,
            "vision_model": settings.ollama_vision_model,
            "youtube": settings.youtube_enabled and bool(settings.youtube_api_key),
            "cloud_fallback": settings.ai_cloud_fallback,
            "missing_models": missing,
            "configuration_instruction": (
                None if not missing else f"Install missing models with: ollama pull {' && ollama pull '.join(missing)}"
            ),
        }
    except Exception as exc:
        return {
            "local_ai": False,
            "ollama_reachable": False,
            "text_model": settings.ollama_text_model,
            "vision_model": settings.ollama_vision_model,
            "youtube": settings.youtube_enabled and bool(settings.youtube_api_key),
            "cloud_fallback": settings.ai_cloud_fallback,
            "missing_models": sorted(expected),
            "error": str(LocalModelUnavailable(
                f"Ollama is unreachable at {settings.ollama_base_url}. Start Ollama, then pull "
                f"{settings.ollama_text_model} and {settings.ollama_vision_model}."
            )),
        }


@router.get("/settings")
async def ai_settings() -> dict:
    """Non-secret runtime configuration for the local administrator settings screen."""
    return {
        "provider": settings.ai_provider,
        "text_model": settings.ollama_text_model,
        "vision_model": settings.ollama_vision_model,
        "cloud_fallback": settings.ai_cloud_fallback,
        "youtube_enabled": settings.youtube_enabled,
        "youtube_configured": bool(settings.youtube_api_key),
        "max_concurrent_tasks": settings.ai_max_concurrent_tasks,
        "confidence_threshold": settings.ai_confidence_threshold,
    }
