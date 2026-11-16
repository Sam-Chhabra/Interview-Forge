from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.chunking_service import chunk_resume_structured, chunk_text
from app.services.grounding_service import (
    analyze_resume_jd_fit,
    extract_jd_requirements,
    verify_question_grounding,
)
from app.services.retrieval_service import InMemoryRetriever
from evals.datasets.loader import load_dataset, validate
from evals.metrics import (
    bootstrap_ci,
    paired_permutation_pvalue,
)

SAMPLE_RESUME = """Priya Raman
priya.raman@example.com · Seattle, WA

SUMMARY
• Senior Machine Learning Engineer with 6+ years building low-latency ranking and recommendation systems in Python and Go.

EXPERIENCE
Senior ML Engineer | Lumen Commerce | 2021 – Present
• Architected a two-stage candidate generation and ranking pipeline in PyTorch serving 18,000 QPS at 14ms p99 latency.
• Built an online Redis + Feast feature store streaming Kafka events with sub-second freshness.
• Coached 4 junior engineers through onboarding and led weekly architecture reviews.

ML Engineer | Brightpath Health | 2018 – 2021
• Trained gradient-boosted clinical risk models in XGBoost and calibrated probabilities with isotonic regression.
• Automated CI/CD deployment workflows on k8s using Terraform and GitHub Actions.

SKILLS
• Languages & Frameworks: Python, Go, SQL, PyTorch, XGBoost, Feast, Kafka, Redis, Kubernetes (k8s), Terraform
"""

SAMPLE_JD = """Senior Machine Learning Engineer — Ranking
Requirements:
- 4+ years building production machine learning ranking or recommendation systems in Python and PyTorch
- Hands-on experience with online feature stores (Feast, Redis) and real-time streaming (Kafka)
- Experience deploying microservices on Kubernetes with Infrastructure-as-Code (Terraform)
- Track record of mentoring junior engineers and leading technical design reviews
Nice to have:
- Experience with Rust or WebAssembly edge inference on mobile devices
"""

def test_chunking_strategies_preserve_spans_and_headers() -> None:
    for strat in (
        "fixed_500_50",
        "fixed_200_30",
        "fixed_100_20",
        "sentence_window",
        "bullet_contextual",
    ):
        chunks = chunk_resume_structured(SAMPLE_RESUME, strategy=strat)  # type: ignore[arg-type]
        assert len(chunks) >= 1
        for c in chunks:
            assert c.raw_content.strip()
            assert c.token_count > 0

    bullets = chunk_resume_structured(SAMPLE_RESUME, strategy="bullet_contextual")
    assert len(bullets) == 7
    exp_bullets = [b for b in bullets if b.section_title == "EXPERIENCE"]
    assert len(exp_bullets) == 5
    assert exp_bullets[0].context_header is not None
    assert "Lumen Commerce" in exp_bullets[0].context_header
    assert len(chunk_text(SAMPLE_RESUME, target_tokens=100, overlap_tokens=20)) >= 1

def test_multi_strategy_retrieval_and_mmr() -> None:
    chunks = chunk_resume_structured(SAMPLE_RESUME, strategy="bullet_contextual")
    retriever = InMemoryRetriever(chunks)

    for strat in (
        "fts",
        "bm25",
        "dense",
        "hybrid_linear",
        "hybrid_rrf",
        "hybrid_rerank",
    ):
        hits = retriever.search(
            "two-stage ranking pipeline in PyTorch with low p99 latency",
            strategy=strat,  # type: ignore[arg-type]
            top_k=3,
        )
        assert len(hits) == 3
        assert "PyTorch" in hits[0].raw_content or "ranking" in hits[0].raw_content

    mmr_hits = retriever.search(
        "machine learning systems in Python",
        strategy="hybrid_rerank",
        top_k=3,
        use_mmr=True,
    )
    assert len(mmr_hits) == 3

def test_citation_grounding_and_hallucination_repair() -> None:
    g1 = verify_question_grounding(
        anchor="two-stage candidate generation and ranking pipeline in PyTorch",
        question="How did you keep p99 latency at 14ms in your PyTorch ranking pipeline?",
        rationale="Probes production ranking latency trade-offs.",
        resume_text=SAMPLE_RESUME,
    )
    assert g1.status == "verified"
    assert g1.exact_match is True
    assert g1.grounding_score >= 0.80

    g2 = verify_question_grounding(
        anchor="Built a quantum compiler in Haskell for satellite telemetry",
        question="How did you design your online Redis and Feast feature store for Kafka events?",
        rationale="Targets real-time feature store architecture.",
        resume_text=SAMPLE_RESUME,
    )
    assert g2.status == "hallucinated"
    assert g2.repaired_anchor is not None
    assert g2.repaired_anchor in SAMPLE_RESUME

def test_requirement_decomposition_and_fit_gap_matrix() -> None:
    reqs = extract_jd_requirements(SAMPLE_JD)
    assert len(reqs) == 5
    priorities = [r.priority for r in reqs]
    assert "must" in priorities and "nice" in priorities

    fit = analyze_resume_jd_fit(
        SAMPLE_RESUME,
        SAMPLE_JD,
        strategy="hybrid_rerank",
        chunk_strategy="bullet_contextual",
    )
    assert fit["overall_fit_score"] > 50.0
    assert fit["counts"]["strong_match"] >= 2
    assert len(fit["requirements"]) == 5

def test_benchmark_dataset_and_statistical_metrics() -> None:
    ds = load_dataset("v1")
    problems = validate(ds)
    assert problems == []
    assert len(ds.resumes) == 12
    assert len(ds.jds) == 12
    assert len(ds.queries()) == 160

    mean, lo, hi = bootstrap_ci([0.8, 0.9, 0.7, 1.0, 0.85])
    assert lo <= mean <= hi
    pval = paired_permutation_pvalue([0.9, 0.9, 0.9, 0.9], [0.1, 0.1, 0.1, 0.1])
    assert pval < 0.20

@pytest.mark.asyncio
async def test_rag_api_endpoints() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r1 = await client.post(
            "/rag/search-compare",
            json={
                "resume_id": "r01",
                "query": "online feature store and real-time inference latency",
                "chunk_strategy": "bullet_contextual",
                "top_k": 3,
            },
        )
        assert r1.status_code == 200
        body1 = r1.json()
        assert "hybrid_rerank_bge" in body1["strategies"]
        assert len(body1["strategies"]["hybrid_rerank_bge"]["results"]) == 3

        r2 = await client.post(
            "/rag/analyze-fit",
            json={"resume_id": "r01", "jd_id": "j01"},
        )
        assert r2.status_code == 200
        assert r2.json()["overall_fit_score"] > 0

        r3 = await client.post(
            "/rag/verify-grounding",
            json={
                "resume_id": "r01",
                "anchor": "Fabricated Cobol mainframe migration in 1997",
                "question": "How did you build the online feature pipeline?",
                "rationale": "Probes feature store latency.",
            },
        )
        assert r3.status_code == 200
        assert r3.json()["status"] == "hallucinated"
        assert r3.json()["repaired_anchor"] is not None
