"""End-to-end extraction → mapping → criterion evaluation → deterministic scoring."""

import asyncio
from collections import defaultdict

from app.ai.answer_analyzer import extract_page
from app.ai.concept_detector import detect_concepts
from app.ai.evaluator import evaluate_question
from app.core.config import settings
from app.schemas.rubric_schema import RubricQuestion


async def evaluate_submission(images: list[bytes], rubric: list[RubricQuestion]) -> dict:
    extracted = await asyncio.gather(
        *(extract_page(index, image) for index, image in enumerate(images, start=1)),
        return_exceptions=True,
    )
    mapped: dict[int, list[str]] = {}
    unresolved: list[dict] = []
    extracted_records = []
    raw_teacher_marks = []
    teacher_marks_review = []
    mapping_uncertain = False
    for page_number, result in enumerate(extracted, start=1):
        if isinstance(result, Exception):
            unresolved.append({"page": page_number, "reason": "Page analysis failed; teacher review recommended."})
            teacher_marks_review.append({"page": page_number, "reason": "Could not inspect this page for teacher-awarded marks."})
            mapping_uncertain = True
            continue
        if result.unreadable_regions:
            unresolved.extend({"page": page_number, "reason": reason} for reason in result.unreadable_regions)
            mapping_uncertain = True
        raw_teacher_marks.extend(result.teacher_marks)
        for answer in result.answers:
            extracted_records.append(answer.model_dump())
            if answer.status == "uncertain" or answer.confidence < settings.ai_confidence_threshold:
                unresolved.append({"page": page_number, "question_number": answer.question_number,
                                   "reason": answer.reason or "Answer text is uncertain."})
                mapping_uncertain = True
                continue
            if answer.question_number is None:
                unresolved.append({"page": page_number, "reason": "Could not reliably map this answer to a question."})
                mapping_uncertain = True
                continue
            mapped.setdefault(answer.question_number, []).append(answer.answer_text or "")

    evaluation_jobs = []
    unresolved_questions = []
    for question in rubric:
        parts = mapped.get(question.question_number)
        if not parts or not any(part.strip() for part in parts):
            unresolved_questions.append(question.question_number)
            continue
        evaluation_jobs.append(evaluate_question(question, "\n".join(parts)))
    results = await asyncio.gather(*evaluation_jobs, return_exceptions=True)
    evaluations = []
    for result in results:
        if isinstance(result, Exception):
            unresolved.append({"reason": "A question evaluation failed; teacher review recommended."})
            mapping_uncertain = True
        else:
            evaluations.append(result)
    unresolved.extend({"question_number": number, "reason": "No reliable answer segment was mapped to this rubric question."}
                      for number in unresolved_questions)
    finalized = not mapping_uncertain and not unresolved_questions and len(evaluations) == len(rubric)
    rubric_by_number = {question.question_number: question for question in rubric}
    question_mark_candidates: dict[int, list] = defaultdict(list)
    paper_mark_candidates = []
    for mark in raw_teacher_marks:
        if mark.status != "readable" or mark.confidence < settings.ai_confidence_threshold or mark.awarded_marks is None:
            teacher_marks_review.append({"page": mark.page, "question_number": mark.question_number,
                                         "reason": mark.reason or "Teacher mark is uncertain; please review the paper."})
            continue
        if mark.scope == "paper":
            max_total = sum(question.max_marks for question in rubric)
            if mark.awarded_marks > max_total:
                teacher_marks_review.append({"page": mark.page, "reason": "Detected paper total exceeds the rubric maximum; please review."})
            else:
                paper_mark_candidates.append(mark)
            continue
        question = rubric_by_number.get(mark.question_number or -1)
        if question is None:
            teacher_marks_review.append({"page": mark.page, "question_number": mark.question_number,
                                         "reason": "Teacher mark could not be mapped to a rubric question."})
        elif mark.awarded_marks > question.max_marks:
            teacher_marks_review.append({"page": mark.page, "question_number": question.question_number,
                                         "reason": f"Detected score exceeds Q{question.question_number}'s {question.max_marks}-mark maximum."})
        else:
            question_mark_candidates[question.question_number].append(mark)

    teacher_awarded_marks = []
    for question_number, candidates in question_mark_candidates.items():
        values = {round(mark.awarded_marks, 2) for mark in candidates}
        if len(values) > 1:
            teacher_marks_review.append({"question_number": question_number,
                                         "reason": "More than one conflicting teacher score was detected for this question."})
            continue
        mark = max(candidates, key=lambda item: item.confidence)
        teacher_awarded_marks.append({"question_number": question_number, "awarded_marks": mark.awarded_marks,
                                      "confidence": mark.confidence, "page": mark.page, "evidence": mark.evidence,
                                      "source": "vision"})
    teacher_awarded_marks.sort(key=lambda item: item["question_number"])

    teacher_paper_score = None
    if paper_mark_candidates:
        paper_values = {round(mark.awarded_marks, 2) for mark in paper_mark_candidates}
        if len(paper_values) == 1:
            teacher_paper_score = max(paper_mark_candidates, key=lambda item: item.confidence).awarded_marks
        else:
            teacher_marks_review.append({"reason": "More than one conflicting teacher paper total was detected."})
    if teacher_paper_score is None and len(teacher_awarded_marks) == len(rubric):
        teacher_paper_score = sum(item["awarded_marks"] for item in teacher_awarded_marks)
    if teacher_paper_score is not None and len(teacher_awarded_marks) == len(rubric):
        question_total = sum(item["awarded_marks"] for item in teacher_awarded_marks)
        if abs(question_total - teacher_paper_score) > 0.01:
            teacher_marks_review.append({"reason": "The written paper total differs from the sum of readable question marks."})
    teacher_marks_status = ("detected" if teacher_awarded_marks or teacher_paper_score is not None
                            else "uncertain" if teacher_marks_review else "not_found")
    criteria = [criterion for item in evaluations for criterion in item["criteria_evaluation"]]
    try:
        concept_signals = await detect_concepts(criteria) if criteria else None
        concepts = [item.model_dump() for item in concept_signals.concepts] if concept_signals else []
    except Exception:
        concepts = []
    return {
        "answers": extracted_records,
        "questions": evaluations,
        "paper_score": sum(item["question_score"] for item in evaluations) if finalized else None,
        "paper_max_marks": sum(question.max_marks for question in rubric),
        "provisional_subtotal": sum(item["question_score"] for item in evaluations),
        "concepts": concepts,
        "finalized": finalized,
        "teacher_review_recommended": not finalized or any(
            criterion["teacher_review_recommended"]
            for result in evaluations for criterion in result["criteria_evaluation"]
        ),
        "teacher_awarded_marks": teacher_awarded_marks,
        "teacher_paper_score": teacher_paper_score,
        "teacher_marks_status": teacher_marks_status,
        "teacher_marks_review": teacher_marks_review,
        "unresolved": unresolved,
    }
