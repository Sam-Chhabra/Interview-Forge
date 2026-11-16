from __future__ import annotations

import json
import re
import time
from pathlib import Path

import numpy as np

from app.services.chunking_service import (
    ChunkRecord,
    ChunkStrategy,
    chunk_resume_structured,
)
from app.services.embedding_service import (
    embed_texts_local_sync,
    score_cross_encoder_sync,
)
from app.services.grounding_service import verify_question_grounding
from app.services.retrieval_service import (
    InMemoryRetriever,
    RetrievalStrategy,
    tokenize_tech,
)
from evals.datasets.loader import Dataset, load_dataset, summarize, validate
from evals.metrics import (
    QueryEvalResult,
    aggregate_query_results,
    evaluate_ranked_chunks,
    paired_permutation_pvalue,
)

RESULTS_DIR = Path(__file__).parent / "results"
GRADER_DATASET_PATH = Path(__file__).parent / "datasets" / "grader" / "answer_tiers.json"

RETRIEVAL_STRATEGIES: list[tuple[RetrievalStrategy, str]] = [
    ("fts", "PostgreSQL FTS (ts_rank_cd + Snowball)"),
    ("bm25", "BM25Okapi (Tech-Aware Tokenizer)"),
    ("dense", "Dense Bi-Encoder (BGE-small-en-v1.5, 384d)"),
    ("dense_bge_base", "Dense Bi-Encoder (BGE-base-en-v1.5, 768d)"),
    ("hybrid_linear", "Hybrid Convex Fusion (0.6 Dense + 0.4 Lexical)"),
    ("hybrid_rrf", "Hybrid Reciprocal Rank Fusion (RRF, k=60)"),
    ("hybrid_rerank", "Hybrid RRF + MiniLM-L6 Cross-Encoder Rerank"),
    ("hybrid_rerank_bge", "Hybrid RRF + BGE-Reranker-Base Cross-Encoder"),
]

CHUNKING_STRATEGIES: list[tuple[ChunkStrategy, str]] = [
    ("fixed_500_50", "Fixed 500 tokens / 50 overlap (Legacy Baseline)"),
    ("fixed_200_30", "Fixed 200 tokens / 30 overlap"),
    ("fixed_100_20", "Fixed 100 tokens / 20 overlap"),
    ("sentence_window", "Sentence Window (+/- 1 neighbor sentence)"),
    ("bullet_contextual", "Contextual Bullet Chunking ([Section | Role] header)"),
]

def _rankdata(a: list[float] | list[int]) -> np.ndarray:
    arr = np.asarray(a, dtype=np.float64)
    sorter = np.argsort(arr)
    inv = np.empty(sorter.size, dtype=np.intp)
    inv[sorter] = np.arange(sorter.size, dtype=np.intp)
    arr_sorted = arr[sorter]
    obs = np.r_[True, arr_sorted[1:] != arr_sorted[:-1]]
    dense = obs.cumsum()[inv]
    count = np.r_[np.nonzero(obs)[0], len(obs)]
    return 0.5 * (count[dense] + count[dense - 1] + 1)

def _spearman_rho(a: list[int], b: list[float]) -> float:
    ra, rb = _rankdata(a), _rankdata(b)
    return float(np.corrcoef(ra, rb)[0, 1])

def _kendall_tau(a: list[int], b: list[float]) -> float:
    n = len(a)
    concordant = 0
    discordant = 0
    t_a = 0
    t_b = 0
    for i in range(n):
        for j in range(i + 1, n):
            da = a[i] - a[j]
            db = b[i] - b[j]
            if da == 0 and db == 0:
                continue
            elif da == 0:
                t_a += 1
            elif db == 0:
                t_b += 1
            elif da * db > 0:
                concordant += 1
            else:
                discordant += 1
    denom = float(np.sqrt((concordant + discordant + t_a) * (concordant + discordant + t_b)))
    return float(concordant - discordant) / denom if denom > 0 else 0.0

def _rankdata(a: list[float] | list[int]) -> np.ndarray:
    arr = np.asarray(a, dtype=np.float64)
    sorter = np.argsort(arr)
    inv = np.empty(sorter.size, dtype=np.intp)
    inv[sorter] = np.arange(sorter.size, dtype=np.intp)
    arr_sorted = arr[sorter]
    obs = np.r_[True, arr_sorted[1:] != arr_sorted[:-1]]
    dense = obs.cumsum()[inv]
    count = np.r_[np.nonzero(obs)[0], len(obs)]
    return 0.5 * (count[dense] + count[dense - 1] + 1)


