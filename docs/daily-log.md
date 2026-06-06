# Daily Log

## Day 1 — May 13, 2026

### Completed
- Verified scaffold boots cleanly: Docker, FastAPI API, Next.js frontend, all green
- Upgraded Next.js 14.2.15 → 16.2.6 and React 18 → 19 to patch May 2026 CVEs
- Fixed Turbopack monorepo workspace root inference
- Removed deprecated `baseUrl` from tsconfig
- Replaced author placeholders across LICENSE, PRD, DL-001
- Initialized Alembic with async template, wired env.py to read from `app.core.config`
- Wrote first migration to enable pgvector extension
- Generated and applied `users` table migration
- Hit and resolved bcrypt 4.1+ vs passlib 1.7.4 incompatibility (pinned bcrypt==4.0.1)
- Tested register + login end-to-end via Swagger UI — auth flow live
- Added Resume, JobDescription, ResumeChunk SQLAlchemy models with cascading FKs and shared `parse_status` enum
- Generated and applied second migration; all 5 tables verified in DB
- Added decision logs DL-002 (Next 16 upgrade), DL-003 (audit findings triage), DL-004 (bcrypt pin)

### Notes / what surprised me
- Day 1 was 60% engineering, 40% supply-chain triage (npm audit warnings, Turbopack quirks, framework upgrades). Realized "the deps don't fight you" is something you build *toward*, not something that comes free.
- Found out the hard way that passlib hasn't been updated since 2020. Replacing it is on the v1.1 list.
- Reading auto-generated migration files closely caught a missing pgvector import — would have blown up the migration. The 30 seconds of review saved an hour of debugging.

### Tomorrow (Day 2)
- Build POST /resumes endpoint accepting PDF upload via FastAPI's UploadFile
- Implement async PDF parsing + token-aware chunking pipeline (pypdf + tiktoken)
- Generate embeddings via OpenAI `text-embedding-3-small` and store in pgvector
- Verify end-to-end with a real resume PDF — upload, parse, chunk, embed, retrieve top-k by similarity

## Day 2 — May 14, 2026

### Completed
- Added uploads volume and HNSW index migration (HNSW deferred — not needed at current scale)
- Built POST /resumes with HTTPBearer auth, file size + content-type validation, BackgroundTasks for async processing
- Built end-to-end parsing pipeline: pypdf extraction → tiktoken chunking → OpenAI text-embedding-3-small → pgvector storage
- Added structured error handling with rollback on failure; ParseStatus enum transitions atomic
- Added GET /resumes/{id}/search returning top-k chunks ranked by cosine similarity
- Tested end-to-end with own resume: parse → 3 chunks @ 1536 dims → semantic search returns relevant chunks

### Notes / what surprised me
- Spent ~2 hours debugging an "APIConnectionError" that was actually "API key was empty in container." Docker compose substitutes ${VAR} from project-root .env, not apps/api/.env. Two .env files, two different consumers.
- bcrypt 4.1+ vs passlib 1.7.4 → bcrypt 4.0.1 pin (caught on Day 1 too)
- Cosine similarity scores for text-embedding-3-small cluster in 0.2-0.5 for relevant matches. Relative ordering is what matters for RAG, not absolute scores.

### Tomorrow (Day 3)
- Build POST /job-descriptions with same parsing pipeline
- Add resume + JD skill-gap extraction service (LLM-driven JSON output)
- Update GET /resumes/{id} response to include chunk count and processing duration

## Day 3 — May 16, 2026

