from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.schemas.chat_schema import StudentChatRequest
from app.services.learning_service import answer_student_question, create_learning_plan

router = APIRouter(prefix="/learning", tags=["learning"])


class LearningPlanRequest(BaseModel):
    concept: str = Field(min_length=1, max_length=120)
    sub_concept: str | None = Field(default=None, max_length=120)
    evidence: list[str] = Field(default_factory=list, max_length=20)
    mistake_patterns: list[str] = Field(default_factory=list, max_length=20)


@router.post("/plan")
async def learning_plan(request: LearningPlanRequest) -> dict:
    result = await create_learning_plan(concept=request.concept, sub_concept=request.sub_concept,
                                        evidence=request.evidence, mistake_patterns=request.mistake_patterns)
    return result.model_dump()


@router.post("/chat")
async def student_chat(request: StudentChatRequest) -> dict:
    """Answer student questions through the configured local-first model router."""
    result = await answer_student_question(request)
    return result.model_dump()
