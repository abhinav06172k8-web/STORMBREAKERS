"""Validated criterion-level evaluation contracts."""

from typing import Literal

from pydantic import BaseModel, Field


class CriterionEvaluation(BaseModel):
    criterion_id: str
    status: Literal["satisfied", "partially_satisfied", "missing", "incorrect", "uncertain"]
    evidence: str
    explanation: str
    confidence: float = Field(ge=0, le=1)
    teacher_review_recommended: bool = False


class QuestionEvaluation(BaseModel):
    question_number: int
    criteria_evaluation: list[CriterionEvaluation]