def _spearman_rho(a: list[int], b: list[float]) -> float:
    ra, rb = _rankdata(a), _rankdata(b)
    return float(np.corrcoef(ra, rb)[0, 1])


def _kendall_tau(a: list[int], b: list[float]) -> float:
    n = len(a)
    concordant = 0
    discordant = 0
    t_a = 0
    t_b = 0
    for i in range(n):
        for j in range(i + 1, n):
            da = a[i] - a[j]
            db = b[i] - b[j]
            if da == 0 and db == 0:
                continue
            elif da == 0:
                t_a += 1
            elif db == 0:
                t_b += 1
            elif da * db > 0:
                concordant += 1
            else:
                discordant += 1
    denom = float(np.sqrt((concordant + discordant + t_a) * (concordant + discordant + t_b)))
    return float(concordant - discordant) / denom if denom > 0 else 0.0


def run_retrieval_experiment(ds: Dataset) -> tuple[dict, list[dict]]:
    retrievers: dict[str, InMemoryRetriever] = {}
    chunks_by_resume: dict[str, list[ChunkRecord]] = {}
    for rid, resume in ds.resumes.items():
        chunks = chunk_resume_structured(resume.text, strategy="bullet_contextual")
        chunks_by_resume[rid] = chunks
        retrievers[rid] = InMemoryRetriever(chunks, include_bge_base=True)

    queries = ds.queries()
    unique_q_texts = sorted({q.text for q in queries})
    embed_texts_local_sync(unique_q_texts, model_name="BAAI/bge-small-en-v1.5", is_query=True)
    embed_texts_local_sync(unique_q_texts, model_name="BAAI/bge-base-en-v1.5", is_query=True)

    per_strategy_results: dict[str, list[QueryEvalResult]] = {}
    per_strategy_summary: dict[str, dict] = {}
    raw_rankings: dict[str, dict[str, list[tuple[ChunkRecord, float]]]] = {}

    for strat_key, strat_label in RETRIEVAL_STRATEGIES:
        q_results: list[QueryEvalResult] = []
        raw_rankings[strat_key] = {}
        for q in queries:
            retriever = retrievers[q.resume_id]
            resume = ds.resumes[q.resume_id]
            t0 = time.perf_counter()
            hits = retriever.search(q.text, strategy=strat_key, top_k=10)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0

            chunk_map = {c.chunk_index: c for c in chunks_by_resume[q.resume_id]}
            ranked_pairs = [(chunk_map[h.chunk_index], h.score) for h in hits]
            raw_rankings[strat_key][q.qid] = ranked_pairs

            ev = evaluate_ranked_chunks(
                qid=q.qid,
                match_type=q.match_type,
                priority=q.priority,
                relevant=q.relevant,
                distractors=q.distractors,
                ranked_chunks=ranked_pairs,
                resume=resume,
                latency_ms=elapsed_ms,
            )
            q_results.append(ev)

        per_strategy_results[strat_key] = q_results
        agg = aggregate_query_results(q_results)
        agg["strategy"] = strat_key
        agg["label"] = strat_label
        per_strategy_summary[strat_key] = agg

    dense_ndcg = [r.ndcg_at_5 for r in per_strategy_results["dense"] if not r.is_gap]
    fts_ndcg = [r.ndcg_at_5 for r in per_strategy_results["fts"] if not r.is_gap]
    for s_key, agg in per_strategy_summary.items():
        cur_ndcg = [r.ndcg_at_5 for r in per_strategy_results[s_key] if not r.is_gap]
        agg["p_value_vs_dense_ndcg5"] = round(
            paired_permutation_pvalue(cur_ndcg, dense_ndcg), 4
        )
        agg["p_value_vs_fts_ndcg5"] = round(
            paired_permutation_pvalue(cur_ndcg, fts_ndcg), 4
        )

    case_studies: list[dict] = []
    for i, q in enumerate(queries):
        if q.is_gap:
            continue
        r_dense = per_strategy_results["dense"][i]
        r_bm25 = per_strategy_results["bm25"][i]
        r_rerank = per_strategy_results["hybrid_rerank_bge"][i]
        resume = ds.resumes[q.resume_id]

        if r_rerank.recall_at_1 > max(r_dense.recall_at_1, r_bm25.recall_at_1) or (
            r_rerank.ndcg_at_5 - r_dense.ndcg_at_5 >= 0.25
        ):
            dense_top1 = raw_rankings["dense"][q.qid][0][0]
            bm25_top1 = raw_rankings["bm25"][q.qid][0][0]
            rerank_top1 = raw_rankings["hybrid_rerank_bge"][q.qid][0][0]
            gold_texts = [resume.item(iid).text for iid in q.relevant]
            case_studies.append(
                {
                    "qid": q.qid,
                    "match_type": q.match_type,
                    "query": q.text,
                    "gold_evidence": gold_texts[0] if gold_texts else "",
                    "dense_top1": dense_top1.raw_content,
                    "bm25_top1": bm25_top1.raw_content,
                    "hybrid_rerank_top1": rerank_top1.raw_content,
                    "dense_ndcg5": round(r_dense.ndcg_at_5, 3),
                    "bm25_ndcg5": round(r_bm25.ndcg_at_5, 3),
                    "hybrid_rerank_ndcg5": round(r_rerank.ndcg_at_5, 3),
                }
            )
    return per_strategy_summary, case_studies[:10]

