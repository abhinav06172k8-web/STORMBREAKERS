from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Literal
from uuid import uuid4

from app.ai.quiz_generator import generate_quiz
from app.services.cache_service import get_json, set_json

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


class QuizRequest(BaseModel):
    concept: str
    sub_concept: str | None = None
    mistake_patterns: list[str] = Field(default_factory=list)
    previously_answered: list[str] = Field(default_factory=list)
    previous_quiz_performance: str | None = None
    previous_session_id: str | None = None
    count: int = Field(default=5, ge=3, le=5)
    assessment_type: Literal["practice", "retest"] = "practice"


class QuizAnswer(BaseModel):
    question_index: int = Field(ge=0)
    answer: str


class QuizSubmission(BaseModel):
    answers: list[QuizAnswer]


@router.post("/generate")
async def create_quiz(request: QuizRequest) -> dict:
    previous_score = None
    previous_questions = list(request.previously_answered)
    if request.previous_session_id:
        previous, _ = await get_json(f"quiz-result:{request.previous_session_id}")
        session, _ = await get_json(f"quiz-session:{request.previous_session_id}")
        if (previous and session
                and session.get("concept", "").casefold() == request.concept.casefold()):
            previous_score = previous["performance_estimate"]
            previous_questions.extend(item["question"] for item in session["questions"])
    try:
        generated = await generate_quiz(
            concept=request.concept, sub_concept=request.sub_concept,
            mistake_patterns=request.mistake_patterns, previously_answered=previous_questions,
            previous_quiz_performance=(request.previous_quiz_performance or
                                       (f"previous performance estimate: {previous_score}%" if previous_score is not None else None)),
            count=request.count,
        )
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    session_id = str(uuid4())
    record = {"session_id": session_id, "concept": request.concept,
              "assessment_type": request.assessment_type, "previous_score": previous_score,
              "questions": [item.model_dump() for item in generated.questions]}
    await set_json(f"quiz-session:{session_id}", record, ttl_seconds=90 * 86400)
    # Keep answer keys on the server until an attempt is submitted.
    return {"session_id": session_id, "concept": request.concept,
            "assessment_type": request.assessment_type,
            "questions": [{"question": item.question, "question_type": item.question_type,
                           "difficulty": item.difficulty, "concept": item.concept,
                           "sub_concept": item.sub_concept, "options": item.options}
                          for item in generated.questions]}


@router.post("/{session_id}/submit")
async def submit_quiz(session_id: str, submission: QuizSubmission) -> dict:
    record, _ = await get_json(f"quiz-session:{session_id}")
    if record is None:
        return {"error": "Quiz session was not found or has expired."}
    questions = record["questions"]
    answers = {item.question_index: item.answer.strip().casefold() for item in submission.answers}
    results = [{"question_index": index, "correct": answers.get(index, "") == question["correct_answer"].strip().casefold(),
                "correct_answer": question["correct_answer"], "explanation": question["explanation"]}
               for index, question in enumerate(questions)]
    score = sum(result["correct"] for result in results)
    total = len(questions)
    response = {"session_id": session_id, "score": score, "total": total,
                "performance_estimate": round(score / total * 100), "results": results}
    await set_json(f"quiz-result:{session_id}", response, ttl_seconds=90 * 86400)
    previous = record.get("previous_score")
    if previous is not None:
        response["comparison"] = {"before": previous, "after": round(score / total * 100),
                                  "improved": round(score / total * 100) > previous,
                                  "message": f"Performance signal {'improved' if round(score / total * 100) > previous else 'changed'} from {previous}% to {round(score / total * 100)}%."}
    return response
