"""Bounded, structured input and output for the contextual student chat helper."""

from typing import Literal

from pydantic import BaseModel, Field


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1200)


class ChatCriterionContext(BaseModel):
    criterion: str = Field(max_length=160)
    expected: list[str] = Field(default_factory=list, max_length=8)
    student_evidence: str = Field(default="", max_length=500)
    status: str = Field(default="", max_length=40)
    awarded_marks: float = Field(ge=0, le=100)
    max_marks: float = Field(ge=0, le=100)
    explanation: str = Field(default="", max_length=700)


class ChatQuestionContext(BaseModel):
    question_number: int = Field(ge=1, le=100)
    question_text: str = Field(default="", max_length=500)
    question_score: float = Field(ge=0, le=100)
    max_marks: float = Field(ge=0, le=100)
    criteria: list[ChatCriterionContext] = Field(default_factory=list, max_length=12)


class TeacherQuestionMarkContext(BaseModel):
    question_number: int = Field(ge=1, le=100)
    awarded_marks: float = Field(ge=0, le=100)


class StudentChatContext(BaseModel):
    exam_title: str = Field(default="", max_length=160)
    subject: str = Field(default="", max_length=120)
    paper_score: float | None = Field(default=None, ge=0, le=10000)
    teacher_paper_score: float | None = Field(default=None, ge=0, le=10000)
    paper_max_marks: float | None = Field(default=None, ge=0, le=10000)
    teacher_awarded_marks: list[TeacherQuestionMarkContext] = Field(default_factory=list, max_length=20)
    questions: list[ChatQuestionContext] = Field(default_factory=list, max_length=20)


class StudentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1200)
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)
    context: StudentChatContext = Field(default_factory=StudentChatContext)


class StudentChatResponse(BaseModel):
    answer: str = Field(min_length=1, max_length=3000)
    suggested_followups: list[str] = Field(default_factory=list, max_length=3)
