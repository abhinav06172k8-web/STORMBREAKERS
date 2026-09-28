# EDUPLUS

EDUPLUS is an AI-assisted answer-sheet analysis and personalized learning platform. Its central workflow compares student answers against a teacher-reviewed rubric, explains criterion-level marks, identifies learning gaps, and creates targeted practice and re-tests.

## Architecture

This MVP uses a modular monolith: one React client and one FastAPI application, with explicit boundaries between HTTP APIs, business services, persistence, and AI provider orchestration.

```text
frontend/                 React + Vite + TypeScript + Tailwind
backend/app/
  api/                    HTTP routes by product domain
  ai/                     Provider interface and specialized workflows
  services/               Scoring, documents, learning, resources
  models/                 Persistence entities
  schemas/                Validated API/AI contracts
  db/                     Database configuration and migrations
  prompts/                Focused, versionable model instructions
  utils/                  File validation, image processing, logging
```

The scoring service owns all score arithmetic. AI proposes criterion-level evidence and scores; validated outputs are bounded by criterion maxima, and totals are calculated by backend code. Teacher review/override is the authority for published evaluations.

## Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS, Recharts
- Backend: Python, FastAPI, Pydantic, SQLAlchemy
- Data/services: PostgreSQL or local SQLite cache; Supabase Auth, private Storage, and RLS remain deployment options
- AI: local Ollama by default (`qwen3:8b` reasoning and `qwen3-vl:4b` vision), isolated behind the model router
- Learning resources: YouTube Data API (metadata only)

## Local setup

Requirements: Node.js 20+, Python 3.11+, and Ollama 0.12.7 or newer for Qwen3-VL. No AI API key is needed for the default local provider. The Ollama model tags are `qwen3:8b` and [`qwen3-vl:4b`](https://ollama.com/library/qwen3-vl).

Install the local models once:

```bash
ollama pull qwen3:8b
ollama pull qwen3-vl:4b
```

Ollama serves its local HTTP API at `http://localhost:11434` by default. The application reuses one async HTTP client, keeps models resident for the configured `OLLAMA_KEEP_ALIVE`, and bounds simultaneous inference requests with `AI_MAX_CONCURRENT_TASKS`.

```bash
cp .env.example .env
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

The API is served at `http://localhost:8000`; interactive API docs are at `/docs`. The frontend dev server uses `VITE_API_BASE_URL` (default `http://localhost:8000`).

## Local AI routing and pipeline

`AI_PROVIDER=local` is the default. Vision tasks (page analysis, handwriting extraction, and visual evidence) route to `OLLAMA_VISION_MODEL` (`qwen3-vl:4b`). Text tasks (rubric interpretation, criterion evaluation, concept analysis, feedback/learning, quizzes, retests, and resource queries) route to `OLLAMA_TEXT_MODEL` (`qwen3:8b`). The router validates Ollama structured JSON against Pydantic schemas. It never falls back to a cloud provider when local inference fails. `AI_CLOUD_FALLBACK` defaults to `false`; cloud adapters are an opt-in extension point.

The answer-sheet endpoint accepts PDF and image uploads at `POST /api/v1/submissions/extract`. PDFs are rendered to pages, images are orientation-corrected/resized, and each page is analyzed under bounded concurrency. Low-confidence mapped regions can receive a second, cropped vision pass. Uncertain text/mappings remain flagged instead of being silently completed. For the complete local inference loop, `POST /api/v1/submissions/evaluate` accepts answer-sheet files and a teacher-reviewed `rubric_json` multipart field, then extracts answers, maps questions, evaluates criteria, detects concepts, and calculates the paper score. Unresolved question/page mappings keep the result provisional. Qwen returns criterion statuses/evidence/confidence only. Python maps statuses through rubric mark rules and calculates all criterion, question, and paper totals. Low confidence sets a teacher-review flag. The separate `POST /api/v1/evaluations/paper` endpoint accepts already extracted text and rubric objects.

Rubric analysis is available at `POST /api/v1/rubrics/analyze`; it uses Qwen3-8B for text and is cached in the configured database. `POST /api/v1/rubrics/analyze-upload` uses Qwen3-VL to transcribe image/PDF scheme pages, then Qwen3-8B to interpret the text. The teacher must review the returned rubric before relying on it. `POST /api/v1/learning/plan` generates a concept-specific learning plan. Generated quizzes are available at `POST /api/v1/quizzes/generate`, and attempts at `POST /api/v1/quizzes/{session_id}/submit`; generated questions and answer keys are persisted in the database cache, and a retest can reference the prior session ID. `GET /api/ai/health` reports Ollama reachability and missing model tags. `GET /api/ai/settings` returns safe, non-secret runtime settings.

The local document, rubric, evaluation, and quiz path does not transmit student material to a cloud AI provider. YouTube search sends only a concept-based query from the backend when `YOUTUBE_ENABLED=true` and a server-side `YOUTUBE_API_KEY` is configured. Video metadata is cached in the database; quota/network failures degrade to the generated explanation and quiz. The API key is never returned to the frontend.

The database cache table is created lazily for local SQLite or PostgreSQL. A matching SQL migration note lives under `backend/app/db/migrations/`. In production, configure PostgreSQL/Supabase and add the application-specific ownership tables and RLS policies before exposing student records.

## Environment variables

See [.env.example](.env.example). Secrets belong only in the backend environment. Never expose Gemini, Supabase service-role, or YouTube credentials through `VITE_*` variables.

## Data model direction

Core entities: users, exams, questions, rubrics/criteria, submissions, extracted answers, criterion evaluations, student concept signals, quiz sessions/questions/attempts, and learning resources. The initial schema lives in `backend/app/db/migrations/`; Supabase RLS policies should scope teacher-owned exams and student-owned submissions. Uploaded files must use private buckets and short-lived signed URLs.

## AI pipeline

Specialized workflows are separated: rubric extraction, answer extraction, criterion evaluation, concept diagnosis, feedback, quiz generation, and resource-query generation. Each workflow should accept typed inputs and return Pydantic-validated output. Unreadable or ambiguous content must be flagged for review rather than guessed. The evaluator must not return a trusted total; `scoring_service` calculates totals from bounded criterion scores.

## Hackathon demo path

Start in **Demo mode** for a reliable 3–5 minute presentation. The prepared Python Programming / Python Unit Test journey works without Ollama or YouTube: review the editable 50-mark rubric, approve it, load Alex Morgan's sample answer, and inspect the 31/50 paper result. Open Q4 to see criterion scores and the submitted-answer excerpt that supports the lost-mark explanation. Continue through the recursion learning signal, five-question practice (sample attempt: 4/5), fresh re-test (sample result: 13/15), and three fallback learning resources.

The approved rubric is retained in the browser session. To demonstrate live inference, switch **Demo mode** off, start Ollama with `qwen3:8b` and `qwen3-vl:4b`, then use an actual PDF/image upload or the built-in Python scheme text. Live analysis gracefully reports local model errors; the cached sample flow remains available by turning Demo mode back on.

## Current scope and limitations

This prototype prioritizes the student-level rubric-to-improvement loop. Demo evaluation, quizzes, retest, and resources are preloaded presentation fixtures; they are intentionally not represented as model-generated results. Live rubric analysis, document extraction, criterion evaluation, deterministic backend scoring, learning-plan generation, quiz generation, and YouTube retrieval use the existing local-first services when configured. Authentication, role authorization, Supabase private file storage/RLS, and class analytics remain outside the hackathon demo scope. AI assessments are advisory and require teacher review before publication.