### Completed
- Built JD CRUD endpoints (POST /job-descriptions, GET list, GET by id) — no parsing pipeline; JD stored as raw text since it's used as prompt context, not retrieval target
- Built question generation service using OpenAI gpt-4o-mini with structured outputs (JSON schema enforcement)
- Iterated the system prompt v1 → v2 with documented changelog: fixed anchor-leakage from JD into resume, added required easy warm-up question, tightened type distribution
- Documented v1 vs v2 comparison in docs/AI-Pipelines/prompts/question_gen/ with identified root cause for remaining behavioral undershoot (resume content scarcity, not prompt issue)
- Added InterviewSession + InterviewQuestion models with three enum types
- Generated and applied 4th migration; verified 7 tables total
- Built POST /interviews (persists session + questions atomically), GET /interviews (list), GET /interviews/{id} (full session with questions)
- Fixed Pydantic v2 protected_namespaces warning for model_used field

### Notes / what surprised me
- Prompt iteration discovery: anchor field is the cleanest invariant to enforce. "Anchor must be verbatim from RESUME excerpts" became the most useful constraint — it forces the model to read the resume instead of hallucinating.
- Claude Code's review notes caught real bugs (HTTPException retry scope, Pydantic namespace) but also hallucinated about missing migrations twice. Treat reviews as candidate issues, verify in DB before acting.
- The v2 prompt fixed 2 of 3 issues. The third (behavioral undershoot) turned out to be a resume problem, not a prompt problem — captured in CHANGELOG as v3 backlog.

### Tomorrow (Day 4)
- Build the interview answer pipeline: POST /interviews/{id}/answers
- Build the evaluation service using Claude Sonnet (STAR + clarity + depth + relevance rubric)
- Add InterviewAnswer model with the rubric scores
- End the day able to submit an answer to a generated question and get a real rubric-based score back

## Day 4 — May 18, 2026

### Completed
- Added InterviewAnswer model with JSONB evaluation_json column and AnswerEvaluationStatus enum (pending / evaluating / completed / failed)
- Generated and applied 5th migration; 8 database tables now
- Built evaluation service using OpenAI gpt-4o-mini with structured outputs and a 4-dimension rubric:
  - Clarity (0-5): structure, readability, freedom from rambling
  - Structure (0-5): STAR for behavioral; problem→approach→tradeoffs→result for technical
  - Depth (0-5): specificity, technical accuracy, real ownership signals
  - Relevance (0-5): did the answer address what was asked
  - Weighted overall_score with type-aware scoring guidance
- Added "anchor grounding" instruction to evaluation prompt — answers must demonstrate ownership of the specific resume phrase referenced in the question, not give generic textbook responses
- Built `POST /interviews/{session_id}/answers` with sync evaluation flow and status transition (not_started → in_progress on first answer)
- Built `GET /interviews/{session_id}/answers` list endpoint
- Iterated evaluation prompt across THREE versions:
  - **v1:** Grade-inflated 5/5/5/5 with empty weaknesses array despite explicit anti-inflation language in prompt. Schema allowed empty arrays, removing the forcing function.
  - **v2:** Strengthened calibration with anti-inflation rules ("if you find yourself giving 5/5/5/5, drop a dimension"). Added Pydantic `min_length=1` on strengths/weaknesses and `min_length=10` on suggested_improvement. Wired EvaluationRubric.model_validate() into the service (caught by Claude Code review — without this the validation only ran at FastAPI response serialization, after persistence). Added ValidationError to tenacity's retry tuple so calibration failures self-correct.
  - **v3:** v2 fixed grade inflation but broke bad-answer evaluation — Pydantic rejected legitimately weak answers where no real strengths exist. Tenacity retried 3x, all failed validation, answer was stored with evaluation_status='failed'. Fixed by updating the prompt to require minimal-but-real strengths even for poor answers (intellectual honesty, brevity over filler).
- Verified calibration works in both directions:
  - Strong answer (NodeMind MCP detail): 4/4/4/4 with 3 specific weaknesses identifying real gaps
  - Bad answer ("I don't remember"): 0/0/0/0 with 3 minimal-but-real strengths and 3 sharp weaknesses
- Documented all three iterations in `docs/AI-Pipelines/prompts/evaluation/` with v1/v2/v3 outputs and CHANGELOG explaining root causes and fixes

