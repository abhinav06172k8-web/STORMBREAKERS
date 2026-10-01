# EDUPLUS

A local-first learning workspace: teachers publish reviewed marking schemes, students join by code, and full-paper feedback leads into explanations, fresh practice and progress charts.

## Run locally

Requirements: Python 3.11+, Node 20+, and Ollama with a text model and a vision model.

```bash
cp .env.example .env
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
ollama pull qwen3:8b
ollama pull qwen3-vl:4b
uvicorn app.main:app --reload
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The API defaults to `http://localhost:8000`; change `VITE_API_BASE_URL` in the root `.env` if the backend uses another port. During local development Vite proxies `/api` to that address, avoiding browser origin mismatches. Interactive API docs: `/docs`. If your installed vision tag is `qwen3-vl:4b-instruct`, set `OLLAMA_VISION_MODEL=qwen3-vl:4b-instruct` in `.env`. `/api/ai/health` checks the exact configured model names. The root `.env` is resolved from the configuration file location, regardless of the launch directory. Restart the backend after changing model settings.

Both `http://localhost:5173` and `http://127.0.0.1:5173` are allowed local frontend origins. If Vite chooses another port, add its exact origin to `CORS_ORIGINS` in `.env` and restart the backend.

## Connected workflow

1. **Teacher workspace:** create a local teacher profile, enter an exam title and subject, and upload the evaluation scheme (PDF or images). The sample button creates a real, downloadable Python scheme image. Open/Save controls work for both real and sample files.
2. **Review:** Ollama transcribes the pages and converts them into editable marking criteria. Check the extracted question text, expected elements and marks before publishing. The server validates mark totals and unique identifiers. Published schemes are immutable snapshots; publish a new scheme for revisions.
3. **Share:** publishing creates a random, persistent 10-character code. The teacher can copy and reuse it. Switch to a student workspace, on this device or another browser that can reach the same backend.
4. **Student workspace:** enter the teacher's code, confirm the subject and exam, then upload all answer pages in order. Students cannot publish schemes or change the server's evaluation rubric. The built-in answer sample matches the built-in Python scheme; use its teacher-published code.
5. **Analysis:** inspect question coverage, evidence, explanations and learning priorities. Unreadable/unmapped pages withhold the complete score; fully failed extraction produces an actionable error, never a zero grade. Estimates remain advisory and are explicitly flagged when teacher review is needed.
6. **Practice:** select any topic or a paper-specific priority. Generate a simple explanation or five fresh questions. Answer keys stay on the server until submission. Previous questions are supplied to the model; exact/near-identical questions, reused code snippets, duplicate answer options and insufficient variety trigger bounded retries. Fresh sets can reference previous performance.
7. **Progress:** view real saved paper results, filtered by subject and normalized to percentages. Partial results and results requiring teacher review are excluded from trend charts. A first result establishes a baseline; no invented historical scores appear.
8. **Ask EDU:** open the companion from any workspace. It supports general subjects, planning, motivation and emotional encouragement, with bounded conversation history and optional paper evidence.

## Processing and performance

