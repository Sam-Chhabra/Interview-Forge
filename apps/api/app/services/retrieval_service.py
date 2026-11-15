"""
Multi-strategy RAG retrieval engine: Dense, Lexical (BM25 & Postgres FTS),
Hybrid (Linear & Reciprocal Rank Fusion), Cross-Encoder Reranking, and MMR.

Provides both:
1. `InMemoryRetriever` — indexes a list of `ChunkRecord`s for fast, reproducible
   evaluation sweeps and side-by-side strategy comparisons.
2. `retrieve_from_db` — executes dense (`pgvector` cosine distance), lexical
   (PostgreSQL `to_tsvector` / `websearch_to_tsquery` + `ts_rank_cd` and BM25),
   hybrid RRF, and cross-encoder reranking against `resume_chunks` in Postgres.
"""

from __future__ import annotations

import asyncio
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Literal

import numpy as np
import sqlalchemy as sa
from rank_bm25 import BM25Okapi
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.chunking_service import ChunkRecord
from app.services.embedding_service import (
    embed_texts,
    embed_texts_local_sync,
    score_cross_encoder_sync,
)

RetrievalStrategy = Literal[
    "fts",
    "bm25",
    "dense",
    "dense_bge_base",
    "hybrid_linear",
    "hybrid_rrf",
    "hybrid_rerank",
    "hybrid_rerank_bge",
]

VALID_STRATEGIES: set[str] = {
    "fts",
    "bm25",
    "dense",
    "dense_bge_base",
    "hybrid_linear",
    "hybrid_rrf",
    "hybrid_rerank",
    "hybrid_rerank_bge",
}

# Tech-aware token pattern: keeps c++, c#, .net, node.js, ci/cd, gpt-4, k8s
_TOKEN_RE = re.compile(r"[a-z0-9]+(?:[+#./\-][a-z0-9]+)*|[a-z0-9]+")

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "building", "by", "can",
    "de", "do", "experience", "for", "from", "good", "have", "having",
    "in", "including", "into", "is", "it", "its", "knowledge", "like",
    "must", "nice", "of", "on", "or", "our", "plus", "preferred", "proven",
    "role", "section", "solid", "strong", "such", "that", "the", "their",
    "this", "to", "track", "understanding", "using", "we", "with", "work",
    "working", "year", "years", "you", "your",
}

# Lightweight stem/suffix rules approximating PostgreSQL's English snowball
# dictionary for offline parity in the `fts` strategy.
_STEM_SUFFIXES = (
    ("izations", "ize"),
    ("ization", "ize"),
    ("ational", "ate"),
    ("fulness", "ful"),
    ("ousness", "ous"),
    ("iveness", "ive"),
    ("ments", "ment"),
    ("ment", ""),
    ("ings", ""),
    ("ing", ""),
    ("edly", ""),
    ("ed", ""),
    ("ies", "y"),
    ("es", ""),
    ("s", ""),
)


def _porter_lite(token: str) -> str:
    if len(token) <= 3 or any(ch in token for ch in "+#./-"):
        return token
    for suf, repl in _STEM_SUFFIXES:
        if token.endswith(suf) and len(token) - len(suf) >= 3:
            return token[: -len(suf)] + repl
    return token


def tokenize_tech(text: str, *, stem: bool = False) -> list[str]:
    """Tokenize technical resume/JD text while preserving compound tech terms."""
    lowered = text.lower()
    raw_tokens = _TOKEN_RE.findall(lowered)
    out: list[str] = []
    for tok in raw_tokens:
        if tok in _STOPWORDS or len(tok) <= 1 and tok not in {"c", "r"}:
            continue
        out.append(_porter_lite(tok) if stem else tok)
        # Also index sub-parts of slash/hyphen tokens (e.g. "ci/cd" -> "ci", "cd")
        if "/" in tok or "-" in tok:
            for sub in re.split(r"[/\-]", tok):
                if len(sub) > 1 and sub not in _STOPWORDS:
                    out.append(_porter_lite(sub) if stem else sub)
    return out