### Notes / what surprised me
- OpenAI strict JSON schema mode doesn't support minItems/maxItems/minLength constraints. Enforcement has to happen at the Pydantic layer, not the schema layer.
- Pydantic validation has to be wired INTO the service function (not just on the response model) for tenacity retry to catch it. FastAPI's response-serialization validation runs after persistence — too late to retry.
- The "calibration in both directions" test is the real readiness signal. A rubric that scores good answers well is trivial; the bar is making it score bad answers honestly too. v2 passed the first test and failed the second.
- Claude Code's review caught a real bug in my prompt — it noticed my "validation triggers retry" claim wouldn't work because (a) validation wasn't called in the service, and (b) ValidationError wasn't in the retry tuple. Two-stage review (Claude Code self-critique → my final approval) has now caught real bugs in three separate blocks.
- "Minimal but real" strengths for poor answers — "acknowledged uncertainty honestly," "stayed on-topic," "kept it brief" — is genuinely how senior interviewers give feedback to junior candidates. Not flattery, just pointing at the one thing they did right. Adopting this pattern matched real interviewer behavior.

### Tomorrow (Day 5)
- Pivot to frontend — Next.js has been mostly placeholder pages
- Build login + register pages wired to /auth endpoints (JWT in httpOnly cookies)
- Resume upload UI with drag-and-drop and parse_status polling
- Job description form
- Dashboard listing previous interview sessions with status badges

## Day 5 — May 19, 2026

### Completed
- Frontend foundation: installed shadcn/ui components (Button, Input, Label, Card, Sonner) plus react-hook-form, zod, @hookform/resolvers
- Built typed API client (`lib/api.ts`) with module-level token holder + localStorage mirroring for refresh persistence
- Built AuthContext + useAuth hook (login, register, logout, isLoading state)
- Built /login page with react-hook-form + zod validation, inline field errors, sonner toast on API failures
- Built /register page with same form pattern; auto-logs in via context after successful registration
- Built (authenticated) route group with shared layout that protects nested routes
- Built Navbar component with logo, dashboard link, logout button
- Tested end-to-end: register → auto-login → dashboard → logout → re-login flow all work
- Verified protected route bounce: visiting /dashboard while logged out redirects to /login without flash of protected content
- DL-006 documents the client-side-guard tradeoff and v1.1 migration plan to httpOnly cookies + Next.js middleware

### Notes / what surprised me
- shadcn 4.x made breaking changes: removed the "default" style (now "base-nova"), no longer ships a <Form> wrapper component, defaults to oklch colors (Tailwind v4) which broke our Tailwind v3 hsl(var(--X)) wrappers. Had to manually revert globals.css to HSL form and use react-hook-form's useForm directly without the shadcn wrapper.
- shadcn's sonner.tsx ships with raw `var(--popover)` references instead of `hsl(var(--popover))`. Manual fix needed before toasts render correctly.
- Claude Code self-flagged the client-side-only guard as a security gap and proposed httpOnly cookie + middleware as the v1.1 fix. That observation became DL-006 — a concrete artifact of "I know the tradeoff" thinking.
- Subtle UX detail: navbar logout uses router.push (history-tracked), auth bounce uses router.replace (not history-tracked). Logout is a user action and should be back-button-able; auth bounce shouldn't pollute history. Claude Code suggested this distinction unprompted.

### Tomorrow (Day 6)
- Add backend /auth/me endpoint so AuthContext can populate the user object after token-only login
- Build resume upload UI with drag-and-drop + parse_status polling
- Build JD creation form
- Build "Create interview session" flow that ties resume + JD together

## Day 6 — May 19/20, 2026

### Completed (single-day push, all five blocks)

