from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

import tiktoken

_encoder = tiktoken.get_encoding("cl100k_base")

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")

_SECTION_KEYWORDS = {
    "SUMMARY",
    "PROFESSIONAL SUMMARY",
    "PROFILE",
    "OBJECTIVE",
    "EXPERIENCE",
    "WORK EXPERIENCE",
    "PROFESSIONAL EXPERIENCE",
    "EMPLOYMENT",
    "PROJECTS",
    "SELECTED PROJECTS",
    "TECHNICAL PROJECTS",
    "EDUCATION",
    "SKILLS",
    "TECHNICAL SKILLS",
    "CORE COMPETENCIES",
    "PUBLICATIONS",
    "CERTIFICATIONS",
    "AWARDS",
    "LEADERSHIP",
}

_BULLET_PREFIX = re.compile(r"^\s*(?:[•\-\*\u2022\u2023\u25E6]|\d+\.)\s+")

ChunkStrategy = Literal[
    "fixed_500_50",
    "fixed_200_30",
    "fixed_100_20",
    "sentence_window",
    "bullet_contextual",
]

@dataclass(frozen=True)
class ChunkRecord:

    chunk_index: int
    content: str
    raw_content: str
    section_title: str | None
    context_header: str | None
    start_char: int
    end_char: int
    token_count: int
    strategy: str

def count_tokens(text: str) -> int:
    return len(_encoder.encode(text))

def _count_tokens(text: str) -> int:
    return len(_encoder.encode(text))

def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_BOUNDARY.split(text) if s.strip()]

def _split_by_token_window(text: str, window: int) -> list[str]:
    tokens = _encoder.encode(text)
    return [
        _encoder.decode(tokens[start : start + window])
        for start in range(0, len(tokens), window)
    ]

def _tail_tokens(text: str, n: int) -> str:
    if n <= 0:
        return ""
    tokens = _encoder.encode(text)
    if len(tokens) <= n:
        return text
    return _encoder.decode(tokens[-n:])

def _segment(text: str, target_tokens: int) -> list[str]:
    segments: list[str] = []
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    for para in paragraphs:
        if _count_tokens(para) <= target_tokens:
            segments.append(para)
            continue
        for sentence in _split_sentences(para):
            if _count_tokens(sentence) <= target_tokens:
                segments.append(sentence)
            else:
                segments.extend(_split_by_token_window(sentence, target_tokens))
    return segments

def chunk_text(
    text: str,
    target_tokens: int = 500,
    overlap_tokens: int = 50,
) -> list[str]:
    segments = _segment(text, target_tokens)
    if not segments:
        return []

    chunks: list[str] = []
    current: list[str] = []
    current_tokens = 0
    has_real_segment = False

    for seg in segments:
        seg_tokens = _count_tokens(seg)
        if has_real_segment and current_tokens + seg_tokens > target_tokens:
            chunk_str = "\n\n".join(current)
            chunks.append(chunk_str)
            overlap = _tail_tokens(chunk_str, overlap_tokens)
            current = [overlap] if overlap else []
            current_tokens = _count_tokens(overlap) if overlap else 0
            has_real_segment = False
        current.append(seg)
        current_tokens += seg_tokens
        has_real_segment = True

    if has_real_segment:
        chunks.append("\n\n".join(current))

    return chunks

def _is_section_header(line: str) -> bool:
    stripped = line.strip().rstrip(":")
    if not stripped or len(stripped) > 48:
        return False
    if stripped.upper() in _SECTION_KEYWORDS:
        return True
    if (
        stripped.isupper()
        and not _BULLET_PREFIX.match(line)
        and "|" not in stripped
        and len(stripped.split()) <= 4
    ):
        return True
    return False

def _is_entry_heading(line: str) -> bool:
    stripped = line.strip()
    if not stripped or _BULLET_PREFIX.match(line) or _is_section_header(line):
        return False
    if "|" in stripped and len(stripped) <= 140:
        return True
    if re.search(r"\b(19|20)\d{2}\b", stripped) and len(stripped) <= 120:
        return True
    return False

def _chunk_fixed_with_spans(
    text: str,
    target_tokens: int,
    overlap_tokens: int,
    strategy_name: str,
) -> list[ChunkRecord]:
    if not text.strip():
        return []

    line_spans: list[tuple[str, int, int]] = []
    cursor = 0
    for raw_line in text.split("\n"):
        start = cursor
        end = cursor + len(raw_line)
        cursor = end + 1
        if raw_line.strip():
            line_spans.append((raw_line.strip(), start, end))

    if not line_spans:
        return []

    records: list[ChunkRecord] = []
    idx = 0
    n = len(line_spans)
    i = 0
    while i < n:
        buf_lines: list[str] = []
        span_start = line_spans[i][1]
        span_end = line_spans[i][2]
        tok_total = 0
        j = i
        while j < n:
            line_text, l_start, l_end = line_spans[j]
            l_toks = _count_tokens(line_text)
            if buf_lines and tok_total + l_toks > target_tokens:
                break
            buf_lines.append(line_text)
            span_end = l_end
            tok_total += l_toks
            j += 1

        raw_chunk = "\n".join(buf_lines)
        records.append(
            ChunkRecord(
                chunk_index=idx,
                content=raw_chunk,
                raw_content=raw_chunk,
                section_title=None,
                context_header=None,
                start_char=span_start,
                end_char=span_end,
                token_count=_count_tokens(raw_chunk),
                strategy=strategy_name,
            )
        )
        idx += 1
        if j >= n:
            break

        back_tokens = 0
        back_j = j
        while back_j > i + 1:
            prev_toks = _count_tokens(line_spans[back_j - 1][0])
            if back_tokens + prev_toks > overlap_tokens:
                break
            back_tokens += prev_toks
            back_j -= 1
        i = back_j

    return records

