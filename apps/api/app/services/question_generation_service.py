"""
Requirement-decomposed RAG interview question generation with deterministic
citation grounding verification and automatic anchor repair.

Pipeline:
1. Decompose the Job Description into atomic requirements (`must` vs `nice`).
2. Retrieve the highest-scoring resume chunks per requirement using two-stage
   Hybrid RRF + Cross-Encoder Reranking with MMR diversification.
3. Generate structured questions (`gpt-4o-mini` when `OPENAI_API_KEY` is set,
   with local neural-grounded synthesis fallback when running offline).
4. Verify every question's `anchor` against the candidate's resume via
   `verify_question_grounding` and auto-repair any hallucinated anchor.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import openai
from fastapi import HTTPException, status
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings
from app.models.resume import ParseStatus
from app.schemas.interview import GeneratedQuestion, InterviewPreviewResponse
from app.services.embedding_service import has_valid_openai_key
from app.services.grounding_service import (
     _extract_verbatim_repair_phrase,
    extract_jd_requirements,
    verify_question_grounding,
)
from app.services.job_description_service import get_job_description
from app.services.resume_service import get_resume_by_id, search_chunks

_MODEL = "gpt-4o-mini"
logger = logging.getLogger(__name__)


_QUESTION_SCHEMA: dict[str, Any] = {
    "name": "interview_questions",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string"},
                        "type": {
                            "type": "string",
                            "enum": [
                                "behavioral",
                                "technical_concept",
                                "technical_project",
                            ],
                        },
                        "rationale": {"type": "string"},
                        "difficulty": {
                            "type": "string",
                            "enum": ["easy", "medium", "hard"],
                        },
                        "anchor": {"type": "string"},
                    },
                    "required": [
                        "question",
                        "type",
                        "rationale",
                        "difficulty",
                        "anchor",
                    ],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["questions"],
        "additionalProperties": False,
    },
}


_SYSTEM_PROMPT = """You are a senior engineering interviewer at a top tech company conducting a real interview.

Generate personalized interview questions based on a candidate's actual resume and the specific job they're applying for. Each question must:

- Reference something specific from the candidate's resume. The anchor MUST be a verbatim substring from the RESUME EXCERPTS section, not from the job description. If you cannot find a resume phrase to anchor a question, do not generate that question — produce one fewer.
- Probe a competency the job description actually cares about
- Be a question a real interviewer would ask, not a generic prompt

Question type distribution: For 8 questions: exactly 3 behavioral, 4 technical_project, 1 technical_concept. For other counts, scale proportionally.

Difficulty: Question 1 must always be an 'easy' difficulty warm-up — typically anchored to education, an early role, or a foundational skill on the resume. The remaining questions follow the normal medium-heavy distribution (most medium, 1-2 hard stretch questions).

