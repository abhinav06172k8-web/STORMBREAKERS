"""Targeted learning plans and contextual study chat, grounded in rubric evidence."""

import json

from pydantic import BaseModel, Field

from app.ai.model_router import AITask, model_router
from app.prompts.chat_prompt import STUDENT_CHAT_PROMPT
from app.schemas.chat_schema import StudentChatRequest, StudentChatResponse


class LearningPlan(BaseModel):
    concept: str
    sub_concept: str | None = None
    misunderstanding: str
    short_explanation: str
    key_ideas: list[str] = Field(min_length=3, max_length=5)
    targeted_practice: list[str] = Field(min_length=2, max_length=5)
    next_step: str


async def create_learning_plan(*, concept: str, sub_concept: str | None,
                               evidence: list[str], mistake_patterns: list[str]) -> LearningPlan:
    prompt = ("Create a concise learning recovery plan using only this rubric-based diagnosis. "
              "Do not invent what the student wrote. Be specific to the weak concept and sub-concept. "
              "Return a short explanation, 3-5 key ideas, targeted practice actions, and a re-test next step. "
              f"Concept: {concept}\nSub-concept: {sub_concept}\nEvidence: {evidence}\n"
              f"Mistake patterns: {mistake_patterns}")
    return await model_router.generate(task=AITask.LEARNING_PLAN, prompt=prompt, schema=LearningPlan)


async def answer_student_question(request: StudentChatRequest) -> StudentChatResponse:
    """Answer one student turn with bounded history and the supplied rubric context."""
    prompt = STUDENT_CHAT_PROMPT.format(
        context=json.dumps(request.context.model_dump(exclude_none=True), ensure_ascii=False),
        history=json.dumps([turn.model_dump() for turn in request.history[-8:]], ensure_ascii=False),
        message=request.message.strip(),
    )
    return await model_router.generate(task=AITask.STUDENT_CHAT, prompt=prompt, schema=StudentChatResponse)