def run_chunking_experiment(ds: Dataset) -> dict:
    queries = ds.queries()
    out: dict[str, dict] = {}

    for chunk_key, chunk_label in CHUNKING_STRATEGIES:
        retrievers: dict[str, InMemoryRetriever] = {}
        chunks_by_resume: dict[str, list[ChunkRecord]] = {}
        total_chunks = 0
        total_tokens = 0

        for rid, resume in ds.resumes.items():
            chunks = chunk_resume_structured(resume.text, strategy=chunk_key)
            chunks_by_resume[rid] = chunks
            retrievers[rid] = InMemoryRetriever(chunks)
            total_chunks += len(chunks)
            total_tokens += sum(c.token_count for c in chunks)

        q_results: list[QueryEvalResult] = []
        for q in queries:
            retriever = retrievers[q.resume_id]
            resume = ds.resumes[q.resume_id]
            t0 = time.perf_counter()
            hits = retriever.search(q.text, strategy="hybrid_rerank", top_k=10)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            chunk_map = {c.chunk_index: c for c in chunks_by_resume[q.resume_id]}
            ranked_pairs = [(chunk_map[h.chunk_index], h.score) for h in hits]
            q_results.append(
                evaluate_ranked_chunks(
                    qid=q.qid,
                    match_type=q.match_type,
                    priority=q.priority,
                    relevant=q.relevant,
                    distractors=q.distractors,
                    ranked_chunks=ranked_pairs,
                    resume=resume,
                    latency_ms=elapsed_ms,
                )
            )

        agg = aggregate_query_results(q_results)
        agg["chunk_strategy"] = chunk_key
        agg["label"] = chunk_label
        agg["avg_chunks_per_resume"] = round(total_chunks / max(1, len(ds.resumes)), 1)
        agg["avg_tokens_per_chunk"] = round(total_tokens / max(1, total_chunks), 1)
        out[chunk_key] = agg

    return out

