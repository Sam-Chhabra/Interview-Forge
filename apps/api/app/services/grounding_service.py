"""
Citation grounding verification, hallucination repair, and JD requirement
fit-gap analysis.

Provides deterministic + neural verification of two core RAG quality dimensions:
1. **Faithfulness / Grounding (`verify_question_grounding`)** — checks whether
   each generated question's `anchor` is actually a verbatim or near-verbatim
   span from the candidate's resume and whether the question rationale is
   semantically supported by the retrieved context chunks.
2. **Requirement Decomposition & Fit-Gap Matrix (`analyze_resume_jd_fit`)** —
   decomposes a raw Job Description into atomic requirements (`must` vs `nice`)
   and runs per-requirement hybrid + cross-encoder retrieval to classify each
   requirement as `strong_match`, `partial_match`, or `gap`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

import numpy as np
from rapidfuzz import fuzz

from app.services.chunking_service import ChunkRecord, chunk_resume_structured
from app.services.embedding_service import embed_texts_local_sync
from app.services.retrieval_service import (
    InMemoryRetriever,
    RetrievalStrategy,
    tokenize_tech,
)

GroundingStatus = Literal["verified", "fuzzy_grounded", "hallucinated"]
FitLevel = Literal["strong_match", "partial_match", "gap"]

_WS_RE = re.compile(r"\s+")
_PUNCT_STRIP_RE = re.compile(r"[^\w\s+#./\-]")


def _normalize_for_match(text: str) -> str:
    cleaned = _PUNCT_STRIP_RE.sub(" ", text.lower())
    return _WS_RE.sub(" ", cleaned).strip()


@dataclass
class GroundingResult:
    anchor: str
    status: GroundingStatus
    exact_match: bool
    fuzzy_score: float
    token_overlap: float
    semantic_support: float
    grounding_score: float
    matched_chunk_index: int | None
    matched_span: tuple[int, int] | None
    matched_excerpt: str | None
    repaired_anchor: str | None

    def to_dict(self) -> dict:
        return {
            "anchor": self.anchor,
            "status": self.status,
            "exact_match": self.exact_match,
            "fuzzy_score": round(self.fuzzy_score, 4),
            "token_overlap": round(self.token_overlap, 4),
            "semantic_support": round(self.semantic_support, 4),
            "grounding_score": round(self.grounding_score, 4),
            "matched_chunk_index": self.matched_chunk_index,
            "matched_span": list(self.matched_span) if self.matched_span else None,
            "matched_excerpt": self.matched_excerpt,
            "repaired_anchor": self.repaired_anchor,
        }


def _find_best_span_in_text(anchor: str, resume_text: str) -> tuple[int, int, str, float]:
    """Locate the character span in `resume_text` that best matches `anchor`."""
    if not anchor.strip() or not resume_text.strip():
        return (0, 0, "", 0.0)

    # 1. Case-insensitive direct substring search
    lower_resume = resume_text.lower()
    lower_anchor = anchor.strip().lower()
    pos = lower_resume.find(lower_anchor)
    if pos != -1:
        end = pos + len(lower_anchor)
        return (pos, end, resume_text[pos:end], 1.0)

    # 2. Line-by-line fuzzy partial ratio search
    best_score = 0.0
    best_span = (0, 0)
    best_excerpt = ""
    cursor = 0
    for line in resume_text.split("\n"):
        l_start = cursor
        l_end = cursor + len(line)
        cursor = l_end + 1
        stripped = line.strip()
        if len(stripped) < 4:
            continue
        score = fuzz.partial_ratio(lower_anchor, stripped.lower()) / 100.0
        if score > best_score:
            best_score = score
            best_span = (l_start, l_end)
            best_excerpt = stripped
    return (best_span[0], best_span[1], best_excerpt, best_score)


def _extract_verbatim_repair_phrase(raw_chunk_text: str, query_hint: str) -> str:
    """Extract a concise 5-12 word verbatim phrase from `raw_chunk_text`."""
    words = raw_chunk_text.strip().split()
    if len(words) <= 10:
        return raw_chunk_text.strip()
    q_toks = set(tokenize_tech(query_hint, stem=True))
    best_window = " ".join(words[:9])
    best_hits = -1
    win_len = min(9, len(words))
    for start in range(0, len(words) - win_len + 1):
        window_str = " ".join(words[start : start + win_len])
        w_toks = set(tokenize_tech(window_str, stem=True))
        hits = len(q_toks & w_toks)
        if hits > best_hits:
            best_hits = hits
            best_window = window_str
    return best_window.strip(" ,;.")


def verify_question_grounding(
    *,
    anchor: str,
    question: str,
    rationale: str,
    resume_text: str,
    chunks: list[dict] | None = None,
) -> GroundingResult:
    """Verify that an interview question's `anchor` and `rationale` are grounded.

    Combines deterministic string verification (normalized exact match +
    RapidFuzz partial ratio + tech-token recall) with bi-encoder semantic
    similarity between the question rationale and the retrieved resume chunks.
    """
    norm_anchor = _normalize_for_match(anchor)
    norm_resume = _normalize_for_match(resume_text)
    exact_match = bool(norm_anchor and len(norm_anchor) >= 4 and norm_anchor in norm_resume)

    span_start, span_end, matched_excerpt, fuzzy_score = _find_best_span_in_text(
        anchor, resume_text
    )
    if exact_match:
        fuzzy_score = 1.0

    anchor_toks = set(tokenize_tech(anchor, stem=True))
    resume_toks = set(tokenize_tech(resume_text, stem=True))
    token_overlap = (
        len(anchor_toks & resume_toks) / len(anchor_toks)
        if anchor_toks
        else 0.0
    )

    # Match against retrieved chunks to identify `matched_chunk_index` and
    # compute semantic support for `(anchor + question + rationale)`.
    candidate_texts: list[str] = []
    candidate_indices: list[int] = []
    if chunks:
        for c in chunks:
            candidate_texts.append(c.get("raw_content") or c.get("content", ""))
            candidate_indices.append(int(c.get("chunk_index", 0)))
    else:
        structured = chunk_resume_structured(resume_text, strategy="bullet_contextual")
        for sc in structured:
            candidate_texts.append(sc.raw_content)
            candidate_indices.append(sc.chunk_index)

    matched_chunk_idx: int | None = None
    semantic_support = 0.0
    best_chunk_raw = matched_excerpt or ""

    if candidate_texts:
        claim_text = f"{anchor}. {question} {rationale}".strip()
        vecs = embed_texts_local_sync([claim_text] + candidate_texts, is_query=False)
        claim_vec = vecs[0]
        chunk_vecs = vecs[1:]
        sims = np.dot(chunk_vecs, claim_vec)

        # Also check which chunk has highest lexical/fuzzy overlap with `anchor`
        fuzz_per_chunk = np.array(
            [
                fuzz.partial_ratio(anchor.lower(), ct.lower()) / 100.0
                for ct in candidate_texts
            ],
            dtype=np.float64,
        )
        combined = 0.6 * fuzz_per_chunk + 0.4 * np.clip(sims, 0.0, 1.0)
        best_pos = int(np.argmax(combined))
        matched_chunk_idx = candidate_indices[best_pos]
        semantic_support = float(np.clip(sims[best_pos], 0.0, 1.0))
        best_chunk_raw = candidate_texts[best_pos]

    grounding_score = (
        0.45 * fuzzy_score
        + 0.25 * token_overlap
        + 0.15 * (1.0 if exact_match else 0.0)
        + 0.15 * semantic_support
    )
    grounding_score = min(1.0, max(0.0, grounding_score))

    if exact_match or (fuzzy_score >= 0.85 and token_overlap >= 0.75):
        status: GroundingStatus = "verified"
        repaired = None
    elif grounding_score >= 0.62 and fuzzy_score >= 0.65:
        status = "fuzzy_grounded"
        repaired = _extract_verbatim_repair_phrase(best_chunk_raw, f"{anchor} {question}")
    else:
        status = "hallucinated"
        repaired = (
            _extract_verbatim_repair_phrase(best_chunk_raw, f"{question} {rationale}")
            if best_chunk_raw
            else None
        )

    return GroundingResult(
        anchor=anchor,
        status=status,
        exact_match=exact_match,
        fuzzy_score=fuzzy_score,
        token_overlap=token_overlap,
        semantic_support=semantic_support,
        grounding_score=grounding_score,
        matched_chunk_index=matched_chunk_idx,
        matched_span=(span_start, span_end) if span_end > span_start else None,
        matched_excerpt=matched_excerpt or best_chunk_raw,
        repaired_anchor=repaired,
    )


@dataclass
class ExtractedRequirement:
    req_id: str
    text: str
    priority: Literal["must", "nice"]
    category: Literal["technical", "architecture", "domain", "leadership"]


_NICE_HEADER_RE = re.compile(
    r"\b(nice to have|preferred|bonus|plus|desirable|optional)\b", re.I
)
_REQ_HEADER_RE = re.compile(
    r"\b(requirements|qualifications|what we look for|what you bring|must have|minimum qualifications|you have)\b",
    re.I,
)
_RESP_HEADER_RE = re.compile(
    r"\b(responsibilities|what you'll do|what you will do|in this role|the role)\b",
    re.I,
)
_LEADERSHIP_RE = re.compile(
    r"\b(mentor|lead|stakeholder|cross-functional|communicate|coaching|on-call|incident|ownership|collaborat)\w*",
    re.I,
)
_ARCH_RE = re.compile(
    r"\b(distributed|scalab|architecture|latency|throughput|microservices|high-availability|pipeline|infrastructure|system design)\w*",
    re.I,
)


def extract_jd_requirements(jd_text: str, max_requirements: int = 10) -> list[ExtractedRequirement]:
    """Deterministically decompose a raw Job Description into atomic requirements."""
    if not jd_text.strip():
        return []

    lines = [ln.strip() for ln in jd_text.split("\n") if ln.strip()]
    mode: Literal["intro", "resp", "must", "nice"] = "intro"
    candidates: list[tuple[str, Literal["must", "nice"], int]] = []

    for ln in lines:
        lower = ln.lower()
        # Check section transitions
        if len(ln) < 65 and _NICE_HEADER_RE.search(lower):
            mode = "nice"
            continue
        if len(ln) < 65 and _REQ_HEADER_RE.search(lower):
            mode = "must"
            continue
        if len(ln) < 65 and _RESP_HEADER_RE.search(lower):
            mode = "resp"
            continue

        is_bullet = bool(re.match(r"^(?:[•\-\*\u2022]|\d+[.)])\s+", ln))
        cleaned = re.sub(r"^(?:[•\-\*\u2022]|\d+[.)])\s+", "", ln).strip()
        if len(cleaned) < 18 or len(cleaned) > 260:
            continue

        # Score how "requirement-like" this line is
        priority: Literal["must", "nice"] = "nice" if mode == "nice" or _NICE_HEADER_RE.search(cleaned) else "must"
        if mode in ("must", "nice") and is_bullet:
            candidates.append((cleaned, priority, 3))
        elif mode == "resp" and is_bullet:
            candidates.append((cleaned, "must", 2))
        elif is_bullet or re.search(r"\b(\d+\+?\s*years|experience with|proficiency in|strong|expertise)\b", cleaned, re.I):
            candidates.append((cleaned, priority, 1))

    # Fallback: split sentences if JD was pasted as a single paragraph
    if not candidates:
        for sent in re.split(r"(?<=[.!?])\s+", jd_text.strip()):
            s = sent.strip()
            if 20 <= len(s) <= 240:
                prio: Literal["must", "nice"] = "nice" if _NICE_HEADER_RE.search(s) else "must"
                candidates.append((s, prio, 1))

    # Prioritize explicit requirement bullets before responsibility bullets
    candidates.sort(key=lambda item: -item[2])
    selected = candidates[:max_requirements]

    out: list[ExtractedRequirement] = []
    for idx, (text, prio, _) in enumerate(selected, start=1):
        if _LEADERSHIP_RE.search(text):
            cat: Literal["technical", "architecture", "domain", "leadership"] = "leadership"
        elif _ARCH_RE.search(text):
            cat = "architecture"
        elif len(tokenize_tech(text)) >= 3:
            cat = "technical"
        else:
            cat = "domain"
        out.append(
            ExtractedRequirement(
                req_id=f"req-{idx:02d}",
                text=text,
                priority=prio,
                category=cat,
            )
        )
    return out


def analyze_resume_jd_fit(
    resume_text: str,
    jd_text: str,
    *,
    strategy: RetrievalStrategy = "hybrid_rerank",
    chunk_strategy: Literal[
        "fixed_500_50",
        "fixed_200_30",
        "fixed_100_20",
        "sentence_window",
        "bullet_contextual",
    ] = "bullet_contextual",
    top_k_per_req: int = 2,
) -> dict:
    """Decompose JD into requirements and compute a per-requirement evidence matrix."""
    chunks: list[ChunkRecord] = chunk_resume_structured(
        resume_text, strategy=chunk_strategy
    )
    requirements = extract_jd_requirements(jd_text, max_requirements=10)
    if not chunks or not requirements:
        return {
            "overall_fit_score": 0.0,
            "chunk_strategy": chunk_strategy,
            "retrieval_strategy": strategy,
            "num_chunks": len(chunks),
            "counts": {"strong_match": 0, "partial_match": 0, "gap": 0},
            "requirements": [],
        }

    retriever = InMemoryRetriever(chunks)
    req_results: list[dict] = []
    counts = {"strong_match": 0, "partial_match": 0, "gap": 0}
    weighted_sum = 0.0
    weight_total = 0.0

    for req in requirements:
        hits = retriever.search(req.text, strategy=strategy, top_k=top_k_per_req)
        top_hit = hits[0] if hits else None

        # Determine calibrated confidence in [0, 1] that the resume satisfies `req`
        if top_hit is None:
            confidence = 0.0
        else:
            dense_sim = max(0.0, float(top_hit.dense_score or 0.0))
            lex_has_match = 1.0 if (top_hit.lexical_score or 0.0) > 0.5 else 0.0
            if top_hit.rerank_prob is not None:
                # Combine cross-encoder sigmoid probability with dense cosine & lexical hit
                confidence = float(
                    0.50 * top_hit.rerank_prob
                    + 0.35 * min(1.0, max(0.0, (dense_sim - 0.35) / 0.45))
                    + 0.15 * lex_has_match
                )
            else:
                confidence = float(
                    0.70 * min(1.0, max(0.0, (dense_sim - 0.35) / 0.45))
                    + 0.30 * lex_has_match
                )

        if confidence >= 0.48 or (top_hit and (top_hit.dense_score or 0.0) >= 0.68 and len(top_hit.matched_terms) >= 2):
            fit_level: FitLevel = "strong_match"
            req_score = 1.0
        elif confidence >= 0.22 or (top_hit and ((top_hit.dense_score or 0.0) >= 0.56 or len(top_hit.matched_terms) >= 1)):
            fit_level = "partial_match"
            req_score = 0.5
        else:
            fit_level = "gap"
            req_score = 0.0

        counts[fit_level] += 1
        w = 2.0 if req.priority == "must" else 1.0
        weighted_sum += w * req_score
        weight_total += w

        req_results.append(
            {
                "req_id": req.req_id,
                "text": req.text,
                "priority": req.priority,
                "category": req.category,
                "fit_level": fit_level,
                "confidence": round(confidence, 4),
                "evidence": [h.to_dict() for h in hits],
            }
        )

    overall_fit = round((weighted_sum / weight_total) * 100.0, 1) if weight_total > 0 else 0.0
    return {
        "overall_fit_score": overall_fit,
        "chunk_strategy": chunk_strategy,
        "retrieval_strategy": strategy,
        "num_chunks": len(chunks),
        "counts": counts,
        "requirements": req_results,
    }
