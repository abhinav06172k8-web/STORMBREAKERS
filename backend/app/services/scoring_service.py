"""Deterministic rubric-status mapping and score arithmetic."""

from pydantic import BaseModel, Field


class CriterionScore(BaseModel):
    awarded_marks: float = Field(ge=0)
    max_marks: float = Field(gt=0)


DEFAULT_STATUS_FRACTIONS = {
    "satisfied": 1.0,
    "partially_satisfied": 0.5,
    "missing": 0.0,
    "incorrect": 0.0,
    "uncertain": 0.0,
}


def score_criterion(*, status: str, max_marks: float, status_marks: dict[str, float] | None = None) -> CriterionScore:
    if max_marks <= 0:
        raise ValueError("Criterion max_marks must be positive")
    rules = status_marks or {}
    if status in rules:
        awarded = rules[status]
    elif status in DEFAULT_STATUS_FRACTIONS:
        awarded = max_marks * DEFAULT_STATUS_FRACTIONS[status]
    else:
        raise ValueError(f"Unknown criterion status: {status}")
    if awarded < 0 or awarded > max_marks:
        raise ValueError("Rubric status marks must be between zero and criterion maximum")
    return CriterionScore(awarded_marks=awarded, max_marks=max_marks)


def calculate_total(scores: list[CriterionScore]) -> float:
    for score in scores:
        if score.awarded_marks > score.max_marks:
            raise ValueError("Awarded marks cannot exceed the criterion maximum")
    return sum(score.awarded_marks for score in scores)
