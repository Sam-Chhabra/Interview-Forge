r"""
Information Retrieval, Grounding, and Grader Calibration metrics with
paired bootstrap confidence intervals and permutation significance tests.

Implements:
- Standard IR metrics: `Recall@k`, `MRR@k`, `nDCG@k` (graded 0/1/2), `MAP@k`
- Granularity-aware RAG metrics:
  - `Recall@TokenBudget` (e.g. `Recall@150tok`, `Recall@300tok`) — measures
    how much relevant evidence is retrieved within a fixed LLM context budget,
    exposing why bloated 500-token chunks lose to atomic contextual bullets.
  - `Focus-nDCG@k` (`f_ndcg@5`) — discounts the gain of coarse chunks that
    bundle $m$ unrelated bullets by $1 / \sqrt{m}$ to penalize context dilution.
  - `Signal-to-Noise Ratio (SNR@k)` — fraction of retrieved tokens that belong
    to relevant resume items.
  - `Distractor Trap Rate@k` (`trap_rate@3`) — how often a planted lexical trap
    is ranked in the top-$k$.
  - `Gap Detection AUROC` — ability of top-1 score to distinguish supported
    requirements from true skill gaps (`match_type == 'gap'`).
- Paired bootstrap 95% CIs and paired permutation p-values.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from app.services.chunking_service import ChunkRecord, count_tokens
from evals.datasets.loader import Item, Resume


def items_in_chunk(chunk: ChunkRecord, resume: Resume) -> list[Item]:
    """Return all resume `Item`s whose character span overlaps `chunk`."""
    overlapped: list[Item] = []
    for it in resume.items:
        overlap = min(chunk.end_char, it.end) - max(chunk.start_char, it.start)
        if overlap >= max(8, int(0.4 * len(it.text))):
            overlapped.append(it)
        elif it.text.lower() in chunk.raw_content.lower():
            overlapped.append(it)
    return overlapped


@dataclass
class QueryEvalResult:
    qid: str
    match_type: str
    priority: str
    is_gap: bool
    top1_score: float
    recall_at_1: float
    recall_at_3: float
    recall_at_5: float
    mrr_at_10: float
    ndcg_at_5: float
    f_ndcg_at_5: float
    map_at_10: float
    recall_at_150tok: float
    recall_at_300tok: float
    snr_at_3: float
    trap_at_3: float | None  # Only defined when query has planted distractors
    latency_ms: float


def evaluate_ranked_chunks(
    *,
    qid: str,
    match_type: str,
    priority: str,
    relevant: dict[str, int],
    distractors: list[str],
    ranked_chunks: list[tuple[ChunkRecord, float]],
    resume: Resume,
    latency_ms: float = 0.0,
) -> QueryEvalResult:
    """Score a ranked list of `(ChunkRecord, score)` against item-level qrels."""
    top1_score = float(ranked_chunks[0][1]) if ranked_chunks else 0.0
    if not relevant:
        # Gap query: IR ranking metrics are N/A (0.0); used for Gap AUROC
        return QueryEvalResult(
            qid=qid,
            match_type=match_type,
            priority=priority,
            is_gap=True,
            top1_score=top1_score,
            recall_at_1=0.0,
            recall_at_3=0.0,
            recall_at_5=0.0,
            mrr_at_10=0.0,
            ndcg_at_5=0.0,
            f_ndcg_at_5=0.0,
            map_at_10=0.0,
            recall_at_150tok=0.0,
            recall_at_300tok=0.0,
            snr_at_3=0.0,
            trap_at_3=None,
            latency_ms=latency_ms,
        )

    total_rel_items = len(relevant)
    distractor_set = set(distractors)

    # Map each ranked chunk to: (contained_items, new_rel_items, max_grade, focus_factor)
    seen_rel_for_dcg: set[str] = set()
    chunk_hits_by_rank: list[set[str]] = []
    chunk_gains: list[float] = []
    chunk_focus_gains: list[float] = []
    chunk_has_trap: list[bool] = []
    chunk_rel_tokens: list[int] = []
    chunk_tot_tokens: list[int] = []

    for chunk, _ in ranked_chunks[:10]:
        contained = items_in_chunk(chunk, resume)
        contained_ids = {it.id for it in contained}
        rel_in_chunk = contained_ids & set(relevant.keys())
        new_rel = rel_in_chunk - seen_rel_for_dcg

        # Graded gain (2^g - 1) for best newly-covered relevant item in this chunk
        if new_rel:
            best_grade = max(relevant[iid] for iid in new_rel)
            gain = float((2**best_grade) - 1)
            seen_rel_for_dcg.update(new_rel)
        else:
            gain = 0.0

        # Focus penalty: if a chunk bundles `m` resume items together, discount
        # by 1/sqrt(m) so stuffing 15 bullets into one chunk cannot game nDCG.
        num_items_bundled = max(1, len(contained))
        focus_discount = 1.0 / math.sqrt(num_items_bundled)

        rel_toks = sum(
            count_tokens(it.text) for it in contained if it.id in relevant
        )
        tot_toks = max(1, count_tokens(chunk.raw_content))

        chunk_hits_by_rank.append(rel_in_chunk)
        chunk_gains.append(gain)
        chunk_focus_gains.append(gain * focus_discount)
        chunk_has_trap.append(bool(contained_ids & distractor_set and not rel_in_chunk))
        chunk_rel_tokens.append(rel_toks)
        chunk_tot_tokens.append(tot_toks)

    def _recall_at(k: int) -> float:
        covered: set[str] = set()
        for s in chunk_hits_by_rank[:k]:
            covered.update(s)
        return len(covered) / total_rel_items

    # MRR@10: reciprocal rank of first chunk containing any relevant item
    mrr_10 = 0.0
    for idx, s in enumerate(chunk_hits_by_rank[:10], start=1):
        if s:
            mrr_10 = 1.0 / idx
            break

    # Ideal DCG@5 based on sorted relevance grades
    ideal_grades = sorted(relevant.values(), reverse=True)[:5]
    idcg_5 = sum(
        ((2**g) - 1) / math.log2(rank + 1)
        for rank, g in enumerate(ideal_grades, start=1)
    )
    dcg_5 = sum(
        g / math.log2(rank + 1)
        for rank, g in enumerate(chunk_gains[:5], start=1)
    )
    f_dcg_5 = sum(
        fg / math.log2(rank + 1)
        for rank, fg in enumerate(chunk_focus_gains[:5], start=1)
    )
    ndcg_5 = (dcg_5 / idcg_5) if idcg_5 > 0 else 0.0
    f_ndcg_5 = (f_dcg_5 / idcg_5) if idcg_5 > 0 else 0.0

    # MAP@10
    ap_sum = 0.0
    rel_chunks_so_far = 0
    covered_ap: set[str] = set()
    for rank, s in enumerate(chunk_hits_by_rank[:10], start=1):
        new_items = s - covered_ap
        if new_items:
            rel_chunks_so_far += 1
            covered_ap.update(new_items)
            ap_sum += rel_chunks_so_far / rank
    map_10 = ap_sum / min(total_rel_items, 10)

    # Token-budget Recall@B (how many relevant items are retrieved before
    # cumulative raw chunk tokens exceed budget B)
    def _recall_at_token_budget(budget: int) -> float:
        used_tokens = 0
        covered: set[str] = set()
        for hits, c_toks in zip(chunk_hits_by_rank, chunk_tot_tokens):
            if used_tokens + c_toks > budget and used_tokens > 0:
                # Partial credit if first chunk itself exceeds budget
                break
            used_tokens += c_toks
            covered.update(hits)
            if used_tokens >= budget:
                break
        # If even the first chunk exceeded `budget`, prorate by budget / chunk_tokens
        if not covered and chunk_hits_by_rank and chunk_tot_tokens[0] > budget:
            prorate = min(1.0, budget / chunk_tot_tokens[0])
            return (len(chunk_hits_by_rank[0]) / total_rel_items) * prorate
        return len(covered) / total_rel_items

    # SNR@3
    tot_top3 = sum(chunk_tot_tokens[:3])
    rel_top3 = sum(chunk_rel_tokens[:3])
    snr_3 = min(1.0, rel_top3 / tot_top3) if tot_top3 > 0 else 0.0

    # Distractor Trap Rate@3
    trap_3: float | None = None
    if distractor_set:
        trap_3 = 1.0 if any(chunk_has_trap[:3]) else 0.0

    return QueryEvalResult(
        qid=qid,
        match_type=match_type,
        priority=priority,
        is_gap=False,
        top1_score=top1_score,
        recall_at_1=_recall_at(1),
        recall_at_3=_recall_at(3),
        recall_at_5=_recall_at(5),
        mrr_at_10=mrr_10,
        ndcg_at_5=ndcg_5,
        f_ndcg_at_5=f_ndcg_5,
        map_at_10=map_10,
        recall_at_150tok=_recall_at_token_budget(150),
        recall_at_300tok=_recall_at_token_budget(300),
        snr_at_3=snr_3,
        trap_at_3=trap_3,
        latency_ms=latency_ms,
    )


def compute_gap_auroc(results: list[QueryEvalResult]) -> float:
    """Compute AUROC of `top1_score` for separating supported queries from gaps."""
    pos = [r.top1_score for r in results if not r.is_gap]
    neg = [r.top1_score for r in results if r.is_gap]
    if not pos or not neg:
        return 0.5
    wins = 0.0
    total = float(len(pos) * len(neg))
    for p in pos:
        for n in neg:
            if p > n:
                wins += 1.0
            elif p == n:
                wins += 0.5
    return wins / total


def bootstrap_ci(
    values: list[float],
    *,
    n_boot: int = 1000,
    seed: int = 42,
) -> tuple[float, float, float]:
    """Return `(mean, ci_low_95, ci_high_95)` via non-parametric bootstrap."""
    if not values:
        return (0.0, 0.0, 0.0)
    arr = np.asarray(values, dtype=np.float64)
    mean_val = float(np.mean(arr))
    if len(arr) < 2:
        return (mean_val, mean_val, mean_val)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(arr), size=(n_boot, len(arr)))
    means = np.mean(arr[idx], axis=1)
    lo, hi = np.percentile(means, [2.5, 97.5])
    return (mean_val, float(lo), float(hi))


def paired_permutation_pvalue(
    scores_a: list[float],
    scores_b: list[float],
    *,
    n_perm: int = 2000,
    seed: int = 42,
) -> float:
    r"""Two-sided paired permutation test p-value for $H_0: \mu_A = \mu_B$."""
    a = np.asarray(scores_a, dtype=np.float64)
    b = np.asarray(scores_b, dtype=np.float64)
    diffs = a - b
    obs = abs(float(np.mean(diffs)))
    if obs < 1e-12:
        return 1.0
    rng = np.random.default_rng(seed)
    signs = rng.choice([-1.0, 1.0], size=(n_perm, len(diffs)))
    perm_means = np.abs(np.mean(signs * diffs, axis=1))
    return float((np.sum(perm_means >= obs) + 1) / (n_perm + 1))


def aggregate_query_results(results: list[QueryEvalResult]) -> dict:
    """Aggregate per-query metrics with 95% bootstrap CIs and match_type slices."""
    non_gap = [r for r in results if not r.is_gap]
    traps = [r.trap_at_3 for r in non_gap if r.trap_at_3 is not None]
    latencies = [r.latency_ms for r in results]

    def _stat(vals: list[float]) -> dict:
        mean, lo, hi = bootstrap_ci(vals)
        return {
            "mean": round(mean, 4),
            "ci95_low": round(lo, 4),
            "ci95_high": round(hi, 4),
        }

    by_match_type: dict[str, dict] = {}
    for mt in sorted({r.match_type for r in non_gap}):
        sub = [r for r in non_gap if r.match_type == mt]
        by_match_type[mt] = {
            "count": len(sub),
            "recall_at_3": round(float(np.mean([r.recall_at_3 for r in sub])), 4),
            "mrr_at_10": round(float(np.mean([r.mrr_at_10 for r in sub])), 4),
            "ndcg_at_5": round(float(np.mean([r.ndcg_at_5 for r in sub])), 4),
            "f_ndcg_at_5": round(float(np.mean([r.f_ndcg_at_5 for r in sub])), 4),
        }

    return {
        "num_queries_total": len(results),
        "num_queries_non_gap": len(non_gap),
        "num_queries_gap": len(results) - len(non_gap),
        "recall_at_1": _stat([r.recall_at_1 for r in non_gap]),
        "recall_at_3": _stat([r.recall_at_3 for r in non_gap]),
        "recall_at_5": _stat([r.recall_at_5 for r in non_gap]),
        "mrr_at_10": _stat([r.mrr_at_10 for r in non_gap]),
        "ndcg_at_5": _stat([r.ndcg_at_5 for r in non_gap]),
        "f_ndcg_at_5": _stat([r.f_ndcg_at_5 for r in non_gap]),
        "map_at_10": _stat([r.map_at_10 for r in non_gap]),
        "recall_at_150tok": _stat([r.recall_at_150tok for r in non_gap]),
        "recall_at_300tok": _stat([r.recall_at_300tok for r in non_gap]),
        "snr_at_3": _stat([r.snr_at_3 for r in non_gap]),
        "trap_rate_at_3": round(float(np.mean(traps)), 4) if traps else 0.0,
        "gap_auroc": round(compute_gap_auroc(results), 4),
        "latency_p50_ms": round(float(np.percentile(latencies, 50)), 2) if latencies else 0.0,
        "latency_p95_ms": round(float(np.percentile(latencies, 95)), 2) if latencies else 0.0,
        "by_match_type": by_match_type,
    }
