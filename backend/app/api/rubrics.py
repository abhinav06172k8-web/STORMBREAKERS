from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.ai.rubric_analyzer import analyze_rubric_images, analyze_rubric_text
from app.services.document_service import document_pages

router = APIRouter(prefix="/rubrics", tags=["rubrics"])


class RubricAnalysisRequest(BaseModel):
    source_text: str = Field(min_length=20, max_length=100_000)


@router.post("/analyze")
async def analyze(request: RubricAnalysisRequest) -> dict:
    try:
        questions = await analyze_rubric_text(request.source_text)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"questions": [question.model_dump() for question in questions], "teacher_review_required": True}


@router.post("/analyze-upload")
async def analyze_upload(files: list[UploadFile] = File(...)) -> dict:
    pages = []
    for file in files:
        pages.extend(await document_pages(file))
    if not pages or len(pages) > 30:
        raise HTTPException(413, "Evaluation schemes must contain between 1 and 30 pages.")
    try:
        questions = await analyze_rubric_images(pages)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"questions": [question.model_dump() for question in questions], "teacher_review_required": True}
