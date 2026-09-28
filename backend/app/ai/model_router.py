"""Task-aware local-first model routing through a reusable Ollama connection."""

import asyncio
from enum import StrEnum
from typing import Any, Protocol, TypeVar

import httpx
from pydantic import BaseModel

from app.core.config import settings

T = TypeVar("T", bound=BaseModel)


class AITask(StrEnum):
    ANSWER_EXTRACTION = "answer_extraction"
    PAGE_ANALYSIS = "page_analysis"
    VISUAL_EVIDENCE = "visual_evidence"
    RUBRIC_ANALYSIS = "rubric_analysis"
    EVALUATION = "evaluation"
    CONCEPT_ANALYSIS = "concept_analysis"
    FEEDBACK = "feedback"
    LEARNING_PLAN = "learning_plan"
    STUDENT_CHAT = "student_chat"
    QUIZ = "quiz"
    RETEST = "retest"
    RESOURCE_QUERY = "resource_query"


VISION_TASKS = {
    AITask.ANSWER_EXTRACTION,
    AITask.PAGE_ANALYSIS,
    AITask.VISUAL_EVIDENCE,
}
TEXT_REASONING_TASKS = set(AITask) - VISION_TASKS


class AIProvider(Protocol):
    async def generate(self, *, task: AITask, prompt: str, schema: type[T], images: list[bytes] | None = None) -> T: ...


class LocalModelUnavailable(RuntimeError):
    """Raised when Ollama or the routed model is unavailable; never triggers silent cloud use."""


class OllamaProvider:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=settings.ollama_base_url.rstrip("/"), timeout=settings.ollama_timeout_seconds
        )

    async def close(self) -> None:
        await self._client.aclose()

    def model_for(self, task: AITask) -> str:
        return settings.ollama_vision_model if task in VISION_TASKS else settings.ollama_text_model

    async def installed_models(self) -> set[str]:
        response = await self._client.get("/api/tags")
        response.raise_for_status()
        return {item.get("name", "") for item in response.json().get("models", [])}

    async def generate(
        self, *, task: AITask, prompt: str, schema: type[T], images: list[bytes] | None = None
    ) -> T:
        model = self.model_for(task)
        payload: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "format": schema.model_json_schema(),
            "stream": False,
            "keep_alive": settings.ollama_keep_alive,
            "think": False,
            "options": {"temperature": 0.1},
        }
        if images:
            import base64

            payload["messages"][0]["images"] = [base64.b64encode(image).decode("ascii") for image in images]
        try:
            response = await self._client.post("/api/chat", json=payload)
            if response.status_code == 404:
                raise LocalModelUnavailable(
                    f"Local {'vision' if task in VISION_TASKS else 'reasoning'} model unavailable: "
                    f"{model} is not installed. Run `ollama pull {model}`."
                )
            response.raise_for_status()
            content = response.json()["message"]["content"]
            return schema.model_validate_json(content)
        except LocalModelUnavailable:
            raise
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            label = "vision" if task in VISION_TASKS else "reasoning"
            raise LocalModelUnavailable(
                f"Local {label} model unavailable. Check that Ollama is running at "
                f"{settings.ollama_base_url} and {model} is installed."
            ) from exc


class ModelRouter:
    """Routes local by default. Cloud use requires explicit provider selection and enablement."""

    def __init__(self, local_provider: OllamaProvider | None = None) -> None:
        self.local = local_provider or OllamaProvider()
        self._semaphore = asyncio.Semaphore(max(1, settings.ai_max_concurrent_tasks))

    async def close(self) -> None:
        await self.local.close()

    async def generate(
        self, *, task: AITask, prompt: str, schema: type[T], images: list[bytes] | None = None
    ) -> T:
        # Gemini/custom adapters are extension points. Cloud fallback stays disabled unless explicitly enabled.
        if settings.ai_provider != "local" and not settings.ai_cloud_fallback:
            raise RuntimeError("Cloud AI is disabled. Set AI_CLOUD_FALLBACK=true and configure a provider explicitly.")
        if settings.ai_provider != "local":
            raise RuntimeError(f"AI provider '{settings.ai_provider}' is not configured; local AI remains the default.")
        async with self._semaphore:
            return await self.local.generate(task=task, prompt=prompt, schema=schema, images=images)


model_router = ModelRouter()
