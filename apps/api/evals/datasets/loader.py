from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

DATASETS_DIR = Path(__file__).parent
MATCH_TYPES = {"lexical", "abbreviation", "paraphrase", "implicit", "gap"}
PRIORITIES = {"must", "nice"}
BULLET = "• "

@dataclass(frozen=True)
class Item:
    id: str
    text: str
    section: str
    heading: str | None
    start: int
    end: int

@dataclass
class Resume:
    resume_id: str
    candidate: str
    role_family: str
    seniority: str
    text: str
    items: list[Item]

    def item(self, item_id: str) -> Item:
        return self._index[item_id]

    def __post_init__(self) -> None:
        self._index = {it.id: it for it in self.items}

@dataclass
class Judgment:
    relevant: dict[str, int]
    match_type: str
    distractors: list[str] = field(default_factory=list)

@dataclass
class Requirement:
    req_id: str
    text: str
    priority: str
    judgments: dict[str, Judgment]

@dataclass
class JobDescription:
    jd_id: str
    title: str
    company: str
    text: str
    pairs_with: list[str]
    requirements: list[Requirement]

@dataclass
class Query:

    qid: str
    jd_id: str
    resume_id: str
    text: str
    priority: str
    match_type: str
    relevant: dict[str, int]
    distractors: list[str]

    @property
    def is_gap(self) -> bool:
        return not self.relevant

@dataclass
class Dataset:
    version: str
    resumes: dict[str, Resume]
    jds: dict[str, JobDescription]

    def pairs(self) -> list[tuple[str, str]]:
        return [(jd.jd_id, rid) for jd in self.jds.values() for rid in jd.pairs_with]

    def queries(self, pair_ids: set[str] | None = None) -> list[Query]:
        out: list[Query] = []
        for jd in self.jds.values():
            for rid in jd.pairs_with:
                if pair_ids is not None and f"{jd.jd_id}:{rid}" not in pair_ids:
                    continue
                for req in jd.requirements:
                    j = req.judgments[rid]
                    out.append(
                        Query(
                            qid=f"{req.req_id}:{rid}",
                            jd_id=jd.jd_id,
                            resume_id=rid,
                            text=req.text,
                            priority=req.priority,
                            match_type=j.match_type,
                            relevant=dict(j.relevant),
                            distractors=list(j.distractors),
                        )
                    )
        return out

def render_resume(raw: dict) -> tuple[str, list[Item]]:
    lines: list[str] = []
    items: list[Item] = []
    offset = 0

    def emit(line: str) -> int:
        nonlocal offset
        start = offset
        lines.append(line)
        offset += len(line) + 1  # +1 for the "\n" join
        return start

    emit(raw["candidate"])
    if raw.get("contact"):
        emit(raw["contact"])
    for section in raw["sections"]:
        emit("")
        emit(section["title"].upper())
        for entry in section["entries"]:
            heading = entry.get("heading")
            if heading:
                emit(heading)
            for it in entry["items"]:
                start = emit(BULLET + it["text"]) + len(BULLET)
                items.append(
                    Item(
                        id=it["id"],
                        text=it["text"],
                        section=section["title"].upper(),
                        heading=heading,
                        start=start,
                        end=start + len(it["text"]),
                    )
                )
    return "\n".join(lines), items

def _load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)

