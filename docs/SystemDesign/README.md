# System Design & Architecture Overview

> Living document — explains how **Interview Forge** works in plain terms and how its AI/ML pipeline was upgraded from a basic RAG prototype into a production-style retrieval and evaluation system.
> For full statistical tables, confidence intervals, and ablations, see [`docs/AI-Pipelines/RAG-Evaluation-Report.md`](../AI-Pipelines/RAG-Evaluation-Report.md).

---

## 1. What Does This System Do? (In Simple Words)

**Interview Forge** takes a candidate's **Resume PDF** and a target **Job Description (JD)** and runs an evidence-grounded mock interview:

1. **Finds Matches & Skill Gaps:** Breaks the job description into individual requirements and checks your resume for proof, marking each requirement as **Covered**, **Partial**, or **Gap**.
2. **Asks Verifiable Questions:** Generates tailored technical and behavioral questions where **every question cites an exact quote from your resume**—and automatically checks that the AI didn't make up or exaggerate the quote.
3. **Grades Answers Fairly:** Scores your answers on 4 dimensions (*Relevance*, *Specificity*, *Structure*, *Clarity*) without being tricked by long, buzzword-heavy rambling answers.

---

## 2. Three-Tier Application Stack

1. **Next.js 16 Frontend (`apps/web`):**
   - Handles PDF uploads, job description management, interactive interview sessions, and the public **AI Benchmark & Retrieval Lab (`/benchmarks`)**.
2. **FastAPI Async Backend (`apps/api`):**
   - Handles JWT authentication, structure-aware resume parsing, 8-strategy retrieval & Cross-Encoder reranking, fit-gap classification, citation grounding verification, and rubric grading.
3. **PostgreSQL 16 (`pgvector` + Full-Text Search):**
   - Stores relational data alongside **HNSW vector indexes** (for semantic search) and **GIN `tsvector` indexes** (for exact keyword search).

---

## 3. How the AI Pipeline Changed (From Basic Prototype to Production Architecture)

### Step 1: Resume Chunking (`chunking_service.py`)
- **How It Started:** The original app split resumes into fixed 500-word blocks. Since a resume is only 1–2 pages long, a 500-word block mashed multiple unrelated jobs into a single noisy paragraph (**only 8.1% Signal-to-Noise Ratio**).
- **How We Improved It:** We built a structure-aware parser (`bullet_contextual`) that detects section headers (`Experience`, `Projects`, `Skills`, `Education`) and role titles, keeping each bullet point separate and prefixing it with `[Section | Role]`.
- **Result:** Context fed to the LLM is **6.5× cleaner** (`SNR@3` rose from **8.1% → 52.7%**, and `Recall@150tok` jumped from **17.2% → 77.6%**).

### Step 2: Two-Stage Hybrid Search & Neural Reranking (`retrieval_service.py`)
- **How It Started:** Relied on a single vector embedding lookup, which often missed exact technical terms (`gRPC`, `pgvector`, `CUDA`) or confused look-alike words (*"JavaScript"* vs. *"Java"*).
- **How We Improved It:**
  - **Stage 1 (Hybrid Search):** Runs Keyword Search (PostgreSQL Full-Text Search + BM25) and Vector Search (`pgvector` + BGE embeddings) in parallel and merges their rankings using **Reciprocal Rank Fusion (`RRF`)**.
  - **Stage 2 (Cross-Encoder Reranker + MMR):** Takes the top 15 candidates and re-scores each `(job requirement, resume bullet)` pair jointly using a neural Cross-Encoder (`BAAI/bge-reranker-base`), then removes near-duplicate bullets with Maximal Marginal Relevance (`MMR`).
- **Result:** Improved search ranking accuracy (`nDCG@5`) by **+18.3%** (`0.633 → 0.749`, $p = 0.0005$) and lifted top-5 recall to **83.5%**.

### Step 3: Anti-Hallucination Quote Checker (`grounding_service.py`)
- **How It Started:** Trusted the LLM to copy quotes from the resume accurately, which meant the LLM sometimes invented or exaggerated resume claims.
- **How We Improved It:** Every generated question's `evidence_anchor` is verified against the candidate's actual resume using exact substring checks, fuzzy matching (`RapidFuzz`), and semantic similarity. If a quote is fabricated, the guardrail catches it (**100% detection rate / `1.000 F1`**) and automatically swaps in the closest real verbatim sentence from the resume (**100% grounded citations**).

### Step 4: Anti-Rambling Answer Grader (`evaluation_service.py`)
- **How It Started:** Single-pass grading with no calibration benchmark to verify whether longer answers automatically got higher scores.
- **How We Improved It:** Calibrated a 4-dimensional rubric evaluator on 64 multi-tier answers (including adversarial pairs comparing concise 70-word expert answers with concrete metrics against 280-word buzzword-filled rambling answers).
- **Result:** Achieved **91.7% pairwise ranking accuracy** (`Spearman rho = 0.830`) and **100% (7/7) accuracy** on length-confound test cases.
