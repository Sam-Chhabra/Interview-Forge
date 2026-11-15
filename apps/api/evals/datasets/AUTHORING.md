# ResumeJD-Bench — authoring guide

ResumeJD-Bench is a small, hand-crafted benchmark for the retrieval step of
Interview Forge: **given one job-description requirement, find the resume
items that provide evidence for it.** Labels are attached to resume *items*
(bullets), never to chunks, so any chunking strategy can be scored against the
same labels. Validate with:

```bash
cd apps/api && venv/bin/python -m evals.datasets.loader v1
```

## Files

- `v1/resumes/rNN.json` — one resume per file.
- `v1/jds/jNN.json` — one job description per file, including its
  requirements and the relevance judgments against each paired resume.

## Resume schema (`v1/resumes/r01.json`)

```json
{
  "resume_id": "r01",
  "candidate": "Priya Raman",
  "contact": "priya.raman@example.com · Seattle, WA · github.com/praman",
  "role_family": "ml_engineer",
  "seniority": "senior",
  "sections": [
    {"title": "Summary", "entries": [
      {"heading": null, "items": [{"id": "r01-01", "text": "..."}]}
    ]},
    {"title": "Experience", "entries": [
      {"heading": "Senior ML Engineer | Lumen Commerce | 2021 – Present",
       "items": [{"id": "r01-02", "text": "..."}, {"id": "r01-03", "text": "..."}]},
      {"heading": "ML Engineer | Brightpath Health | 2018 – 2021", "items": [...]}
    ]},
    {"title": "Projects", "entries": [...]},
    {"title": "Education", "entries": [...]},
    {"title": "Skills", "entries": [
      {"heading": null, "items": [{"id": "r01-29", "text": "Languages: Python, Go, SQL"}]}
    ]}
  ]
}
```

Rules:
- Item ids are `<resume_id>-NN`, numbered sequentially through the resume
  (`r01-01`, `r01-02`, ...). Every item is one resume bullet / line.
- 24–34 items per resume. Realistic, varied bullets: action verbs, concrete
  tech, metrics ("cut p99 latency 38%"), scope, some soft-skill bullets
  (mentoring, cross-team leadership, incident response, stakeholder comms).
- All people and companies are **fictional**; use `example.com` emails.
- Write like real resumes do — some bullets dense with keywords, some
  narrative, inconsistent abbreviation use (k8s / Kubernetes, GCP / Google
  Cloud, PG / Postgres, TF / Terraform or TensorFlow by context).
- Deliberately plant **lexical traps**: items that share a surface keyword
  with a requirement but are NOT evidence for it (e.g. "JavaScript" vs a
  "Java" requirement, "reactive" vs "React", "sparked adoption" vs "Apache
  Spark", "lambda calculus TA" vs "AWS Lambda", "Go-to-market" vs "Go").

## Job description schema (`v1/jds/j01.json`)

```json
{
  "jd_id": "j01",
  "title": "Senior Machine Learning Engineer, Ranking",
  "company": "Fernwood Labs",
  "text": "Full JD as a candidate would paste it: about the company, the role, responsibilities, requirements, nice-to-haves. 250-450 words.",
  "pairs_with": ["r01", "r02"],
  "requirements": [
    {
      "req_id": "j01-q01",
      "text": "3+ years building and operating production ML systems in Python",
      "priority": "must",
      "judgments": {
        "r01": {"relevant": {"r01-02": 2, "r01-05": 2, "r01-29": 1},
                "match_type": "lexical",
                "distractors": []},
        "r02": {"relevant": {"r02-07": 1}, "match_type": "implicit",
                "distractors": ["r02-03"]}
      }
    }
  ]
}
```

Rules:
- `pairs_with[0]` is the resume written for this JD (good-but-imperfect fit).
  Optionally add one **cross pair**: a resume from an adjacent role (partial
  fit, more gaps). Every requirement must have a judgment for every resume in
  `pairs_with`.
- 8–10 requirements per JD, taken from the JD text (must-haves and
  nice-to-haves), phrased the way JDs phrase them. Mix hard skills, domain
  experience, scale, and soft skills (ownership, mentoring, communication).
- Requirement ids are `<jd_id>-qNN`.

### Relevance grades
- **2 — strong evidence:** an experience/project bullet that directly
  demonstrates the requirement.
- **1 — partial evidence:** a skills-list mention, related-but-weaker
  experience, coursework, or only part of a compound requirement.
- Omit items that are not evidence (grade 0). Be strict: label only what a
  careful hiring manager would accept. Typically 1–4 relevant items.

### `match_type` — how the *best* evidence relates to the requirement
- `lexical` — shares the key terms ("PyTorch" ↔ "PyTorch").
- `abbreviation` — synonym / abbreviation / alternate name
  ("Kubernetes" ↔ "k8s", "Google Cloud" ↔ "GCP", "CI/CD" ↔ "GitHub Actions pipelines").
- `paraphrase` — same capability, little lexical overlap
  ("mentoring junior engineers" ↔ "coached 4 new grads through onboarding").
- `implicit` — requires inference ("experience with large-scale distributed
  systems" ↔ "sharded the event pipeline to 2M msgs/sec across 3 regions").
- `gap` — resume has no evidence; `relevant` MUST be `{}`.

Target distribution across a JD's matched pair: roughly 30% lexical,
15% abbreviation, 25% paraphrase, 15% implicit, 15% gap (at least one gap
per matched pair). Cross pairs naturally have more gaps.

### `distractors`
Item ids that look relevant on the surface (lexical trap or topical
neighbour) but are not evidence. Optional but very valuable for error
analysis — list them whenever you planted a trap for this requirement.

## Quality bar
This benchmark is what the project's retrieval claims rest on. Prefer fewer,
carefully judged requirements over many sloppy ones. Re-read every judgment:
would you defend each label to a skeptical reviewer?
