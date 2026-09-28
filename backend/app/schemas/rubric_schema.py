"""Strict structured rubric contracts."""

from pydantic import BaseModel, Field, model_validator


class Criterion(BaseModel):
    id: str
    description: str
    max_marks: float = Field(gt=0)
    expected_elements: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    concept: str | None = None
    sub_concept: str | None = None
    status_marks: dict[str, float] = Field(default_factory=dict)

    @model_validator(mode="after")
    def marks_within_criterion(self):
        for status, marks in self.status_marks.items():
            if status not in {"satisfied", "partially_satisfied", "missing", "incorrect", "uncertain"}:
                raise ValueError(f"Unsupported rubric mark rule: {status}")
            if marks < 0 or marks > self.max_marks:
                raise ValueError("Status marks must be between zero and criterion maximum")
        return self


class RubricQuestion(BaseModel):
    question_number: int = Field(gt=0)
    question_text: str
    max_marks: float = Field(gt=0)
    concepts: list[str] = Field(default_factory=list)
    criteria: list[Criterion]

    @model_validator(mode="after")
    def criterion_maxima_match_question(self):
        if not self.criteria:
            raise ValueError("A rubric question needs at least one criterion")
        allocated = sum(item.max_marks for item in self.criteria)
        if abs(allocated - self.max_marks) > 0.001:
            raise ValueError("Criterion maximum marks must add up to the question maximum")
        return self