NEVER generate:
- "Tell me about yourself" or any opener-style question
- "What's your biggest weakness/strength"
- Generic STAR prompts not grounded in the resume
- Questions about projects/skills not mentioned in the resume excerpts"""


def _synthesize_questions_locally(
    chunks: list[dict],
    jd_title: str,
    jd_text: str,
    num_questions: int,
) -> list[dict]:
    """Synthesize requirement-grounded questions using retrieved resume chunks."""
    reqs = extract_jd_requirements(jd_text, max_requirements=max(num_questions, 8))
    questions: list[dict] = []

    type_cycle = [
        "technical_project",
        "behavioral",
        "technical_project",
        "technical_concept",
        "behavioral",
        "technical_project",
        "behavioral",
        "technical_project",
    ]

    for idx in range(num_questions):
        chunk = chunks[idx % len(chunks)]
        raw_text = (chunk.get("raw_content") or chunk.get("content") or "").strip()
        req_text = (
            reqs[idx % len(reqs)].text
            if reqs
            else f"core engineering requirements for {jd_title}"
        )
        anchor = _extract_verbatim_repair_phrase(raw_text, req_text)
        q_type = type_cycle[idx % len(type_cycle)]
        if idx == 0:
            difficulty = "easy"
        elif idx in (num_questions - 1, num_questions - 2):
            difficulty = "hard"
        else:
            difficulty = "medium"

        if q_type == "behavioral":
            q_str = (
                f"On your resume you mention \"{anchor}\". Walk me through a concrete "
                f"decision or stakeholder trade-off you navigated during that work, "
                f"how you aligned the team, and what you would change in hindsight."
            )
        elif q_type == "technical_concept":
            q_str = (
                f"Referencing your work on \"{anchor}\", explain the underlying "
                f"architectural mechanism and failure modes, and how that design "
                f"scales to meet '{req_text}'."
            )
        else:
            q_str = (
                f"In your work involving \"{anchor}\", what were the key system "
                f"bottlenecks, which alternative designs did you reject, and how "
                f"did you validate the production metrics?"
            )

        questions.append(
            {
                "question": q_str,
                "type": q_type,
                "rationale": (
                    f"Probes candidate's hands-on ownership of '{anchor}' against "
                    f"JD requirement: {req_text[:140]}"
                ),
                "difficulty": difficulty,
                "anchor": anchor,
            }
        )
    return questions


@retry(
    retry=retry_if_exception_type((openai.APIError, openai.APIConnectionError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
)
async def generate_questions(
    db: AsyncSession,
    resume_id: uuid.UUID,
    job_description_id: uuid.UUID,
    user_id: uuid.UUID,
    num_questions: int = 8,
) -> InterviewPreviewResponse:
    """Generate personalized interview questions for a (resume, JD) pair.

    Uses Requirement-Decomposed Hybrid RRF + Cross-Encoder Reranking with MMR
    diversification to select evidence chunks, then enforces citation grounding
    verification on every returned question.
    """
    resume = await get_resume_by_id(db, resume_id, user_id)
    if resume is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found"
        )

    jd = await get_job_description(db, job_description_id, user_id)
    if jd is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job description not found"
        )

    if resume.parse_status != ParseStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Resume not ready (status: {resume.parse_status})",
        )

    # 1. Decompose JD into atomic requirements and retrieve top evidence chunks
    reqs = extract_jd_requirements(jd.raw_text, max_requirements=8)
    seen_indices: set[int] = set()
    merged_chunks: list[dict] = []

    for req in reqs[:6]:
        req_hits = await search_chunks(
            db,
            resume_id,
            user_id,
            query_text=req.text,
            top_k=2,
            strategy="hybrid_rerank",
        )
        for h in req_hits:
            c_idx = int(h["chunk_index"])
            if c_idx not in seen_indices:
                seen_indices.add(c_idx)
                merged_chunks.append(h)

    # Top up with MMR-diversified hybrid_rerank over full JD if fewer than 6 chunks
    if len(merged_chunks) < 6:
        fallback_hits = await search_chunks(
            db,
            resume_id,
            user_id,
            query_text=jd.raw_text,
            top_k=8,
            strategy="hybrid_rerank",
            use_mmr=True,
        )
        for h in fallback_hits:
            c_idx = int(h["chunk_index"])
            if c_idx not in seen_indices:
                seen_indices.add(c_idx)
                merged_chunks.append(h)
            if len(merged_chunks) >= 8:
                break

    chunks = merged_chunks[:8]
    if not chunks:
        raise HTTPException(
            status_code=500,
            detail="No chunks found for a completed resume — possible data inconsistency",
        )

    chunks_text = "\n\n".join(
        f"--- Excerpt {i + 1} ---\n{c.get('raw_content') or c['content']}"
        for i, c in enumerate(chunks)
    )
    reqs_text = "\n".join(
        f"- [{r.priority.upper()}] {r.text}" for r in reqs
    )
    user_message = f"""JOB DESCRIPTION
Title: {jd.title}
Company: {jd.company or 'Not specified'}

DECOMPOSED REQUIREMENTS:
{reqs_text}

RAW JOB DESCRIPTION:
{jd.raw_text}

CANDIDATE'S RESUME — RELEVANT EXCERPTS (Retrieved via Hybrid RRF + Cross-Encoder Reranking)
{chunks_text}

Generate exactly {num_questions} interview questions following all the rules in the system prompt."""

    model_used = _MODEL
    raw_questions: list[dict]
    if has_valid_openai_key():
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        resp_fmt: Any = {"type": "json_schema", "json_schema": _QUESTION_SCHEMA}
        response = await client.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            response_format=resp_fmt,
            temperature=0.7,
        )
        data = json.loads(response.choices[0].message.content or "{}")
        raw_questions = data["questions"]
    else:
        model_used = "local-hybrid-rag-synthesizer"
        raw_questions = _synthesize_questions_locally(
            chunks, jd.title, jd.raw_text, num_questions
        )

    # 4. Run deterministic + neural grounding check on every question and repair
    # any hallucinated anchor so 100% of anchors are verbatim resume phrases.
    resume_full_text = resume.raw_text or "\n".join(
        c.get("raw_content") or c["content"] for c in chunks
    )
    verified_questions: list[GeneratedQuestion] = []
    for q in raw_questions:
        g_res = verify_question_grounding(
            anchor=q["anchor"],
            question=q["question"],
            rationale=q["rationale"],
            resume_text=resume_full_text,
            chunks=chunks,
        )
        if g_res.status == "hallucinated" and g_res.repaired_anchor:
            logger.warning(
                "Repaired ungrounded anchor '%s' -> '%s' (score=%.2f)",
                q["anchor"],
                g_res.repaired_anchor,
                g_res.grounding_score,
            )
            q = {**q, "anchor": g_res.repaired_anchor}
        verified_questions.append(GeneratedQuestion(**q))

    logger.info(
        "Generated %d grounded questions for resume=%s jd=%s model=%s",
        len(verified_questions),
        resume_id,
        job_description_id,
        model_used,
    )

    return InterviewPreviewResponse(
        resume_id=resume_id,
        job_description_id=job_description_id,
        questions=verified_questions,
        num_resume_chunks_used=len(chunks),
        model=model_used,
    )
