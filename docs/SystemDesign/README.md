# System Design

> Living document — updated whenever the architecture changes.
> For full RAG benchmark results, ablations, and statistical tests, see [`docs/AI-Pipelines/RAG-Evaluation-Report.md`](../AI-Pipelines/RAG-Evaluation-Report.md).

## Overview

Interview Forge is a three-tier AI/ML web application with a two-stage hybrid retrieval engine, deterministic citation grounding guardrails, and an end-to-end reproducible evaluation suite:

1. **Next.js 16 frontend** (`apps/web`) — handles interview workflows and the interactive **AI/ML Evaluation & Retrieval Lab** (`/benchmarks`).
2. **FastAPI async backend** (`apps/api`) — handles auth, structure-aware contextual chunking, multi-strategy RAG orchestration, requirement fit-gap analysis, citation grounding verification, and answer evaluation.
3. **PostgreSQL 16 with `pgvector` + Full-Text Search GIN indexing** — unified store for relational models, 1536-d HNSW vector indices, and `to_tsvector('english', content)` lexical indices.

## End-to-End RAG & Verification Data Flow

1. **Structure-Aware Contextual Indexing (`chunking_service.py`):**
   - When a user uploads a PDF (`POST /resumes`), `pypdf` extracts raw text off the event loop and `chunk_resume_structured(strategy="bullet_contextual")` parses section headers (`EXPERIENCE`, `PROJECTS`, `SKILLS`) and role headers (`Senior ML Engineer | Lumen Commerce | 2021–Present`).
   - Each atomic bullet is prefixed with `[Section: <SECTION> | Role: <ROLE>]` before embedding, raising Signal-to-Noise Ratio (`SNR@3`) from `8.1%` (legacy 500-token chunks) to `52.7%` and `Focus-nDCG@5` from `0.244` to `0.727`.
2. **Requirement-Decomposed Two-Stage Retrieval (`retrieval_service.py`, `grounding_service.py`):**
   - Instead of querying the vector store with an entire raw Job Description, `extract_jd_requirements` decomposes the JD into atomic `must` and `nice` requirements.
   - **Stage 1 (Hybrid RRF):** Combines Dense Bi-Encoder similarity (`pgvector` cosine / `BAAI/bge-small-en-v1.5` & `bge-base-en-v1.5`), tech-tokenized `BM25Okapi`, and PostgreSQL `ts_rank_cd` Full-Text Search via Reciprocal Rank Fusion ($k=60$).
   - **Stage 2 (Neural Cross-Encoder Reranking + MMR):** Scores top candidate chunks jointly with the query via `cross-encoder/ms-marco-MiniLM-L-6-v2` or `BAAI/bge-reranker-base` and applies Maximal Marginal Relevance (MMR) diversification, improving `nDCG@5` by **+18.3%** ($0.633 \to 0.749, p = 0.0005$) and `Recall@3` from $61.0\% \to 72.6\%$.
3. **Citation Grounding & Hallucination Guardrail (`grounding_service.py`):**
   - Every generated question's `anchor` is checked against the resume via normalized exact substring match, RapidFuzz partial span alignment, tech-token recall, and bi-encoder semantic entailment (`AUROC = 1.000`).
   - Any ungrounded/hallucinated anchor is automatically repaired to the highest-scoring verbatim phrase from the matched resume chunk (`100%` post-guardrail grounding rate).
4. **Length-Deconfounded Rubric Evaluation (`evaluation_service.py`):**
   - Evaluates candidate answers across `clarity`, `structure`, `depth`, and `relevance` (0–5) while penalizing verbose low-specificity "buzzword soup" (`Spearman rho = 0.830`, `Quadratic Weighted Kappa = 0.727`, `100%` accuracy on length-confound test cases).