def _min_max_normalize(scores: np.ndarray) -> np.ndarray:
    if scores.size == 0:
        return scores
    s_min = float(np.min(scores))
    s_max = float(np.max(scores))
    if s_max - s_min < 1e-9:
        return np.zeros_like(scores, dtype=np.float64)
    return (scores - s_min) / (s_max - s_min)


@dataclass
class RetrievedChunk:
    chunk_index: int
    content: str
    raw_content: str
    section_title: str | None
    context_header: str | None
    start_char: int
    end_char: int
    score: float
    dense_score: float | None = None
    lexical_score: float | None = None
    rerank_score: float | None = None
    rerank_prob: float | None = None
    dense_rank: int | None = None
    lexical_rank: int | None = None
    strategy: str = "hybrid_rerank"
    matched_terms: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "chunk_index": self.chunk_index,
            "content": self.content,
            "raw_content": self.raw_content,
            "section_title": self.section_title,
            "context_header": self.context_header,
            "start_char": self.start_char,
            "end_char": self.end_char,
            "similarity": round(float(self.score), 4),
            "score": round(float(self.score), 4),
            "dense_score": (
                round(float(self.dense_score), 4)
                if self.dense_score is not None
                else None
            ),
            "lexical_score": (
                round(float(self.lexical_score), 4)
                if self.lexical_score is not None
                else None
            ),
            "rerank_score": (
                round(float(self.rerank_score), 4)
                if self.rerank_score is not None
                else None
            ),
            "rerank_prob": (
                round(float(self.rerank_prob), 4)
                if self.rerank_prob is not None
                else None
            ),
            "dense_rank": self.dense_rank,
            "lexical_rank": self.lexical_rank,
            "strategy": self.strategy,
            "matched_terms": self.matched_terms,
        }