def run_grounding_experiment(ds: Dataset) -> dict:
    samples: list[dict] = []
    resumes_list = list(ds.resumes.values())

    for idx, resume in enumerate(resumes_list):
        exp_items = [it for it in resume.items if len(it.text.split()) >= 7]
        if len(exp_items) < 2:
            continue
        item_a = exp_items[0]
        item_b = exp_items[min(1, len(exp_items) - 1)]

        words = item_a.text.split()
        verbatim_anchor = " ".join(words[: min(8, len(words))]).strip(" ,;.")
        samples.append(
            {
                "label": "grounded_verbatim",
                "is_hallucinated": False,
                "resume_id": resume.resume_id,
                "anchor": verbatim_anchor,
                "question": f"Walk me through your work where you {verbatim_anchor.lower()} and the trade-offs you faced.",
                "rationale": f"Probes concrete execution behind '{verbatim_anchor}'.",
            }
        )

        mid_words = item_b.text.split()
        slice_words = mid_words[1 : min(9, len(mid_words))]
        fuzzy_anchor = " ".join(slice_words).strip(" ,;.")
        samples.append(
            {
                "label": "grounded_fuzzy",
                "is_hallucinated": False,
                "resume_id": resume.resume_id,
                "anchor": fuzzy_anchor,
                "question": f"How did you validate the results when working on {fuzzy_anchor.lower()}?",
                "rationale": f"Tests depth on resume bullet covering {fuzzy_anchor}.",
            }
        )

        other_resume = resumes_list[(idx + 5) % len(resumes_list)]
        other_item = other_resume.items[min(2, len(other_resume.items) - 1)]
        hallucinated_anchor = " ".join(other_item.text.split()[:8]).strip(" ,;.")
        samples.append(
            {
                "label": "hallucinated_cross_resume",
                "is_hallucinated": True,
                "resume_id": resume.resume_id,
                "anchor": hallucinated_anchor,
                "question": f"Tell me about how you architected {hallucinated_anchor.lower()}.",
                "rationale": f"Targets experience with {item_a.text[:60]}.",
            }
        )

    tp = fp = tn = fn = 0
    pre_grounded = 0
    post_repair_grounded = 0
    scores_pos: list[float] = []
    scores_neg: list[float] = []

    for s in samples:
        resume = ds.resumes[s["resume_id"]]
        res = verify_question_grounding(
            anchor=s["anchor"],
            question=s["question"],
            rationale=s["rationale"],
            resume_text=resume.text,
        )
        pred_hallucinated = res.status == "hallucinated"
        actual_hallucinated = s["is_hallucinated"]

        if actual_hallucinated:
            scores_neg.append(res.grounding_score)
            if pred_hallucinated:
                tp += 1
            else:
                fp += 1
        else:
            scores_pos.append(res.grounding_score)
            if not pred_hallucinated:
                tn += 1
            else:
                fn += 1

        if not pred_hallucinated:
            pre_grounded += 1
            post_repair_grounded += 1
        elif res.repaired_anchor:
            re_check = verify_question_grounding(
                anchor=res.repaired_anchor,
                question=s["question"],
                rationale=s["rationale"],
                resume_text=resume.text,
            )
            if re_check.status != "hallucinated":
                post_repair_grounded += 1

    precision = tp / max(1, tp + fp)
    recall = tp / max(1, tp + fn)
    f1 = (2 * precision * recall) / max(1e-9, precision + recall)

    wins = 0.0
    for p in scores_pos:
        for n in scores_neg:
            if p > n:
                wins += 1.0
            elif p == n:
                wins += 0.5
    auroc = wins / max(1, len(scores_pos) * len(scores_neg))

    return {
        "num_questions_evaluated": len(samples),
        "hallucination_detection_precision": round(precision, 4),
        "hallucination_detection_recall": round(recall, 4),
        "hallucination_detection_f1": round(f1, 4),
        "grounding_score_auroc": round(auroc, 4),
        "mean_score_grounded": round(float(np.mean(scores_pos)), 4),
        "mean_score_hallucinated": round(float(np.mean(scores_neg)), 4),
        "pre_guardrail_grounded_rate": round(pre_grounded / max(1, len(samples)), 4),
        "post_repair_grounded_rate": round(post_repair_grounded / max(1, len(samples)), 4),
    }

_METRIC_RE = re.compile(
    r"\b(\d+(?:\.\d+)?\s*(?:%|ms|s|x|k|m|gb|tb|qps|rps|bps|p99|p95|p50|days|hours|weeks|users|nodes|shards|regions))\b",
    re.I,
)
_TRADEOFF_RE = re.compile(
    r"\b(trade-?off|instead of|alternative|chose|because|downside|bottleneck|latency|throughput|consistency|rollback|mitigat|calibrat|ablat|benchmark|root cause|postmortem)\w*",
    re.I,
)
_STRUCTURE_RE = re.compile(
    r"\b(first|second|third|initially|then|finally|result|outcome|impact|specifically|for example|we measured|in production)\b",
    re.I,
)
_DODGE_RE = re.compile(
    r"\b(haven't really|don't have much|not sure|i usually just|let the library|never had to|can't think of|pass on this)\b",
    re.I,
)

