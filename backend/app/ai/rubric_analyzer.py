"""Evaluation scheme interpretation uses reasoning for text and vision only for image input."""

import hashlib
from pydantic import BaseModel, Field

from app.ai.model_router import AITask, model_router
from app.prompts.rubric_prompt import RUBRIC_PROMPT
from app.schemas.rubric_schema import RubricQuestion
from app.services.cache_service import get_json, make_key, set_json
from app.utils.image_processing import prepare_page


class RubricOutput(BaseModel):
    questions: list[RubricQuestion] = Field(default_factory=list)
    needs_teacher_review: bool = False
    ambiguity_reasons: list[str] = Field(default_factory=list)


class VisualPageText(BaseModel):
    page: int
    text: str
    uncertain_regions: list[str] = Field(default_factory=list)


class VisualSchemeExtraction(BaseModel):
    pages: list[VisualPageText]


async def analyze_rubric_text(source_text: str) -> list[RubricQuestion]:
    key = make_key("rubric-analysis-v1", hashlib.sha256(source_text.encode()).hexdigest())
    try:
        cached, _ = await get_json(key)
        if cached is not None:
            return [RubricQuestion.model_validate(item) for item in cached]
    except Exception:
        pass
    output = await model_router.generate(
        task=AITask.RUBRIC_ANALYSIS,
        prompt=f"{RUBRIC_PROMPT}\n\nEvaluation scheme:\n{source_text}",
        schema=RubricOutput,
    )
    if output.needs_teacher_review:
        raise ValueError("The evaluation scheme contains ambiguous criteria. Teacher review is required.")
    if not output.questions:
        raise ValueError("No reliable rubric questions were extracted. Teacher review is required.")
    try:
        await set_json(key, [item.model_dump() for item in output.questions], ttl_seconds=365 * 86400)
    except Exception:
        pass
    return output.questions


async def analyze_rubric_images(pages: list[bytes]) -> list[RubricQuestion]:
    digest = hashlib.sha256(b"".join(hashlib.sha256(page).digest() for page in pages)).hexdigest()
    key = make_key("rubric-vision-v1", digest)
    try:
        cached, _ = await get_json(key)
        if cached is not None:
            return [RubricQuestion.model_validate(item) for item in cached]
    except Exception:
        pass
    visual = await model_router.generate(
        task=AITask.VISUAL_EVIDENCE,
        prompt=("Transcribe the printed/handwritten evaluation scheme text from the supplied pages in order. "
                "Preserve question boundaries, criteria, marks, alternatives, and annotations. Do not interpret "
                "or fill illegible text. Return one entry per page and list uncertain regions explicitly."),
        schema=VisualSchemeExtraction,
        images=[prepare_page(page) for page in pages],
    )
    uncertain = [f"page {item.page}: {reason}" for item in visual.pages for reason in item.uncertain_regions]
    if uncertain or not visual.pages or any(not item.text.strip() for item in visual.pages):
        raise ValueError("The evaluation scheme contains ambiguous criteria. Teacher review is required. "
                         + "; ".join(uncertain))
    source_text = "\n\n".join(f"Page {item.page}:\n{item.text}" for item in visual.pages)
    questions = await analyze_rubric_text(source_text)
    try:
        await set_json(key, [item.model_dump() for item in questions], ttl_seconds=365 * 86400)
    except Exception:
        pass
    return questions
