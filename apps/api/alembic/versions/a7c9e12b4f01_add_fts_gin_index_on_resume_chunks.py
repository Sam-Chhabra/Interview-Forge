"""add PostgreSQL full-text search GIN index on resume_chunks

Revision ID: a7c9e12b4f01
Revises: 98ee04f767f1
Create Date: 2026-11-15 20:35:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "a7c9e12b4f01"
down_revision: Union[str, None] = "98ee04f767f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_resume_chunks_content_fts
        ON resume_chunks
        USING gin (to_tsvector('english', content))
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_resume_chunks_content_fts")
