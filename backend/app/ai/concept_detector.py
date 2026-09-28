"""Derive evidence-linked concepts and cautious mastery estimates from evaluations."""

import json

from pydantic import BaseModel, Field

from app.ai.model_router import AITask, model_router
from app.services.cache_service import get_json, make_key, set_json


class ConceptSignal(BaseModel):
    concept: str
    sub_concept: str | None = None
    mastery_estimate: int = Field(ge=0, le=100)
    evidence_count: int = Field(ge=0)
    incorrect_count: int = Field(ge=0)
    partial_count: int = Field(ge=0)
    evidence: list[str] = Field(default_factory=list)


class ConceptSignals(BaseModel):
    concepts: list[ConceptSignal]


async def detect_concepts(evaluations: list[dict]) -> ConceptSignals:
    cache_key = make_key("concept-analysis-v1", json.dumps(evaluations, sort_keys=True))
    try:
        cached, _ = await get_json(cache_key)
        if cached is not None:
            return ConceptSignals.model_validate(cached)
    except Exception:
        pass
    prompt = ("Summarize learning signals using only these rubric evaluation records. Use exact concept "
              "and sub-concept names present in the records; do not invent or rename concepts. Count "
              "evidence and statuses, and estimate a 0..100 performance signal. Do not describe it as "
              "a psychological measurement. "
              f"Records: {evaluations}")
    result = await model_router.generate(task=AITask.CONCEPT_ANALYSIS, prompt=prompt, schema=ConceptSignals)
    normalized = []
    for signal in result.concepts:
        matching = [row for row in evaluations
                    if (row.get("concept") or "").casefold() == signal.concept.casefold()
                    and ((row.get("sub_concept") or "").casefold() == (signal.sub_concept or "").casefold())]
        if not matching:
            continue
        denominator = sum(float(row.get("max_marks", 0)) for row in matching)
        numerator = sum(float(row.get("awarded_marks", 0)) for row in matching)
        signal = signal.model_copy(update={
            "mastery_estimate": round(numerator / denominator * 100) if denominator else 0,
            "evidence_count": len(matching),
            "incorrect_count": sum(row.get("status") == "incorrect" for row in matching),
            "partial_count": sum(row.get("status") == "partially_satisfied" for row in matching),
            "evidence": [str(row.get("student_evidence", "")) for row in matching if row.get("student_evidence")],
        })
        normalized.append(signal)
    result = ConceptSignals(concepts=normalized)
    try:
        await set_json(cache_key, result.model_dump(), ttl_seconds=30 * 86400)
    except Exception:
        pass
    return result
