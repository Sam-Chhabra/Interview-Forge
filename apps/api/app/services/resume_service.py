import asyncio
import logging
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.resume import ParseStatus, Resume
from app.models.resume_chunk import ResumeChunk
from app.services.chunking_service import chunk_resume_structured, chunk_text
from app.services.embedding_service import embed_texts
from app.services.pdf_service import extract_text_from_pdf
from app.services.retrieval_service import (
    RetrievalStrategy,
    retrieve_chunks_for_resume,
)

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 8 * 1024

async def save_uploaded_file(
    file: UploadFile,
    resume_id: uuid.UUID,
    upload_dir: str,
    max_bytes: int,
) -> tuple[int, str]:
    Path(upload_dir).mkdir(parents=True, exist_ok=True)
    dest = Path(upload_dir) / f"{resume_id}.pdf"

    total = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(_CHUNK_SIZE)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="File exceeds max size",
                    )
                out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise

    return total, str(dest)

async def get_resume_by_id(
    db: AsyncSession, resume_id: uuid.UUID, user_id: uuid.UUID
) -> Resume | None:
    return await db.scalar(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user_id)
    )

async def list_resumes_for_user(
    db: AsyncSession, user_id: uuid.UUID
) -> list[Resume]:
    result = await db.scalars(
        select(Resume)
        .where(Resume.user_id == user_id)
        .order_by(Resume.created_at.desc())
    )
    return list(result)

async def parse_resume(resume_id: uuid.UUID, file_path: str) -> None:
    async with AsyncSessionLocal() as db:
        try:
            resume = await db.get(Resume, resume_id)
            if resume is None:
                logger.error("Resume %s not found; aborting parse", resume_id)
                return

            resume.parse_status = ParseStatus.processing
            await db.commit()

            text = await asyncio.to_thread(extract_text_from_pdf, file_path)
            resume.raw_text = text
            await db.commit()

            structured_chunks = chunk_resume_structured(
                text, strategy="bullet_contextual"
            )
            chunks = (
                [c.content for c in structured_chunks]
                if structured_chunks
                else chunk_text(text)
            )
            if not chunks:
                raise ValueError("Chunking produced zero chunks")
            embeddings = await embed_texts(chunks, is_query=False)
            assert len(embeddings) == len(chunks), (
                f"Embedding count {len(embeddings)} != chunk count {len(chunks)}"
            )

            for i, (chunk_str, emb) in enumerate(zip(chunks, embeddings)):
                db.add(
                    ResumeChunk(
                        resume_id=resume_id,
                        content=chunk_str,
                        chunk_index=i,
                        embedding=emb,
                    )
                )

            resume.parse_status = ParseStatus.completed
            await db.commit()
        except Exception as exc:
            logger.exception("Resume %s parse failed: %s", resume_id, exc)
            await db.rollback()
            try:
                resume = await db.get(Resume, resume_id)
                if resume:
                    resume.parse_status = ParseStatus.failed
                    await db.commit()
            except Exception:
                await db.rollback()

async def search_chunks(
    db: AsyncSession,
    resume_id: uuid.UUID,
    user_id: uuid.UUID,
    query_text: str,
    top_k: int = 5,
    strategy: RetrievalStrategy = "hybrid_rerank",
    use_mmr: bool = False,
) -> list[dict]:
    resume = await get_resume_by_id(db, resume_id, user_id)
    if resume is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found"
        )

    results, _ = await retrieve_chunks_for_resume(
        db,
        resume_id,
        query_text,
        strategy=strategy,
        top_k=top_k,
        use_mmr=use_mmr,
    )
    return results