- Backend: added GET /auth/me endpoint so frontend can populate the user object after login. Updated AuthContext useEffect to call api.auth.me() on mount when a stored token exists, with cleanup-on-401 logic. Navbar now displays the user's full_name (or email fallback).
- Resume upload page at /resumes: native HTML5 drag-and-drop (no library), file type/size validation, parse_status polling at 2-second intervals until completed/failed. Bonus: pollingIds is seeded from any already-pending/processing rows on mount, so a page reload mid-processing still shows live status flips. Reusable StatusBadge component (zinc/blue-pulsing/emerald/red palette).
- Resume detail page at /resumes/[id] using the Next.js 16 async params pattern (server component wrapper → client child).
- Job descriptions page at /job-descriptions: create form with react-hook-form + zod (title, optional company, raw_text min 10 chars), inline list of existing JDs, detail page with whitespace-pre-wrap for preserved line breaks. Installed shadcn Textarea component.
- Interview session creation at /interviews/new: shadcn Select dropdowns for resume (filtered to completed only) and JD, number input for num_questions (4-12, default 8). Sync generation with ~5-10s spinner state, then redirect to session detail.
- Interview session detail at /interviews/[id]: fetches session + answers in parallel on mount. Each question renders as a QuestionCard with type/difficulty badges, rationale, anchor, and either an answer form OR the latest answer + EvaluationDisplay (4 color-coded dimension scores, strengths/weaknesses two-column layout, suggested-improvement card).
- Dashboard rewrite: welcome heading with user name, hero CTA "Start a new mock interview" using Button asChild pattern, recent sessions list with StatusBadge.
- StatusBadge extended to cover session statuses: not_started (gray), in_progress (amber), abandoned (muted), plus humanized labels (underscore → space).

### Fixes shipped along the way
- shadcn 4.x Button didn't implement asChild — leaked the prop to the DOM as an unknown attribute. Fixed by adding the standard Radix Slot pattern (Comp = asChild ? Slot : ButtonPrimitive).
- shadcn 4.x Select dropdown was rendering inline with the trigger instead of as a floating popover, overlapping form fields. Fixed by ensuring SelectContent uses SelectPrimitive.Portal + position="popper" + sideOffset + z-50 + bg-popover.
- Sonner toaster ships with raw var(--popover) references; wrapped them in hsl(var(...)) so toasts render with theme colors. (Day 5 fix carried forward.)

### Notes / what surprised me
- The "seed pollingIds from existing pending/processing rows on mount" pattern was Claude Code's idea, not in my original spec. Without it, page reload during upload would freeze the status badge. Real product-quality thinking from the model.
- shadcn 4.x has multiple breaking changes from the version most tutorials cover — no <Form> wrapper, broken asChild, broken Select positioning, raw CSS vars in sonner. The base library has rough edges that took meaningful debug time. Every fix is documented in commit messages so they don't recur in a future v1.1 setup.
- Next.js 16 async params pattern (`params: Promise<{ id: string }>` then `const { id } = await params`) requires a server-component wrapper around a client component child. Cleaner than I expected once it clicked.
- TypeScript structural subtyping let me cleanly use `JobDescriptionListItem[]` for state while still accepting the full `JobDescription` returned by create() — the extra fields are just carried along on that one row. Saved an unnecessary refetch.
- The full demo loop works end-to-end on a real user flow: register → upload resume → wait for parse → paste JD → generate interview → answer questions → see graded evaluation. Six days of API work + one day of frontend work is enough to ship a demo-able product. The frontend went faster than I expected because the API was already clean.

### Tomorrow (Day 7)
- Landing page redesign (hero polish + how-it-works + features + demo screenshot + footer)
- Polish pass: empty states, loading skeletons, mobile responsiveness check
- Add weak-area summary on the dashboard (which dimensions tend to score lowest across sessions)
- Optional: "Try a different answer" UI on completed questions
- Optional: session completion endpoint + transition (in_progress → completed when all questions answered)
- Documentation pass: update README with screenshots, set up the demo for recording

