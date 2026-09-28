from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ExtractedAnswer(BaseModel):
    page: int = Field(ge=1)
    question_number: int | None = None
    answer_text: str | None = None
    bounding_box: list[float] | None = None
    confidence: float = Field(ge=0, le=1)
    status: Literal["readable", "partial", "uncertain"] = "readable"
    reason: str | None = None

    @model_validator(mode="after")
    def require_uncertainty_reason(self):
        if self.status == "uncertain" and not self.reason:
            self.reason = "Handwriting or question mapping is unclear."
        return self


class ExtractedTeacherMark(BaseModel):
    page: int = Field(ge=1)
    scope: Literal["question", "paper"] = "question"
    question_number: int | None = Field(default=None, ge=1)
    awarded_marks: float | None = Field(default=None, ge=0)
    bounding_box: list[float] | None = None
    confidence: float = Field(default=0, ge=0, le=1)
    status: Literal["readable", "uncertain"] = "readable"
    evidence: str | None = None
    reason: str | None = None

    @model_validator(mode="after")
    def require_explicit_mark(self):
        if self.confidence == 0:
            self.status = "uncertain"
            self.reason = self.reason or "Teacher-mark confidence was not provided."
        if self.status == "uncertain":
            self.reason = self.reason or "Teacher-awarded mark is unclear."
            return self
        if self.awarded_marks is None or not self.evidence:
            self.status = "uncertain"
            self.reason = self.reason or "No explicit teacher-awarded score could be confirmed."
        elif self.scope == "question" and self.question_number is None:
            self.status = "uncertain"
            self.reason = self.reason or "The score could not be mapped to a question."
        return self


class PageExtraction(BaseModel):
    answers: list[ExtractedAnswer] = Field(default_factory=list)
    teacher_marks: list[ExtractedTeacherMark] = Field(default_factory=list)
    unreadable_regions: list[str] = Field(default_factory=list)
    continues_from_previous: bool = False
    continues_next_page: bool = False