- Ollama is the default and no cloud model is silently substituted. Text uses `OLLAMA_TEXT_MODEL`; page vision uses `OLLAMA_VISION_MODEL`.
- Transfers report real upload percentages. Analysis then runs as a background task with persisted status and page/question completion counts. Polling reconnects after a temporary network failure; reload restores the active job reference from the browser.
- Scheme pages are transcribed individually to avoid overflowing one multi-image model request. PDFs are rendered off the async event loop and resized to the configured vision dimensions.
- Extraction and scheme analysis are cached in SQLite/PostgreSQL. SQLite timestamp handling is normalized so repeated documents can actually use the cache.
- Plain digital PDF pages use their native text. Scans, diagrams and annotated pages retain vision processing and its extraction checks. Reliable criterion evaluations are cached against the full rubric, answer, model and prompt; uncertain results are not cached.
- Evaluations reference numbered source passages; the server copies their exact text. This avoids false review flags caused by the model retyping OCR spacing or formulas. Review notices explain each unresolved criterion. **Recheck flagged evidence** retries only flagged criteria with readable saved text, preserves other marks, and archives the previous result. Teacher-reviewed papers cannot be overwritten this way.
- Question and paper marks are calculated in Python. Concept progress is aggregated directly from criterion evidence, avoiding an unnecessary extra model call.
- Ollama receives structural JSON schemas without large string-length grammar repetitions; full Pydantic validation still runs afterward. All fields are explicitly requested. Invalid responses get one repair attempt and then a clear error. Schema grounding follows [Ollama’s structured-output guidance](https://docs.ollama.com/capabilities/structured-outputs).
- The default model context is 8,192 tokens (`OLLAMA_CONTEXT_LENGTH`). Actual local inference speed depends on your computer, model loading and document size. Multi-page work can still take minutes; status describes completed work rather than simulated progress.
- Practice generation retries invalid or repeated sets up to three times, with an eight-minute total generation limit so an actionable error can reach the browser before its request times out.
- Practice offers quick three-question and full five-question sets. A separate model pass checks every answer choice, topic fit and explanation before publication. Only checked, unseen sets can be reused from cache; this improves repeat latency but is not a guarantee of factual correctness. New questions and repairs still need local inference.
- Progress includes clearly labelled provisional paper estimates by default, with an option to exclude them. Practice results are stored durably and charted separately by topic. Available older quiz sessions are recovered; expired sessions cannot be reconstructed. The screen refreshes on navigation, focus and every 20 seconds while visible.
- Graphs load separately from the entry/upload screens. The UI uses lightweight CSS holographic visuals, responsive layouts, and reduced-motion support.

## Local data and identities

`workspace_records` stores local profiles, reviewed schemes, job status and analysis history, separately from expiring AI caches. Records are created automatically in the configured database. Profile bearer tokens are stored on the current browser; the database stores their SHA-256 lookup hashes. Scheme publishing is teacher-only, answer processing is student-only, and job/history reads are owner-scoped.

These are **local device profiles, not verified school accounts**. Anyone can create a profile and select its role. Do not expose this prototype as a public school service without verified authentication, teacher provisioning, deployment authorization/rate limits, retention controls and private storage. Clearing browser storage loses access to that browser's profile unless its session is retained elsewhere. Original upload files are held only during processing; derived extraction/feedback is retained in the database.

Jobs currently run within a **single API process**. Use one worker. Status survives a process restart, but in-flight work cannot resume; such jobs are marked interrupted and require re-upload. A production queue, job cancellation and cross-device account recovery are future extensions.

## Videos and Firebase

YouTube retrieval uses the backend-only `YOUTUBE_API_KEY` when `YOUTUBE_ENABLED=true`. It searches a larger candidate set, ranks by topic/lesson signals and capped audience engagement, limits repeated channels, excludes extremely short/long results, and caches metadata. These are relevance-ranked suggestions, not a guarantee of teaching quality. Missing credentials or quota/network failures show a clear fallback instead of unrelated hardcoded links. Only the topic query goes to YouTube; documents are not sent there.

The learning library searches by subject or topic and plays selected lessons in an embedded player beside a playlist. It first uses the configured YouTube Data API when available; if it is absent or unavailable, it falls back to an unauthenticated public video-search provider. The fallback has no API-key setup but its availability and results are outside EDUPlus’s control. Results are filtered before display where metadata is available, but creators or regional restrictions can still prevent playback. See [YouTube's player documentation](https://developers.google.com/youtube/player_parameters).

Firebase is **not connected yet**. The current persistence works locally without it. Verified class comparisons/top-student charts are intentionally waiting for the school's real authorized data and identity setup. The UI does not fabricate class rankings. Firebase project configuration and the intended teacher/student access rules are needed for that integration.

## Verification

```bash
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

Tests run in a temporary SQLite database, with mocked model inference. They cover role boundaries, scheme code lookup, server-authoritative rubrics, job privacy/persistence/failure, multi-page coverage, missing answers, invalid documents, cache reuse, quiz submission validation, repeated question rejection and Ollama schema/response handling.

```bash
cd frontend
npm run build
npm run format:check
```

The actual sample flow can also be exercised through the browser with installed Ollama models; it is not a precomputed demo result.

## Teaching centre and learning plan

- **Accounts:** sign in with a username and password, or continue with an existing local device profile. In Teaching centre/Classrooms, expand **Keep this profile and add password sign-in** to retain its existing papers and schemes while adding a password. Account sessions expire after seven days; signing out revokes the current session. Passwords use salted PBKDF2 and only session hashes are stored. These are accounts on this EDUPlus installation, not verified school identities. Password recovery, school SSO and administrator verification are not implemented.
- **Classrooms:** teachers create a class and share its invitation code. Students join, see assignments and deadlines, and open an assignment before submitting so the result is linked to that class. Late submissions are accepted and labelled. Teachers assign an existing scheme with a future deadline; class assignments and completed reviews appear in student notifications.
- **Teacher reviews:** papers submitted against a teacher’s schemes appear in their review queue. Review every criterion, enter a reason and overall feedback, then save. Original AI evaluations remain stored; student results use reviewed marks and show the reviewer. Version checks prevent overwriting a newer review, and each revision is kept in an audit history. Students can request a review from the answer-evidence viewer.
- **Answer evidence:** Paper insights shows the extracted answer beside the marking guide. Exact matching evidence excerpts are highlighted; unmatched excerpts are shown separately. This is text evidence, not a claim of pixel-accurate annotation on the uploaded page.
- **Learning plan:** the mistake notebook groups reliable feedback by concept and links back to its source paper. Schedule a concept to get a three-question revision session. Server-scored results of at least 80% double the review interval (minimum two, maximum 30 days); lower results return the next day. The next quiz receives the prior result and a foundation/challenge instruction. These are learning signals, not validated mastery scores.
- **Class heatmap:** only teacher-reviewed results linked to class assignments contribute. Click a concept to assign a three-question practice task with a deadline. Repeat submissions contribute as separate attempts; the interface reports the sample size.
- **Evaluation quality:** compares original complete AI estimates with teacher reviews and reports mean absolute percentage-point difference. Job failure counts and average processing time use recorded jobs for the teacher’s schemes, with timed-sample counts; older jobs may lack timing. No unmeasured model accuracy is displayed.
- **Draft recovery:** scheme edits save per profile locally and to the server. Unpublished completed scheme jobs can restore an initial draft. Polling reconnects after transient failures. Interrupted jobs are marked failed with retry guidance; source uploads must be reselected after browser refresh, since original files are not persisted by this workflow.

New functionality is covered by `backend/tests/test_academy.py`. Run `python -m unittest discover -s tests -v` from `backend/` and `npm run build` from `frontend/`.
# EDUPULSE