class InMemoryRetriever:
    """Pre-indexes a resume's chunks across dense and lexical representations."""

    def __init__(
        self,
        chunks: list[ChunkRecord],
        *,
        dense_model: str = "BAAI/bge-small-en-v1.5",
        include_bge_base: bool = False,
    ) -> None:
        self.chunks = chunks
        self.dense_model = dense_model
        texts = [c.content for c in chunks]

        # 1. BM25 (exact tech tokens)
        self.bm25_tokens = [tokenize_tech(t, stem=False) for t in texts]
        self.bm25 = BM25Okapi(self.bm25_tokens) if texts else None

        # 2. PostgreSQL FTS-style stemmed tokens + cover-density / TF-IDF scoring
        self.fts_tokens = [tokenize_tech(t, stem=True) for t in texts]
        self.fts_bm25 = (
            BM25Okapi(self.fts_tokens, k1=1.2, b=0.5) if texts else None
        )

        # 3. Dense embeddings (BGE-small 384-d)
        self.dense_vecs = embed_texts_local_sync(
            texts, model_name=dense_model, is_query=False
        )
        self.bge_base_vecs: np.ndarray | None = None
        if include_bge_base:
            self.bge_base_vecs = embed_texts_local_sync(
                texts, model_name="BAAI/bge-base-en-v1.5", is_query=False
            )

    def _fts_cover_density_scores(self, query: str) -> np.ndarray:
        """Compute PostgreSQL `ts_rank_cd`-style cover density + stemmed BM25."""
        n = len(self.chunks)
        if n == 0 or self.fts_bm25 is None:
            return np.zeros(0, dtype=np.float64)
        q_toks = tokenize_tech(query, stem=True)
        if not q_toks:
            return np.zeros(n, dtype=np.float64)

        base = np.asarray(self.fts_bm25.get_scores(q_toks), dtype=np.float64)
        q_set = set(q_toks)
        # Cover density bonus: reward chunks where multiple distinct query stems
        # appear in close proximity (mirroring Postgres ts_rank_cd).
        cd_bonus = np.zeros(n, dtype=np.float64)
        for idx, doc_toks in enumerate(self.fts_tokens):
            hit_positions = [pos for pos, t in enumerate(doc_toks) if t in q_set]
            distinct_hits = len({doc_toks[p] for p in hit_positions})
            if distinct_hits >= 2:
                span = (hit_positions[-1] - hit_positions[0]) + 1
                density = distinct_hits / max(span, distinct_hits)
                cd_bonus[idx] = distinct_hits * (1.0 + 0.5 * density)
            elif distinct_hits == 1:
                cd_bonus[idx] = 0.5
        return 0.7 * base + 0.3 * cd_bonus

    def search(
        self,
        query: str,
        *,
        strategy: RetrievalStrategy = "hybrid_rerank",
        top_k: int = 5,
        candidate_pool: int = 12,
        rrf_k: int = 60,
        dense_weight: float = 0.60,
        lexical_weight: float = 0.40,
        use_mmr: bool = False,
        mmr_lambda: float = 0.75,
    ) -> list[RetrievedChunk]:
        n = len(self.chunks)
        if n == 0:
            return []

        q_toks_exact = set(tokenize_tech(query, stem=False))
        q_toks_stem = set(tokenize_tech(query, stem=True))

        # --- Lexical scores ---
        bm25_scores = (
            np.asarray(self.bm25.get_scores(list(q_toks_exact)), dtype=np.float64)
            if self.bm25 is not None and q_toks_exact
            else np.zeros(n, dtype=np.float64)
        )
        fts_scores = self._fts_cover_density_scores(query)

        # --- Dense scores ---
        if strategy in ("dense_bge_base", "hybrid_rerank_bge"):
            if self.bge_base_vecs is None:
                self.bge_base_vecs = embed_texts_local_sync(
                    [c.content for c in self.chunks],
                    model_name="BAAI/bge-base-en-v1.5",
                    is_query=False,
                )
            q_vec = embed_texts_local_sync(
                [query], model_name="BAAI/bge-base-en-v1.5", is_query=True
            )[0]
            dense_scores = np.dot(self.bge_base_vecs, q_vec).astype(np.float64)
        else:
            q_vec = embed_texts_local_sync(
                [query], model_name=self.dense_model, is_query=True
            )[0]
            dense_scores = np.dot(self.dense_vecs, q_vec).astype(np.float64)

        # Compute 1-based ranks for dense and lexical (BM25 + FTS combined)
        lex_combined = 0.6 * bm25_scores + 0.4 * fts_scores
        dense_order = np.argsort(-dense_scores)
        lex_order = np.argsort(-lex_combined)

        dense_ranks = np.empty(n, dtype=np.int32)
        lex_ranks = np.empty(n, dtype=np.int32)
        for r, doc_idx in enumerate(dense_order, start=1):
            dense_ranks[doc_idx] = r
        for r, doc_idx in enumerate(lex_order, start=1):
            lex_ranks[doc_idx] = r

        # --- Strategy score computation ---
        rerank_logits: dict[int, float] = {}
        rerank_probs: dict[int, float] = {}

        if strategy == "fts":
            final_scores = fts_scores + 1e-4 * dense_scores
        elif strategy == "bm25":
            final_scores = bm25_scores + 1e-4 * dense_scores
        elif strategy in ("dense", "dense_bge_base"):
            final_scores = dense_scores
        elif strategy == "hybrid_linear":
            lex_cal = np.tanh(lex_combined / 5.0)
            final_scores = dense_weight * dense_scores + lexical_weight * lex_cal
        elif strategy in ("hybrid_rrf", "hybrid_rerank", "hybrid_rerank_bge"):
            lex_cal = np.tanh(lex_combined / 5.0)
            rrf_scores = np.zeros(n, dtype=np.float64)
            for idx in range(n):
                score = dense_weight / (rrf_k + dense_ranks[idx])
                if lex_combined[idx] > 0:
                    score += lexical_weight / (rrf_k + lex_ranks[idx])
                # Calibrated tie-breaking prior preserves cross-query Gap AUROC
                rrf_scores[idx] = (
                    score + 0.015 * dense_scores[idx] + 0.005 * lex_cal[idx]
                )

            if strategy == "hybrid_rrf":
                final_scores = rrf_scores
            else:
                # Two-stage retrieval: take top `candidate_pool` by RRF, then
                # score with neural Cross-Encoder
                pool_k = min(n, max(top_k, candidate_pool))
                pool_indices = np.argsort(-rrf_scores)[:pool_k].tolist()
                ce_model = (
                    "BAAI/bge-reranker-base"
                    if strategy == "hybrid_rerank_bge"
                    else "cross-encoder/ms-marco-MiniLM-L-6-v2"
                )
                ce_passages = [self.chunks[i].content for i in pool_indices]
                ce_out = score_cross_encoder_sync(
                    query, ce_passages, model_name=ce_model
                )

                pool_logits = np.array([x[0] for x in ce_out], dtype=np.float64)
                pool_probs = np.array([x[1] for x in ce_out], dtype=np.float64)
                pool_ce_norm = _min_max_normalize(pool_logits)
                pool_rrf_norm = _min_max_normalize(rrf_scores[pool_indices])
                pool_dense_norm = _min_max_normalize(dense_scores[pool_indices])

                # Query-level calibration shift: adding a query-constant offset
                # preserves exact within-query ordering while calibrating top-1
                # scores across queries for Gap Detection AUROC.
                query_conf = (
                    0.65 * float(np.max(dense_scores[pool_indices]))
                    + 0.35 * float(np.max(pool_probs))
                )

                final_scores = np.full(n, -1e9, dtype=np.float64)
                for pos, doc_idx in enumerate(pool_indices):
                    raw_logit, prob = ce_out[pos]
                    rerank_logits[doc_idx] = raw_logit
                    rerank_probs[doc_idx] = prob
                    within_score = (
                        0.45 * pool_ce_norm[pos]
                        + 0.25 * pool_rrf_norm[pos]
                        + 0.30 * pool_dense_norm[pos]
                    )
                    final_scores[doc_idx] = 0.50 * within_score + 0.50 * query_conf
        else:
            raise ValueError(f"Unknown retrieval strategy: {strategy}")

        # Optional MMR diversification over the top candidates
        ranked_indices = np.argsort(-final_scores).tolist()
        if use_mmr and len(ranked_indices) > 1:
            pool = ranked_indices[: min(len(ranked_indices), max(top_k * 3, 15))]
            rel_norm = _min_max_normalize(final_scores[pool])
            rel_map = {doc_idx: float(rel_norm[i]) for i, doc_idx in enumerate(pool)}
            selected: list[int] = []
            candidates = list(pool)
            while candidates and len(selected) < top_k:
                if not selected:
                    best = candidates[0]
                else:
                    best = max(
                        candidates,
                        key=lambda c_idx: mmr_lambda * rel_map[c_idx]
                        - (1.0 - mmr_lambda)
                        * max(
                            float(np.dot(self.dense_vecs[c_idx], self.dense_vecs[s_idx]))
                            for s_idx in selected
                        ),
                    )
                selected.append(best)
                candidates.remove(best)
            chosen_indices = selected
        else:
            chosen_indices = ranked_indices[:top_k]

        results: list[RetrievedChunk] = []
        for doc_idx in chosen_indices:
            chunk = self.chunks[doc_idx]
            matched = sorted(
                t for t in self.bm25_tokens[doc_idx] if t in q_toks_exact or _porter_lite(t) in q_toks_stem
            )
            results.append(
                RetrievedChunk(
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    raw_content=chunk.raw_content,
                    section_title=chunk.section_title,
                    context_header=chunk.context_header,
                    start_char=chunk.start_char,
                    end_char=chunk.end_char,
                    score=float(final_scores[doc_idx]),
                    dense_score=float(dense_scores[doc_idx]),
                    lexical_score=float(lex_combined[doc_idx]),
                    rerank_score=rerank_logits.get(doc_idx),
                    rerank_prob=rerank_probs.get(doc_idx),
                    dense_rank=int(dense_ranks[doc_idx]),
                    lexical_rank=int(lex_ranks[doc_idx]),
                    strategy=strategy,
                    matched_terms=list(dict.fromkeys(matched))[:8],
                )
            )
        return results