def _score_answer_rubric_calibrated(
    question: dict,
    answer_text: str,
) -> dict[str, float]:
    words = answer_text.strip().split()
    n_words = len(words)
    if n_words < 12 or _DODGE_RE.search(answer_text):
        return {"clarity": 1, "structure": 1, "depth": 0, "relevance": 1, "overall": 0.8}

    q_prompt = f"{question['question']} {question['rationale']} {question['anchor']}"
    _, ce_prob = score_cross_encoder_sync(
        q_prompt, [answer_text], model_name="BAAI/bge-reranker-base"
    )[0]

    vecs = embed_texts_local_sync(
        [question["anchor"], question["question"], answer_text], is_query=False
    )
    anchor_sim = float(np.clip(np.dot(vecs[0], vecs[2]), 0.0, 1.0))
    q_sim = float(np.clip(np.dot(vecs[1], vecs[2]), 0.0, 1.0))

    n_metrics = len(_METRIC_RE.findall(answer_text))
    n_tradeoffs = len(_TRADEOFF_RE.findall(answer_text))
    n_struct = len(_STRUCTURE_RE.findall(answer_text))
    anchor_toks = set(tokenize_tech(question["anchor"], stem=True))
    ans_toks = set(tokenize_tech(answer_text, stem=True))
    anchor_overlap = len(anchor_toks & ans_toks) / max(1, len(anchor_toks))

    specificity_density = (2.2 * n_metrics + 1.5 * n_tradeoffs) / max(60.0, n_words) * 100.0

    buzzword_penalty = 0.0
    if n_words >= 110 and n_metrics == 0 and n_tradeoffs <= 1 and anchor_overlap < 0.35:
        buzzword_penalty = 1.2

    relevance = min(
        5.0,
        max(
            1.0,
            1.2 + 2.2 * ce_prob + 1.2 * anchor_overlap + 0.8 * max(anchor_sim, q_sim) - 0.5 * buzzword_penalty,
        ),
    )
    depth = min(
        5.0,
        max(
            0.0,
            0.8
            + min(2.2, 0.55 * n_metrics)
            + min(1.6, 0.35 * n_tradeoffs)
            + 0.7 * anchor_overlap
            - buzzword_penalty,
        ),
    )
    structure = min(
        5.0,
        max(
            1.0,
            1.5
            + min(1.8, 0.45 * n_struct)
            + (1.0 if 75 <= n_words <= 240 else 0.3)
            + (0.7 if n_metrics >= 1 and n_tradeoffs >= 1 else 0.0)
            - 0.6 * buzzword_penalty,
        ),
    )
    clarity = min(
        5.0,
        max(
            1.0,
            1.8 + 0.35 * min(4.0, specificity_density) + 0.8 * ce_prob - 0.7 * buzzword_penalty,
        ),
    )
    overall = round((clarity + structure + depth + relevance) / 4.0, 2)
    return {
        "clarity": round(clarity, 2),
        "structure": round(structure, 2),
        "depth": round(depth, 2),
        "relevance": round(relevance, 2),
        "overall": overall,
    }

def _quadratic_weighted_kappa(y_true: list[int], y_pred: list[int], min_r: int = 1, max_r: int = 4) -> float:
    k = max_r - min_r + 1
    o_mat = np.zeros((k, k), dtype=np.float64)
    for t, p in zip(y_true, y_pred):
        ti = min(max_r, max(min_r, int(t))) - min_r
        pi = min(max_r, max(min_r, int(p))) - min_r
        o_mat[ti, pi] += 1.0
    n = float(len(y_true))
    if n == 0:
        return 0.0
    o_mat /= n
    hist_t = np.sum(o_mat, axis=1)
    hist_p = np.sum(o_mat, axis=0)
    e_mat = np.outer(hist_t, hist_p)

    w_mat = np.zeros((k, k), dtype=np.float64)
    for i in range(k):
        for j in range(k):
            w_mat[i, j] = ((i - j) ** 2) / ((k - 1) ** 2)

    num = float(np.sum(w_mat * o_mat))
    den = float(np.sum(w_mat * e_mat))
    return 1.0 - (num / den) if den > 1e-12 else 1.0

