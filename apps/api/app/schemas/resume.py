import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

class ResumeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    parse_status: str
    created_at: datetime

class ResumeListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    parse_status: str
    created_at: datetime

class ResumeChunkMatch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    chunk_index: int
    content: str
    raw_content: str | None = None
    section_title: str | None = None
    context_header: str | None = None
    similarity: float
    dense_score: float | None = None
    lexical_score: float | None = None
    rerank_score: float | None = None
    rerank_prob: float | None = None
    dense_rank: int | None = None
    lexical_rank: int | None = None
    strategy: str | None = None
    matched_terms: list[str] | None = None