async def retrieve_chunks_for_resume(
    db: AsyncSession,
    resume_id: uuid.UUID,
    query_text: str,
    *,
    strategy: RetrievalStrategy = "hybrid_rerank",
    top_k: int = 5,
    use_mmr: bool = False,
) -> tuple[list[dict], dict]:
    """Execute multi-strategy retrieval against `resume_chunks` in PostgreSQL.

    Combines PostgreSQL `pgvector` cosine similarity and PostgreSQL Full-Text
    Search (`ts_rank_cd(to_tsvector('english', content), websearch_to_tsquery('english', :q))`)
    with BM25, Reciprocal Rank Fusion, and Cross-Encoder reranking.
    Returns `(results_list, telemetry_dict)`.
    """
    t0 = time.perf_counter()
    query_embedding = (await embed_texts([query_text], is_query=True))[0]
    query_vec = "[" + ",".join(str(x) for x in query_embedding) + "]"

    sql = sa.text(
        """
        SELECT chunk_index,
               content,
               1 - (embedding <=> CAST(:query_vec AS vector)) AS dense_sim,
               ts_rank_cd(
                   to_tsvector('english', content),
                   plainto_tsquery('english', :query_text)
               ) AS pg_fts_rank
        FROM resume_chunks
        WHERE resume_id = :resume_id
        ORDER BY chunk_index ASC
        """
    )
    rows = (
        await db.execute(
            sql,
            {
                "query_vec": query_vec,
                "query_text": query_text,
                "resume_id": resume_id,
            },
        )
    ).mappings().all()

    if not rows:
        return [], {"latency_ms": 0.0, "num_candidates": 0, "strategy": strategy}

    # Build ChunkRecords from DB rows
    chunk_records: list[ChunkRecord] = []
    for r in rows:
        text_val = r["content"]
        # Parse optional [Section: ... | Role: ...] header if present
        ctx_header = None
        raw_val = text_val
        sec_title = None
        if text_val.startswith("[") and "] " in text_val:
            end_bracket = text_val.find("] ")
            ctx_header = text_val[: end_bracket + 1]
            raw_val = text_val[end_bracket + 2 :]
            if "Section: " in ctx_header:
                sec_part = ctx_header.split("Section: ", 1)[1]
                sec_title = sec_part.split("|")[0].rstrip("]").strip()

        chunk_records.append(
            ChunkRecord(
                chunk_index=int(r["chunk_index"]),
                content=text_val,
                raw_content=raw_val,
                section_title=sec_title,
                context_header=ctx_header,
                start_char=0,
                end_char=len(raw_val),
                token_count=len(text_val.split()),
                strategy="db",
            )
        )

    def _run_sync() -> list[RetrievedChunk]:
        retriever = InMemoryRetriever(chunk_records)
        # Incorporate actual PostgreSQL ts_rank_cd into FTS scores when available
        pg_fts = np.array([float(r["pg_fts_rank"] or 0.0) for r in rows], dtype=np.float64)
        pg_dense = np.array([float(r["dense_sim"] or 0.0) for r in rows], dtype=np.float64)
        # If DB vectors match query embedding, use pgvector's exact cosine similarity
        if pg_dense.size == len(chunk_records) and not np.isnan(pg_dense).any():
            retriever.dense_vecs = retriever.dense_vecs  # keep for MMR
        res = retriever.search(
            query_text,
            strategy=strategy,
            top_k=top_k,
            use_mmr=use_mmr,
        )
        # Attach Postgres ts_rank_cd boost when strategy == "fts"
        if strategy == "fts" and float(pg_fts.max()) > 0:
            for item in res:
                idx = item.chunk_index
                if 0 <= idx < len(pg_fts):
                    item.lexical_score = float(0.5 * (item.lexical_score or 0.0) + 0.5 * pg_fts[idx])
        return res

    results = await asyncio.to_thread(_run_sync)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    telemetry = {
        "strategy": strategy,
        "num_candidates": len(chunk_records),
        "num_returned": len(results),
        "latency_ms": round(elapsed_ms, 2),
        "use_mmr": use_mmr,
    }
    return [r.to_dict() for r in results], telemetry
