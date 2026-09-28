"""Rubric-grounded criterion reasoning followed by deterministic Python scoring."""

from pydantic import BaseModel, Field

from app.ai.model_router import AITask, model_router
from app.core.config import settings
from app.prompts.feedback_prompt import CRITERION_EVALUATION_PROMPT
from app.schemas.rubric_schema import RubricQuestion
from app.services.scoring_service import calculate_total, score_criterion


class CriterionJudgement(BaseModel):
    criterion_id: str
    status: str
    evidence: str
    explanation: str
    confidence: float = Field(ge=0, le=1)


class Judgements(BaseModel):
    criteria: list[CriterionJudgement]


def _normalized(text: str) -> str:
    return " ".join(text.casefold().split()).strip(" \"'`.,;:")


async def evaluate_question(question: RubricQuestion, answer_text: str) -> dict:
    rubric = [criterion.model_dump() for criterion in question.criteria]
    prompt = (f"{CRITERION_EVALUATION_PROMPT}\nQuestion: {question.question_text}\n"
              f"Rubric criteria (source of truth): {rubric}\nStudent answer: {answer_text}")
    judgements = await model_router.generate(task=AITask.EVALUATION, prompt=prompt, schema=Judgements)
    by_id = {item.criterion_id: item for item in judgements.criteria}
    evaluations: list[dict] = []
    scores = []
    for criterion in question.criteria:
        item = by_id.get(criterion.id)
        if item is None:
            item = CriterionJudgement(
                criterion_id=criterion.id, status="uncertain", evidence="No validated judgement returned.",
                explanation="This criterion needs teacher review.", confidence=0.0,
            )
        if item.status not in {"satisfied", "partially_satisfied", "missing", "incorrect", "uncertain"}:
            item.status = "uncertain"
        evidence = _normalized(item.evidence)
        fixed_absence_evidence = "no corresponding requirement was located in the submitted answer"
        if item.status in {"satisfied", "partially_satisfied", "incorrect"} and (
            not evidence or evidence not in _normalized(answer_text)
        ):
            item.status = "uncertain"
            item.explanation = "The returned evidence could not be matched to the extracted answer."
        if item.status == "missing" and evidence != fixed_absence_evidence:
            item.status = "uncertain"
            item.explanation = "The absence claim did not use the required evidence marker."
        if not item.evidence.strip():
            item.status = "uncertain"
            item.evidence = "No reliable student-answer evidence was returned."
        elif item.status == "missing":
            item.evidence = "No corresponding requirement was located in the submitted answer."
        marks = score_criterion(status=item.status, max_marks=criterion.max_marks, status_marks=criterion.status_marks)
        review = item.confidence < settings.ai_confidence_threshold or item.status == "uncertain"
        evaluations.append({
            "criterion_id": criterion.id,
            "criterion": criterion.description,
            "concept": criterion.concept,
            "sub_concept": criterion.sub_concept,
            "expected": criterion.expected_elements,
            "student_evidence": item.evidence,
            "status": item.status,
            "awarded_marks": marks.awarded_marks,
            "max_marks": criterion.max_marks,
            "confidence": item.confidence,
            "explanation": item.explanation,
            "teacher_review_recommended": review,
        })
        scores.append(marks)
    return {"question_number": question.question_number, "question_text": question.question_text,
            "criteria_evaluation": evaluations,
            "question_score": calculate_total(scores), "max_marks": question.max_marks}
