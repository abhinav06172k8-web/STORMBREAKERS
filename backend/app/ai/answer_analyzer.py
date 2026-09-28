"""Vision extraction converts page pixels to typed answer segments as early as possible."""

import hashlib

from app.ai.model_router import AITask, model_router
from app.core.config import settings
from app.prompts.answer_analysis_prompt import ANSWER_EXTRACTION_PROMPT
from app.schemas.answer_schema import PageExtraction
from app.services.cache_service import get_json, make_key, set_json
from app.utils.image_processing import crop_region, prepare_page


async def extract_page(page_number: int, image: bytes) -> PageExtraction:
    cache_key = make_key("answer-extraction-v2", f"{page_number}:{hashlib.sha256(image).hexdigest()}")
    try:
        cached, _ = await get_json(cache_key)
        if cached is not None:
            return PageExtraction.model_validate(cached)
    except Exception:
        pass
    page = prepare_page(image, settings.ai_vision_max_dimension)
    initial = await model_router.generate(
        task=AITask.ANSWER_EXTRACTION,
        prompt=ANSWER_EXTRACTION_PROMPT.format(page_number=page_number),
        schema=PageExtraction,
        images=[page],
    )
    if not settings.ai_two_pass_vision:
        _mark_low_confidence(initial)
        try:
            await set_json(cache_key, initial.model_dump(), ttl_seconds=60 * 60 * 24 * 30)
        except Exception:
            pass
        return initial
    for segment in initial.answers:
        if segment.confidence >= settings.ai_confidence_threshold or not segment.bounding_box:
            continue
        try:
            refined = await model_router.generate(
                task=AITask.VISUAL_EVIDENCE,
                prompt=(f"Inspect this crop from answer-sheet page {page_number}. Read only visible writing. "
                        f"The region appears to belong to question {segment.question_number or 'uncertain'}. "
                        "Return question_number only if visible evidence supports it; otherwise null. "
                        "Return status uncertain and null answer_text if unclear."),
                schema=PageExtraction,
                images=[crop_region(page, segment.bounding_box)],
            )
            if refined.answers and refined.answers[0].confidence > segment.confidence:
                replacement = refined.answers[0].model_copy(update={"page": page_number})
                initial.answers[initial.answers.index(segment)] = replacement
        except Exception:
            # First pass result remains explicitly low-confidence; never synthesize unreadable text.
            continue
    for mark in initial.teacher_marks:
        if mark.status == "readable" and mark.confidence >= settings.ai_confidence_threshold:
            continue
        if not mark.bounding_box:
            continue
        try:
            refined = await model_router.generate(
                task=AITask.VISUAL_EVIDENCE,
                prompt=(f"Inspect this crop from corrected answer-sheet page {page_number}. Read only an explicit "
                        "teacher/examiner-awarded score. Do not infer a score from answer quality, ticks, or student "
                        "writing. Return the visible teacher mark with scope and question mapping only if supported; "
                        "otherwise return no teacher_marks. Preserve the visible mark as evidence."),
                schema=PageExtraction,
                images=[crop_region(page, mark.bounding_box)],
            )
            candidates = [item for item in refined.teacher_marks
                          if item.status == "readable" and item.awarded_marks is not None
                          and item.scope == mark.scope and item.confidence > mark.confidence
                          and (item.scope == "paper" or item.question_number == mark.question_number)]
            if candidates:
                replacement = candidates[0].model_copy(update={"page": page_number})
                initial.teacher_marks[initial.teacher_marks.index(mark)] = replacement
        except Exception:
            continue
    _mark_low_confidence(initial)
    try:
        await set_json(cache_key, initial.model_dump(), ttl_seconds=60 * 60 * 24 * 30)
    except Exception:
        pass
    return initial


def _mark_low_confidence(extraction: PageExtraction) -> None:
    for segment in extraction.answers:
        if segment.confidence < settings.ai_confidence_threshold:
            segment.status = "uncertain"
            segment.reason = segment.reason or "Handwriting or question mapping is unclear."
            segment.answer_text = None
    for mark in extraction.teacher_marks:
        if mark.confidence < settings.ai_confidence_threshold:
            mark.status = "uncertain"
            mark.reason = mark.reason or "Teacher-awarded mark is difficult to read confidently."
            mark.awarded_marks = None
