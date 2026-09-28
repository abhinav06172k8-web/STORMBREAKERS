"""Targeted practice and re-test contracts."""

from pydantic import BaseModel, Field, model_validator


class QuizQuestion(BaseModel):
    question: str
    question_type: str
    difficulty: int = Field(ge=1, le=5)
    concept: str
    sub_concept: str | None = None
    options: list[str] = Field(min_length=2, max_length=4)
    correct_answer: str
    explanation: str

    @model_validator(mode="after")
    def correct_answer_is_an_option(self):
        if self.correct_answer.strip().casefold() not in {option.strip().casefold() for option in self.options}:
            raise ValueError("correct_answer must match one of the provided options")
        return self


class GeneratedQuiz(BaseModel):
    questions: list[QuizQuestion] = Field(min_length=1, max_length=10)
