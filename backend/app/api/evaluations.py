import asyncio

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.ai.evaluator import evaluate_question
from app.schemas.rubric_schema import RubricQuestion
from app.ai.concept_detector import detect_concepts

router = APIRouter(prefix="/evaluations", tags=["evaluations"])


class EvaluateAnswerRequest(BaseModel):
    rubric_question: RubricQuestion
    answer_text: str = Field(max_length=50_000)


class PaperQuestionAnswer(BaseModel):
    rubric_question: RubricQuestion
    answer_text: str = Field(max_length=50_000)


class EvaluatePaperRequest(BaseModel):
    questions: list[PaperQuestionAnswer] = Field(min_length=1, max_length=30)


@router.post("/question")
async def evaluate(request: EvaluateAnswerRequest) -> dict:
    return await evaluate_question(request.rubric_question, request.answer_text)


@router.post("/paper")
async def evaluate_paper(request: EvaluatePaperRequest) -> dict:
    # Model calls run concurrently but share the router's bounded local inference semaphore.
    results = await asyncio.gather(*(
        evaluate_question(item.rubric_question, item.answer_text) for item in request.questions
    ))
    paper_score = sum(result["question_score"] for result in results)
    paper_max = sum(result["max_marks"] for result in results)
    criteria = [criterion for result in results for criterion in result["criteria_evaluation"]]
    try:
        concepts = await detect_concepts(criteria)
        concept_data = [item.model_dump() for item in concepts.concepts]
    except Exception:
        concept_data = []
    return {"questions": results, "paper_score": paper_score, "paper_max_marks": paper_max,
            "concepts": concept_data, "teacher_review_recommended": any(
                item["teacher_review_recommended"] for result in results
                for item in result["criteria_evaluation"])}
