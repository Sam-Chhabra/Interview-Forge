from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.chunking_service import ChunkStrategy, chunk_resume_structured
from app.services.grounding_service import (
    analyze_resume_jd_fit,
    verify_question_grounding,
)
from app.services.retrieval_service import InMemoryRetriever, RetrievalStrategy
from evals.datasets.loader import load_dataset
from evals.run_benchmarks import RESULTS_DIR, run_all_benchmarks

router = APIRouter()

class SearchCompareRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=600)
    resume_id: str | None = Field(
        default="r01",
        description="Benchmark resume ID (r01..r12) if resume_text is not provided",
    )
    resume_text: str | None = None
    chunk_strategy: ChunkStrategy = "bullet_contextual"
    top_k: int = Field(default=5, ge=1, le=10)

class AnalyzeFitRequest(BaseModel):
    resume_id: str | None = "r01"
    jd_id: str | None = "j01"
    resume_text: str | None = None
    jd_text: str | None = None
    strategy: RetrievalStrategy = "hybrid_rerank_bge"
    chunk_strategy: ChunkStrategy = "bullet_contextual"

class VerifyGroundingRequest(BaseModel):
    resume_id: str | None = "r01"
    resume_text: str | None = None
    anchor: str = Field(..., min_length=2, max_length=400)
    question: str = Field(..., min_length=5, max_length=600)
    rationale: str = Field(default="", max_length=600)

def _resolve_resume_text(resume_id: str | None, resume_text: str | None) -> str:
    if resume_text and resume_text.strip():
        return resume_text.strip()
    ds = load_dataset("v1")
    rid = resume_id or "r01"
    if rid not in ds.resumes:
        raise HTTPException(status_code=404, detail=f"Unknown benchmark resume '{rid}'")
    return ds.resumes[rid].text

def _resolve_jd_text(jd_id: str | None, jd_text: str | None) -> str:
    if jd_text and jd_text.strip():
        return jd_text.strip()
    ds = load_dataset("v1")
    jid = jd_id or "j01"
    if jid not in ds.jds:
        raise HTTPException(status_code=404, detail=f"Unknown benchmark JD '{jid}'")
    return ds.jds[jid].text

@router.get("/benchmarks")
async def get_benchmarks() -> dict:
    report_path = RESULTS_DIR / "latest_benchmark.json"
    if report_path.exists():
        report = json.loads(report_path.read_text(encoding="utf-8"))
    else:
        report = await asyncio.to_thread(run_all_benchmarks, "v1")

    ds = load_dataset("v1")
    sample_resumes = [
        {
            "resume_id": r.resume_id,
            "candidate": r.candidate,
            "role_family": r.role_family,
            "seniority": r.seniority,
            "num_items": len(r.items),
            "text": r.text,
        }
        for r in ds.resumes.values()
    ]
    sample_jds = [
        {
            "jd_id": j.jd_id,
            "title": j.title,
            "company": j.company,
            "pairs_with": j.pairs_with,
            "num_requirements": len(j.requirements),
            "sample_queries": [req.text for req in j.requirements[:5]],
            "text": j.text,
        }
        for j in ds.jds.values()
    ]
    return {
        "report": report,
        "samples": {
            "resumes": sample_resumes,
            "jds": sample_jds,
        },
    }

@router.post("/benchmarks/run")
async def trigger_benchmark_run() -> dict:
    report = await asyncio.to_thread(run_all_benchmarks, "v1")
    return {"report": report}

@router.post("/search-compare")
async def search_compare(req: SearchCompareRequest) -> dict:
    text = _resolve_resume_text(req.resume_id, req.resume_text)

    def _execute() -> dict:
        chunks = chunk_resume_structured(text, strategy=req.chunk_strategy)
        retriever = InMemoryRetriever(chunks, include_bge_base=False)
        strategies_to_compare: list[tuple[RetrievalStrategy, str]] = [
            ("fts", "PostgreSQL FTS (ts_rank_cd)"),
            ("bm25", "BM25Okapi (Tech Tokenizer)"),
            ("dense", "Dense Bi-Encoder (BGE-small)"),
            ("hybrid_rrf", "Hybrid Reciprocal Rank Fusion"),
            ("hybrid_rerank", "Hybrid RRF + MiniLM Cross-Encoder"),
            ("hybrid_rerank_bge", "Hybrid RRF + BGE-Reranker-Base"),
        ]
        comparison: dict[str, dict] = {}
        for strat_key, label in strategies_to_compare:
            t0 = time.perf_counter()
            hits = retriever.search(req.query, strategy=strat_key, top_k=req.top_k)
            ms = (time.perf_counter() - t0) * 1000.0
            comparison[strat_key] = {
                "strategy": strat_key,
                "label": label,
                "latency_ms": round(ms, 2),
                "results": [h.to_dict() for h in hits],
            }
        return {
            "query": req.query,
            "chunk_strategy": req.chunk_strategy,
            "num_chunks_indexed": len(chunks),
            "strategies": comparison,
        }

    return await asyncio.to_thread(_execute)

@router.post("/analyze-fit")
async def analyze_fit_endpoint(req: AnalyzeFitRequest) -> dict:
    r_text = _resolve_resume_text(req.resume_id, req.resume_text)
    j_text = _resolve_jd_text(req.jd_id, req.jd_text)
    return await asyncio.to_thread(
        analyze_resume_jd_fit,
        r_text,
        j_text,
        strategy=req.strategy,
        chunk_strategy=req.chunk_strategy,
    )

@router.post("/verify-grounding")
async def verify_grounding_endpoint(req: VerifyGroundingRequest) -> dict:
    r_text = _resolve_resume_text(req.resume_id, req.resume_text)
    res = await asyncio.to_thread(
        verify_question_grounding,
        anchor=req.anchor,
        question=req.question,
        rationale=req.rationale,
        resume_text=r_text,
    )
    return res.to_dict()
