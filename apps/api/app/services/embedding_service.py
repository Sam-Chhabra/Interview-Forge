"""
Multi-backend embedding and cross-encoder reranking service.

Supports:
- Local dense bi-encoders via SentenceTransformers (`BAAI/bge-small-en-v1.5`
  384-d, `BAAI/bge-base-en-v1.5` 768-d), padded or projected to 1536-d when
  stored in `ResumeChunk.embedding` (Vector(1536)) or returned at native
  dimensionality for in-memory evaluation sweeps.
- OpenAI `text-embedding-3-small` (1536-d) when a valid `OPENAI_API_KEY` is
  configured, with automatic seamless fallback to local `BAAI/bge-small-en-v1.5`
  embeddings when running offline or without an OpenAI key.
- Local neural Cross-Encoder reranking (`cross-encoder/ms-marco-MiniLM-L-6-v2`
  and `BAAI/bge-reranker-base`) with sigmoid calibration.
- Lightweight serverless fallback (numpy subword/token projection + RapidFuzz
  cross-scoring) when deployed to environments with strict bundle-size limits
  (e.g., Vercel Python Serverless Functions without PyTorch wheels).
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import re
from typing import Any, Literal

import numpy as np
from openai import AsyncOpenAI
from rapidfuzz import fuzz
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    import torch

    # Patch torch.nn.functional.linear on macOS ARM64 CPU to avoid the Apple
    # Accelerate cblas_sgemm NaN bug when multiplying by non-contiguous weight.T.
    def _safe_linear(
        input: torch.Tensor,
        weight: torch.Tensor,
        bias: torch.Tensor | None = None,
    ) -> torch.Tensor:
        out = torch.matmul(input, weight.t().contiguous())
        if bias is not None:
            out = out + bias
        return out

    torch.nn.functional.linear = _safe_linear
    _HAS_TORCH = True
except ImportError:
    _HAS_TORCH = False

_OPENAI_MODEL = "text-embedding-3-small"
_BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
_MAX_BATCH = 100
_PGVECTOR_DIM = 1536

_bi_encoder_cache: dict[str, Any] = {}
_cross_encoder_cache: dict[str, Any] = {}
_text_vec_cache: dict[tuple[str, bool, str], np.ndarray] = {}
_ce_pair_cache: dict[tuple[str, str, str], tuple[float, float]] = {}

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9+#.\-_]*")


def has_valid_openai_key() -> bool:
    key = (settings.openai_api_key or "").strip()
    return bool(key and key != "sk-..." and key.startswith("sk-") and len(key) > 20)


def _hash_embed_text(text: str, dim: int = 384) -> np.ndarray:
    """Deterministic subword + token feature hashing fallback for serverless runtimes."""
    vec = np.zeros(dim, dtype=np.float32)
    tokens = _TOKEN_RE.findall(text.lower())
    for tok in tokens:
        h = int.from_bytes(hashlib.blake2b(tok.encode("utf-8"), digest_size=8).digest(), "little")
        idx = h % dim
        sign = 1.0 if ((h >> 32) & 1) == 0 else -1.0
        vec[idx] += sign * (1.5 if len(tok) > 4 else 1.0)
        for n in (3, 4):
            if len(tok) >= n:
                for i in range(len(tok) - n + 1):
                    sub = tok[i : i + n]
                    sh = int.from_bytes(
                        hashlib.blake2b(sub.encode("utf-8"), digest_size=8).digest(),
                        "little",
                    )
                    vec[sh % dim] += (0.4 if ((sh >> 32) & 1) == 0 else -0.4)
    norm = float(np.linalg.norm(vec))
    if norm > 1e-8:
        vec /= norm
    return vec


def get_bi_encoder(model_name: str = "BAAI/bge-small-en-v1.5") -> Any:
    """Lazy-load and cache a local SentenceTransformer bi-encoder on CPU."""
    if not _HAS_TORCH:
        return None
    if model_name not in _bi_encoder_cache:
        try:
            from sentence_transformers import SentenceTransformer

            logger.info("Loading local bi-encoder %s on CPU", model_name)
            _bi_encoder_cache[model_name] = SentenceTransformer(model_name, device="cpu")
        except Exception as exc:
            logger.warning("Falling back to serverless hash encoder (%s)", exc)
            _bi_encoder_cache[model_name] = None
    return _bi_encoder_cache[model_name]


def get_cross_encoder(model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2") -> Any:
    """Lazy-load and cache a local CrossEncoder reranker on CPU."""
    if not _HAS_TORCH:
        return None
    if model_name not in _cross_encoder_cache:
        try:
            from sentence_transformers import CrossEncoder

            logger.info("Loading local cross-encoder %s on CPU", model_name)
            _cross_encoder_cache[model_name] = CrossEncoder(model_name, device="cpu")
        except Exception as exc:
            logger.warning("Falling back to serverless cross-scorer (%s)", exc)
            _cross_encoder_cache[model_name] = None
    return _cross_encoder_cache[model_name]


def embed_texts_local_sync(
    texts: list[str],
    model_name: str = "BAAI/bge-small-en-v1.5",
    is_query: bool = False,
    pad_to_dim: int | None = None,
) -> np.ndarray:
    """Synchronously embed texts using a local BGE bi-encoder (L2-normalized)."""
    base_dim = 768 if "base" in model_name.lower() else 384
    if not texts:
        return np.zeros((0, pad_to_dim or base_dim), dtype=np.float32)

    encoder = get_bi_encoder(model_name)
    uncached_indices: list[int] = []
    uncached_inputs: list[str] = []
    for idx, t in enumerate(texts):
        key = (model_name, is_query, t)
        if key not in _text_vec_cache:
            uncached_indices.append(idx)
            uncached_inputs.append(
                _BGE_QUERY_PREFIX + t
                if is_query and "bge" in model_name.lower()
                else t
            )

    if uncached_inputs:
        if encoder is not None:
            new_vecs = encoder.encode(
                uncached_inputs,
                batch_size=64,
                normalize_embeddings=True,
                show_progress_bar=False,
                convert_to_numpy=True,
            ).astype(np.float32)
        else:
            new_vecs = np.stack(
                [_hash_embed_text(inp, dim=base_dim) for inp in uncached_inputs],
                axis=0,
            )
        for pos, orig_idx in enumerate(uncached_indices):
            _text_vec_cache[(model_name, is_query, texts[orig_idx])] = new_vecs[pos]

    vecs = np.stack(
        [_text_vec_cache[(model_name, is_query, t)] for t in texts], axis=0
    )

    if pad_to_dim is not None and vecs.shape[1] < pad_to_dim:
        padded = np.zeros((vecs.shape[0], pad_to_dim), dtype=np.float32)
        padded[:, : vecs.shape[1]] = vecs
        return padded
    return vecs


def score_cross_encoder_sync(
    query: str,
    passages: list[str],
    model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
) -> list[tuple[float, float]]:
    """Return `(raw_logit, calibrated_prob)` for each `(query, passage)` pair."""
    if not passages:
        return []
    ce = get_cross_encoder(model_name)
    uncached_pos: list[int] = []
    uncached_pairs: list[tuple[str, str]] = []
    for idx, p in enumerate(passages):
        key = (model_name, query, p)
        if key not in _ce_pair_cache:
            uncached_pos.append(idx)
            uncached_pairs.append((query, p))

    if uncached_pairs:
        if ce is not None:
            logits = ce.predict(uncached_pairs, batch_size=64, show_progress_bar=False)
            raw_list = np.asarray(logits, dtype=np.float64).tolist()
        else:
            q_toks = set(_TOKEN_RE.findall(query.lower()))
            raw_list = []
            for q_str, p_str in uncached_pairs:
                p_toks = set(_TOKEN_RE.findall(p_str.lower()))
                overlap = len(q_toks & p_toks) / max(1, len(q_toks))
                partial = fuzz.token_set_ratio(q_str.lower(), p_str.lower()) / 100.0
                raw_score = (overlap * 4.5 + partial * 3.5) - 3.2
                raw_list.append(float(raw_score))

        for pos, raw in zip(uncached_pos, raw_list):
            prob = 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, raw))))
            _ce_pair_cache[(model_name, query, passages[pos])] = (
                float(raw),
                float(prob),
            )

    return [_ce_pair_cache[(model_name, query, p)] for p in passages]


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
async def _embed_texts_openai(texts: list[str]) -> list[list[float]]:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    embeddings: list[list[float]] = []
    for start in range(0, len(texts), _MAX_BATCH):
        batch = texts[start : start + _MAX_BATCH]
        response = await client.embeddings.create(model=_OPENAI_MODEL, input=batch)
        ordered = sorted(response.data, key=lambda item: item.index)
        embeddings.extend(item.embedding for item in ordered)
    return embeddings


async def embed_texts(
    texts: list[str],
    *,
    is_query: bool = False,
    provider: Literal["auto", "openai", "local"] = "auto",
    local_model: str = "BAAI/bge-small-en-v1.5",
) -> list[list[float]]:
    """Embed a list of texts into 1536-float vectors for `ResumeChunk.embedding`.

    When `provider='auto'` (the default), uses OpenAI `text-embedding-3-small`
    if a valid `OPENAI_API_KEY` is configured and falls back transparently to
    local `BAAI/bge-small-en-v1.5` (zero-padded to 1536-d so cosine similarity
    in pgvector is mathematically identical to 384-d cosine similarity).
    """
    if not texts:
        return []

    use_openai = provider == "openai" or (
        provider == "auto" and has_valid_openai_key()
    )
    if use_openai:
        try:
            return await _embed_texts_openai(texts)
        except Exception as exc:
            if provider == "openai":
                raise
            logger.warning(
                "OpenAI embedding call failed (%s); falling back to local %s",
                exc,
                local_model,
            )

    vecs = await asyncio.to_thread(
        embed_texts_local_sync,
        texts,
        local_model,
        is_query,
        _PGVECTOR_DIM,
    )
    return vecs.tolist()