## Day 7 — May 25-26, 2026

### Completed
- Cleaned up Day 7 leftovers: upgraded evaluator to gpt-4o with few-shot anchor example; added session completion logic (in_progress → completed when all questions answered)
- Built user stats endpoint (GET /interviews/stats) returning total sessions, completed count, total answers, average score, weakest dimension
- Dashboard now shows 4 stat tiles + "Focus area" callout for the weakest dimension
- Rewrote README with screenshots, AI engineering deep-dive, decision logs, setup instructions, roadmap
- **Deployed to production: backend on Railway + Postgres+pgvector, frontend on Vercel**

### Deployment debugging journey
- First crash: missing psycopg2 (Railway gives postgres:// URL; SQLAlchemy async needs postgresql+asyncpg://). Fixed with normalize_async_pg_url helper applied in both session.py and alembic/env.py, extracted to shared app/db/url.py module
- Second crash: 502 "Application failed to respond" — turned out container was binding to port 8000 but Railway expected 8080 (auto-injected PORT changed mid-deploy). Fixed by aligning Railway Networking Target Port to match container
- CORS errors were a red herring — actually the API was unreachable due to port mismatch
- All Vercel build failures were strict TypeScript catching issues that local builds missed: z.coerce.number() input/output type mismatch fixed by switching to z.number() + register valueAsNumber: true
- Untracked screenshots (apps/web/public/screenshots/) were committed after Vercel showed broken images

### Production stack
- Frontend: Vercel (auto-deploys on push to main)
- Backend: Railway (Dockerfile, alembic migrations on every container start)
- Database: Postgres 16 + pgvector on Railway
- Domain: https://interview-copilot-clk7.vercel.app (frontend), https://interview-copilot-production.up.railway.app (API)

### Tomorrow (Day 8)
- Demo video recording (Loom) — full flow end-to-end
- LinkedIn launch post draft + carousel
- Final polish pass on any rough edges discovered while recording

### Notes / what surprised me
- Railway's auto-injected $PORT changed unexpectedly during a redeploy and broke the Target Port alignment. Lesson: when something works locally and breaks on Railway, check what port the container ACTUALLY bound to vs what Railway's proxy is forwarding to.
- TypeScript strict builds on Vercel catch real bugs that get hidden by relaxed local builds. The z.coerce.number() pattern that "felt fine" was actually broken — Vercel forced a real fix.
- The .env files locally vs Railway variables vs Vercel env vars are three separate sources of truth. Documented every env var that needs to exist in all three places for v1.1 setup notes.

### Day 8 production deployment — debugging post-mortem

Final blocker after the port fix turned out to be CORS — and the real culprit was Vercel reassigning the deployment URL after each redeploy. The first CORS-passing URL (interview-copilot-clk7.vercel.app) became interview-copilot-lr3u.vercel.app after the next push, and the ALLOWED_ORIGINS env var was still pointing at the old one. Fixed by updating ALLOWED_ORIGINS to the new URL, then plan to migrate to Vercel's stable production alias before launch to prevent recurrence.

### Production endpoints
- Frontend: https://interview-copilot-lr3u.vercel.app (current, will update to stable alias)
- Backend: https://interview-copilot-production.up.railway.app
- Health check: https://interview-copilot-production.up.railway.app/health
- API docs: https://interview-copilot-production.up.railway.app/docs

### Full deployment debugging chain
1. psycopg2 missing → normalize URL to asyncpg
2. Container binding port 8000 vs Railway proxy expecting 8080 → set PORT=8000 explicitly, align Target Port
3. CORS failing because Vercel URL changed between deploys → update ALLOWED_ORIGINS, plan stable alias migration
4. Three TypeScript strict-build failures on Vercel that local build missed: z.coerce.number() input/output mismatch
5. Screenshots not in git → committed apps/web/public/screenshots/
6. Session status badge stuck on in_progress → added refetch callback in question-card → session-view