def load_dataset(version: str = "v1") -> Dataset:
    root = DATASETS_DIR / version
    resumes: dict[str, Resume] = {}
    for path in sorted((root / "resumes").glob("*.json")):
        raw = _load_json(path)
        text, items = render_resume(raw)
        resumes[raw["resume_id"]] = Resume(
            resume_id=raw["resume_id"],
            candidate=raw["candidate"],
            role_family=raw["role_family"],
            seniority=raw.get("seniority", ""),
            text=text,
            items=items,
        )

    jds: dict[str, JobDescription] = {}
    for path in sorted((root / "jds").glob("*.json")):
        raw = _load_json(path)
        reqs = [
            Requirement(
                req_id=r["req_id"],
                text=r["text"],
                priority=r["priority"],
                judgments={
                    rid: Judgment(
                        relevant={k: int(v) for k, v in j["relevant"].items()},
                        match_type=j["match_type"],
                        distractors=j.get("distractors", []),
                    )
                    for rid, j in r["judgments"].items()
                },
            )
            for r in raw["requirements"]
        ]
        jds[raw["jd_id"]] = JobDescription(
            jd_id=raw["jd_id"],
            title=raw["title"],
            company=raw["company"],
            text=raw["text"],
            pairs_with=raw["pairs_with"],
            requirements=reqs,
        )
    return Dataset(version=version, resumes=resumes, jds=jds)

def validate(ds: Dataset) -> list[str]:
    errors: list[str] = []
    seen_items: set[str] = set()
    for r in ds.resumes.values():
        for it in r.items:
            if it.id in seen_items:
                errors.append(f"duplicate item id {it.id}")
            seen_items.add(it.id)
            if not it.id.startswith(r.resume_id + "-"):
                errors.append(f"item {it.id} not prefixed with {r.resume_id}-")
            if r.text[it.start : it.end] != it.text:
                errors.append(f"offset mismatch for {it.id}")
        if not 18 <= len(r.items) <= 45:
            errors.append(f"{r.resume_id}: {len(r.items)} items (expected 18-45)")

    seen_reqs: set[str] = set()
    for jd in ds.jds.values():
        for rid in jd.pairs_with:
            if rid not in ds.resumes:
                errors.append(f"{jd.jd_id}: pairs_with unknown resume {rid}")
        for req in jd.requirements:
            if req.req_id in seen_reqs:
                errors.append(f"duplicate req id {req.req_id}")
            seen_reqs.add(req.req_id)
            if req.priority not in PRIORITIES:
                errors.append(f"{req.req_id}: bad priority {req.priority}")
            if set(req.judgments) != set(jd.pairs_with):
                errors.append(
                    f"{req.req_id}: judgments for {sorted(req.judgments)} "
                    f"but pairs_with={jd.pairs_with}"
                )
            for rid, j in req.judgments.items():
                resume = ds.resumes.get(rid)
                if resume is None:
                    continue
                if j.match_type not in MATCH_TYPES:
                    errors.append(f"{req.req_id}/{rid}: bad match_type {j.match_type}")
                if (j.match_type == "gap") != (not j.relevant):
                    errors.append(
                        f"{req.req_id}/{rid}: match_type 'gap' iff relevant is empty"
                    )
                for item_id, grade in j.relevant.items():
                    if item_id not in resume._index:
                        errors.append(f"{req.req_id}/{rid}: unknown item {item_id}")
                    if grade not in (1, 2):
                        errors.append(f"{req.req_id}/{rid}: grade {grade} not in {{1,2}}")
                for d in j.distractors:
                    if d not in resume._index:
                        errors.append(f"{req.req_id}/{rid}: unknown distractor {d}")
                    if d in j.relevant:
                        errors.append(f"{req.req_id}/{rid}: {d} both relevant and distractor")
    return errors

def summarize(ds: Dataset) -> str:
    qs = ds.queries()
    by_type: dict[str, int] = {}
    for q in qs:
        by_type[q.match_type] = by_type.get(q.match_type, 0) + 1
    n_items = sum(len(r.items) for r in ds.resumes.values())
    return (
        f"ResumeJD-Bench {ds.version}: {len(ds.resumes)} resumes ({n_items} items), "
        f"{len(ds.jds)} JDs, {len(ds.pairs())} pairs, {len(qs)} queries; "
        f"match types: {dict(sorted(by_type.items()))}"
    )

if __name__ == "__main__":
    version = sys.argv[1] if len(sys.argv) > 1 else "v1"
    dataset = load_dataset(version)
    problems = validate(dataset)
    print(summarize(dataset))
    if problems:
        print(f"\n{len(problems)} problem(s):")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("OK")