def run_grader_experiment() -> dict:
    if not GRADER_DATASET_PATH.exists():
        return {}
    raw = json.loads(GRADER_DATASET_PATH.read_text(encoding="utf-8"))
    cases = raw.get("cases", [])

    gold_tiers: list[int] = []
    pred_scores: list[float] = []
    pred_tiers: list[int] = []
    length_baseline_scores: list[float] = []

    pairwise_correct = 0
    pairwise_total = 0
    length_pairwise_correct = 0

    confound_cases_total = 0
    confound_rubric_wins = 0
    confound_length_wins = 0

    for c in cases:
        q = c["question"]
        ans_map: dict[int, float] = {}
        len_map: dict[int, int] = {}

        for ans in c["answers"]:
            tier = int(ans["tier"])
            scored = _score_answer_rubric_calibrated(q, ans["text"])
            overall = scored["overall"]
            word_count = len(ans["text"].split())

            ans_map[tier] = overall
            len_map[tier] = word_count
            gold_tiers.append(tier)
            pred_scores.append(overall)
            length_baseline_scores.append(float(word_count))

            if overall >= 3.8:
                mapped_tier = 4
            elif overall >= 2.65:
                mapped_tier = 3
            elif overall >= 1.4:
                mapped_tier = 2
            else:
                mapped_tier = 1
            pred_tiers.append(mapped_tier)

        tiers_desc = sorted(ans_map.keys(), reverse=True)
        for i in range(len(tiers_desc)):
            for j in range(i + 1, len(tiers_desc)):
                hi_t, lo_t = tiers_desc[i], tiers_desc[j]
                pairwise_total += 1
                if ans_map[hi_t] > ans_map[lo_t]:
                    pairwise_correct += 1
                if len_map[hi_t] > len_map[lo_t]:
                    length_pairwise_correct += 1

        if c.get("length_confound"):
            confound_cases_total += 1
            if ans_map.get(3, 0.0) > ans_map.get(2, 0.0):
                confound_rubric_wins += 1
            if len_map.get(3, 0) > len_map.get(2, 0):
                confound_length_wins += 1

    rho = _spearman_rho(gold_tiers, pred_scores)
    tau = _kendall_tau(gold_tiers, pred_scores)
    len_rho = _spearman_rho(gold_tiers, length_baseline_scores)
    qwk = _quadratic_weighted_kappa(gold_tiers, pred_tiers)

    return {
        "num_cases": len(cases),
        "num_answers": len(gold_tiers),
        "num_length_confound_cases": confound_cases_total,
        "rubric_evaluator": {
            "spearman_rho": round(float(rho), 4),
            "kendall_tau": round(float(tau), 4),
            "pairwise_accuracy": round(pairwise_correct / max(1, pairwise_total), 4),
            "quadratic_weighted_kappa": round(qwk, 4),
            "length_confound_accuracy_t3_gt_t2": round(
                confound_rubric_wins / max(1, confound_cases_total), 4
            ),
        },
        "naive_length_heuristic": {
            "spearman_rho": round(float(len_rho), 4),
            "pairwise_accuracy": round(
                length_pairwise_correct / max(1, pairwise_total), 4
            ),
            "length_confound_accuracy_t3_gt_t2": round(
                confound_length_wins / max(1, confound_cases_total), 4
            ),
        },
    }

def run_all_benchmarks(version: str = "v1") -> dict:
    t0 = time.perf_counter()
    ds = load_dataset(version)
    problems = validate(ds)
    if problems:
        raise RuntimeError(f"Dataset validation failed: {problems}")

    retrieval_summary, case_studies = run_retrieval_experiment(ds)
    chunking_summary = run_chunking_experiment(ds)
    grounding_summary = run_grounding_experiment(ds)
    grader_summary = run_grader_experiment()

    queries = ds.queries()
    match_type_counts: dict[str, int] = {}
    for q in queries:
        match_type_counts[q.match_type] = match_type_counts.get(q.match_type, 0) + 1

    payload = {
        "benchmark_version": version,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_runtime_sec": round(time.perf_counter() - t0, 2),
        "dataset_summary": {
            "description": summarize(ds),
            "num_resumes": len(ds.resumes),
            "num_items": sum(len(r.items) for r in ds.resumes.values()),
            "num_jds": len(ds.jds),
            "num_pairs": len(ds.pairs()),
            "num_queries": len(queries),
            "match_type_distribution": dict(sorted(match_type_counts.items())),
        },
        "retrieval_comparison": retrieval_summary,
        "chunking_ablation": chunking_summary,
        "grounding_evaluation": grounding_summary,
        "grader_calibration": grader_summary,
        "case_studies": case_studies,
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out_file = RESULTS_DIR / "latest_benchmark.json"
    out_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload

if __name__ == "__main__":
    report = run_all_benchmarks("v1")
    print(report["dataset_summary"]["description"])
    print(f"Total benchmark runtime: {report['total_runtime_sec']}s")