def _chunk_sentence_window(text: str, window_radius: int = 1) -> list[ChunkRecord]:
    if not text.strip():
        return []

    sentences: list[tuple[str, int, int]] = []
    cursor = 0
    for raw_line in text.split("\n"):
        line_start = cursor
        line_end = cursor + len(raw_line)
        cursor = line_end + 1
        stripped = raw_line.strip()
        if not stripped or _is_section_header(stripped):
            continue
        pos = 0
        for part in _SENTENCE_BOUNDARY.split(raw_line):
            part_str = part.strip()
            if not part_str:
                continue
            rel = raw_line.find(part_str, pos)
            if rel == -1:
                rel = 0
            s_start = line_start + rel
            s_end = s_start + len(part_str)
            pos = rel + len(part_str)
            sentences.append((part_str, s_start, s_end))

    records: list[ChunkRecord] = []
    for idx, (sent, s_start, s_end) in enumerate(sentences):
        lo = max(0, idx - window_radius)
        hi = min(len(sentences), idx + window_radius + 1)
        window_text = " ".join(sentences[k][0] for k in range(lo, hi))
        w_start = sentences[lo][1]
        w_end = sentences[hi - 1][2]
        records.append(
            ChunkRecord(
                chunk_index=idx,
                content=window_text,
                raw_content=sent,
                section_title=None,
                context_header=None,
                start_char=w_start,
                end_char=w_end,
                token_count=_count_tokens(window_text),
                strategy="sentence_window",
            )
        )
    return records

def _chunk_bullet_contextual(text: str) -> list[ChunkRecord]:
    if not text.strip():
        return []

    records: list[ChunkRecord] = []
    current_section: str | None = None
    current_heading: str | None = None
    cursor = 0
    line_num = 0

    for raw_line in text.split("\n"):
        line_start = cursor
        line_end = cursor + len(raw_line)
        cursor = line_end + 1
        stripped = raw_line.strip()
        if not stripped:
            continue
        line_num += 1

        if current_section is None and line_num <= 2 and not _is_section_header(stripped):
            continue

        if _is_section_header(stripped):
            current_section = stripped.rstrip(":").upper()
            current_heading = None
            continue

        if _is_entry_heading(stripped):
            current_heading = stripped
            continue

        bullet_match = _BULLET_PREFIX.match(raw_line)
        if bullet_match:
            prefix_len = bullet_match.end()
            item_text = raw_line[prefix_len:].strip()
            item_start = line_start + prefix_len
            item_end = item_start + len(item_text)
        else:
            lead_ws = len(raw_line) - len(raw_line.lstrip())
            item_text = stripped
            item_start = line_start + lead_ws
            item_end = item_start + len(item_text)

        if not item_text:
            continue

        ctx_parts: list[str] = []
        if current_section:
            ctx_parts.append(f"Section: {current_section}")
        if current_heading:
            ctx_parts.append(f"Role: {current_heading}")
        context_header = f"[{' | '.join(ctx_parts)}]" if ctx_parts else None
        enriched_content = (
            f"{context_header} {item_text}" if context_header else item_text
        )

        records.append(
            ChunkRecord(
                chunk_index=len(records),
                content=enriched_content,
                raw_content=item_text,
                section_title=current_section,
                context_header=context_header,
                start_char=item_start,
                end_char=item_end,
                token_count=_count_tokens(enriched_content),
                strategy="bullet_contextual",
            )
        )

    if not records:
        return _chunk_fixed_with_spans(text, 120, 20, "bullet_contextual")

    return records

def chunk_resume_structured(
    text: str,
    strategy: ChunkStrategy = "bullet_contextual",
) -> list[ChunkRecord]:
    if strategy == "fixed_500_50":
        return _chunk_fixed_with_spans(text, 500, 50, "fixed_500_50")
    if strategy == "fixed_200_30":
        return _chunk_fixed_with_spans(text, 200, 30, "fixed_200_30")
    if strategy == "fixed_100_20":
        return _chunk_fixed_with_spans(text, 100, 20, "fixed_100_20")
    if strategy == "sentence_window":
        return _chunk_sentence_window(text, window_radius=1)
    if strategy == "bullet_contextual":
        return _chunk_bullet_contextual(text)
    raise ValueError(f"Unknown chunking strategy: {strategy}")
