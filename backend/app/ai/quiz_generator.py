"""Generate weakness-specific practice and novel retests with Qwen3 text reasoning."""

from app.ai.model_router import AITask, model_router
from app.prompts.quiz_prompt import QUIZ_PROMPT
from app.schemas.quiz_schema import GeneratedQuiz


async def generate_quiz(
    *, concept: str, sub_concept: str | None, mistake_patterns: list[str],
    previously_answered: list[str], previous_quiz_performance: str | None, count: int = 5,
) -> GeneratedQuiz:
    prompt = (f"{QUIZ_PROMPT}\nWeak concept: {concept}\nWeak sub-concept: {sub_concept}\n"
              f"Mistake patterns: {mistake_patterns}\nPrior questions to avoid repeating: {previously_answered}\n"
              f"Previous practice performance: {previous_quiz_performance}\nGenerate exactly {count} questions.")
    generated = await model_router.generate(task=AITask.QUIZ, prompt=prompt, schema=GeneratedQuiz)
    if len(generated.questions) != count:
        raise ValueError(f"The local model returned {len(generated.questions)} questions; {count} were requested.")
    required_concepts = [item.strip().removeprefix("and ").casefold() for item in concept.split(",")]
    if len(required_concepts) > 1:
        covered = [question.concept.casefold() for question in generated.questions]
        missing = [required for required in required_concepts
                   if not any(required in item or item in required for item in covered)]
        if missing:
            raise ValueError("The local quiz missed a requested weak concept: " + ", ".join(missing))
    return generated
