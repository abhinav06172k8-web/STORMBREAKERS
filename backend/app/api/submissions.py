import asyncio
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import TypeAdapter

from app.ai.answer_analyzer import extract_page
from app.services.document_service import document_pages
from app.schemas.rubric_schema import RubricQuestion
from app.services.evaluation_pipeline import evaluate_submission

router = APIRouter(prefix="/submissions", tags=["submissions"])


@router.post("/extract-page")
async def extract_answer_page(page_number: int = Form(1), file: UploadFile = File(...)) -> dict:
    pages = await document_pages(file)
    image = pages[0]
    extraction = await extract_page(page_number, image)
    return extraction.model_dump()


@router.post("/extract")
async def extract_submission(files: list[UploadFile] = File(...)) -> dict:
    page_images: list[bytes] = []
    for file in files:
        page_images.extend(await document_pages(file))
    results = await asyncio.gather(*(extract_page(index, image) for index, image in enumerate(page_images, 1)),
                                   return_exceptions=True)
    answers = []
    processing_errors = []
    for page_number, result in enumerate(results, 1):
        if isinstance(result, Exception):
            processing_errors.append({"page": page_number, "status": "uncertain",
                                      "reason": "This page could not be analyzed. Teacher review recommended."})
            continue
        answers.extend([item.model_dump() for item in result.answers])
        processing_errors.extend({"page": page_number, "status": "uncertain", "reason": region}
                                 for region in result.unreadable_regions)
    return {"answers": answers, "review_required": bool(processing_errors),
            "issues": processing_errors,
            "message": "Some parts of this answer sheet could not be read clearly." if processing_errors else None}


@router.post("/evaluate")
async def evaluate_uploaded_submission(
    files: list[UploadFile] = File(...), rubric_json: str = Form(...),
) -> dict:
    try:
        rubric = TypeAdapter(list[RubricQuestion]).validate_python(json.loads(rubric_json))
    except Exception as exc:
        raise HTTPException(422, "Provide a valid teacher-reviewed rubric as rubric_json.") from exc
    if not rubric or len(rubric) > 30:
        raise HTTPException(422, "Rubric must contain between 1 and 30 questions.")
    pages = []
    for file in files:
        pages.extend(await document_pages(file))
    return await evaluate_submission(pages, rubric)
