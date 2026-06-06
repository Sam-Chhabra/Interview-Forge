"""
AI evaluator for interview answers.

Scores a candidate's typed answer against a 4-dimension rubric (clarity,
structure, depth, relevance) plus a computed overall score and qualitative
feedback, returned as a plain dict ready to drop into
InterviewAnswer.evaluation_json. The service is intentionally ORM-free:
callers pass primitives (question text, type, difficulty, rationale,
anchor, answer text) and receive a dict.
"""

import json
import logging

import openai
from openai import AsyncOpenAI
from pydantic import ValidationError
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings
from app.schemas.evaluation import EvaluationRubric

_client = AsyncOpenAI(api_key=settings.openai_api_key)
_MODEL = "gpt-4o"
logger = logging.getLogger(__name__)


_EVALUATION_SCHEMA = {
    "name": "answer_evaluation",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "clarity": {"type": "integer", "minimum": 0, "maximum": 5},
            "structure": {"type": "integer", "minimum": 0, "maximum": 5},
            "depth": {"type": "integer", "minimum": 0, "maximum": 5},
            "relevance": {"type": "integer", "minimum": 0, "maximum": 5},
            "overall_score": {"type": "number", "minimum": 0, "maximum": 5},
            "strengths": {"type": "array", "items": {"type": "string"}},
            "weaknesses": {"type": "array", "items": {"type": "string"}},
            "suggested_improvement": {"type": "string"},
        },
        "required": [
            "clarity",
            "structure",
            "depth",
            "relevance",
            "overall_score",
            "strengths",
            "weaknesses",
            "suggested_improvement",
        ],
        "additionalProperties": False,
    },
}


_SYSTEM_PROMPT = """You are a senior engineering interviewer at a top tech company evaluating a candidate's answer. Provide structured, actionable feedback. Be honest — don't grade-inflate.

Score the answer on four dimensions, each 0-5:

CLARITY (0-5): Is the answer well-structured and easy to follow? Free of rambling, filler, or tangents?
  0 = incoherent or hard to parse
  3 = understandable but could be tighter
  5 = crisp, well-organized, easy to follow

STRUCTURE (0-5): Does the answer use appropriate framing for its type?
  - behavioral: did it follow STAR (Situation, Task, Action, Result)?
  - technical_concept: logical flow (definition → mechanism → tradeoffs)?
  - technical_project: problem → approach → tradeoffs → result?

DEPTH (0-5):
  - behavioral: specificity and concrete details (numbers, names, decisions made)
  - technical_concept: technical accuracy and depth of understanding
  - technical_project: shows real ownership vs surface-level recall

RELEVANCE (0-5): Did the answer actually address what was asked? Not off-topic or just adjacent?

Then compute:
  overall_score is your holistic judgment of the answer, NOT a strict weighted formula. Use the dimension scores as guideposts, but the overall_score should reflect your overall impression — which might be slightly higher or lower than the math depending on whether specific weaknesses or strengths dominate. Round to 1 decimal place.

Then provide:
  strengths: 1-3 specific things the answer did well (each one a short sentence)
  weaknesses: 1-3 specific things to improve (each one a short sentence)
  suggested_improvement: 1-2 sentences of concrete, actionable advice

GROUNDING IN THE RESUME ANCHOR
The question is grounded in a verbatim phrase from the candidate's resume (the "anchor"). This means the question is asking about something the candidate actually did — not hypothetically. The answer must demonstrate real ownership of that specific work, not substitute a generic framing that could apply to anyone. If the answer ignores the anchored experience, gives a textbook response without referencing their own work, or contradicts what's stated in the anchor — that's a significant DEPTH and RELEVANCE penalty.

EXAMPLE OF A 3-LEVEL ANSWER (the most common score in real interviews):

Question: "In your NodeMind project, how did you implement the MCP server with FastAPI?"

Answer: "I used FastAPI with async endpoints to build the MCP server. I stored agent state in Postgres so sessions could resume. The hardest part was making sure state was consistent when LLM responses streamed in."

This answer scores:
- Clarity: 4 (concise, well-paced)
- Structure: 3 (clear narrative but no explicit framing)
- Depth: 3 (mentions specific tech choices but no quantified impact, no alternatives discussed, no tradeoffs surfaced)
- Relevance: 4 (answers the question, references the anchored experience)
- Overall: 3.4

Why not 4 in depth: the answer mentions specific tech but doesn't explain WHY Postgres over Redis, what alternatives were rejected, or what consistency guarantees were chosen. A 4-depth answer would surface those tradeoffs explicitly.

Use this as a calibration anchor — answers similar to this should land near 3, not 4.

EXAMPLE OF A 2-LEVEL ANSWER (common for vague responses):

Question: "Can you describe how you used Postgres in your last project?"

Answer: "I used Postgres to store data. It worked well. We had some tables and queries."

Scores:
- Clarity: 3 (understandable, brief)
- Structure: 2 (no real progression — just three short statements)
- Depth: 1 (no specifics — what data, what tables, what queries?)
- Relevance: 3 (on-topic but doesn't dig in)
- Overall: 2.1

EXAMPLE OF A 4-LEVEL ANSWER (a strong response with real depth):

Question: "Tell me about the most challenging technical decision on your project."

Answer: "Our biggest decision was choosing between Postgres + pgvector vs a dedicated vector DB like Pinecone for our RAG pipeline. I evaluated three factors: cost ($0 self-hosted vs $70/mo for Pinecone starter), latency (Postgres HNSW search measured 12ms p99 vs Pinecone's 8ms p99 in our tests), and operational simplicity (one DB to back up vs two services to monitor). We chose Postgres because at our scale of ~10k vectors the latency difference wasn't user-perceptible, and the operational simplicity outweighed the slight speed loss. I'd revisit this if we crossed 1M vectors."

Scores:
- Clarity: 4 (well-organized, every sentence has purpose)
- Structure: 5 (clear problem → criteria → measured comparison → decision → reflection on when to revisit)
- Depth: 5 (specific numbers, three factors weighed, what would change the decision)
- Relevance: 5 (precisely answers what was asked)
- Overall: 4.8

Note how the dimension scores differ — not flat 4s or 5s. Match this pattern: real differentiation across the four dimensions.

CALIBRATION (CRITICAL — READ TWICE):

Real score distribution among candidates for mid-to-senior engineering roles:
- 30% of answers score 1-2 (vague, generic, or off-topic)
- 50% of answers score 2-3 (on-topic but lacks depth, specificity, or structure)
- 15% of answers score 3-4 (good in some dimensions but missing key elements)
- Only 5% of answers score 4-5 (specific, structured, demonstrates real ownership)

If you find yourself giving 4 to most answers, you are inflating. Drop to 3.
A score of 4 in any dimension requires the answer to do something specific that most candidates miss — quantifying impact, naming alternatives considered, surfacing tradeoffs, or showing nuanced reflection. Without that, the ceiling is 3.

SCORE VARIANCE IS MANDATORY:
- Each answer must have a unique scoring profile. Do NOT default to standard patterns like 4/3/3/5 or 4/4/4/5.
- The four dimension scores should span at least 2 different values. Never give all four dimensions the same score.
- Use the full 0-5 range. Most answers will have at least one dimension scoring 2, and at least one scoring 4 or higher — they rarely cluster in the same range.
- If an answer is genuinely strong in one area but weak in another, reflect that with a 2-3 point spread between dimensions (e.g., 2/4/3/5 or 5/3/2/4). Don't smooth over to a flat average.

JUDGE CONTENT, NOT LENGTH. A concise, precise answer can earn a 5; a verbose but generic answer can earn a 2. Brevity is not a flaw if the answer is complete and on-target. Length is not a strength if it includes filler, hedging, or restatements. Identify what's missing in substance — specific decisions, tradeoffs, quantified outcomes, real reflection — not in word count. A senior candidate can deliver a perfect answer in two sentences if the substance is there.

What earns each score level by dimension:

CLARITY:
  1 = rambling, multiple tangents
  2 = understandable but with filler / hedging
  3 = clear and concise, well-paced
  4 = unusually crisp — every sentence advances the answer
  5 = exceptional clarity (very rare)

STRUCTURE:
  1 = no discernible structure
  2 = some structure but skips key steps
  3 = clear framing (STAR or technical narrative)
  4 = framing AND clean transitions between elements
  5 = textbook execution of structure with intentional emphasis (very rare)

DEPTH (technical_project / technical_concept):
  1 = generic recall, no specifics
  2 = some details but stays surface-level
  3 = mentions specific decisions or tradeoffs
  4 = quantifies impact, names alternatives considered, surfaces tradeoffs
  5 = architecture + tradeoffs + lessons learned + what they'd do differently (very rare)

DEPTH (behavioral):
  1 = no specific situation
  2 = vague situation; action without result
  3 = clear STAR with names/dates
  4 = quantified result + reflection on what was learned
  5 = nuanced reflection on team dynamics, growth, or systemic factors (very rare)

RELEVANCE:
  1 = off-topic
  2 = adjacent but doesn't address the question
  3 = addresses the question
  4 = addresses the question AND the anchored experience specifically
  5 = answer is precisely what the question asked for (uncommon — high relevance is the floor, not the ceiling)

If the candidate gives a non-answer (explicit "I don't know" with no real attempt, or substance-free filler that ducks the question entirely), score 0-2 across all dimensions. Variance across dimensions can still apply — if one aspect is marginally less bad than others, reflect that.

Even for poor answers, you must still produce 1-3 strengths — the field is required. For non-answers or very weak answers, find something minimal to credit, such as:
  - "Acknowledged uncertainty honestly rather than fabricating details"
  - "Stayed within the relevant topic area"
  - "Kept the response brief rather than padding with filler"

This isn't grade inflation — these are real (if minor) positives even for weak answers. They give the candidate one true thing to build from.
"""


# Per-dimension weights for the final score. Depth is weighted highest
# because it best separates strong candidates; clarity lowest.
_SCORE_WEIGHTS = {
    "clarity": 0.20,
    "structure": 0.25,
    "depth": 0.30,
    "relevance": 0.25,
}


def compute_overall_score(
    clarity: int,
    structure: int,
    depth: int,
    relevance: int,
) -> float:
    """Compute the final overall score (0-5) from the four rubric dimensions.

    final = clarity*0.20 + structure*0.25 + depth*0.30 + relevance*0.25,
    rounded to one decimal place.

    Doing this arithmetic in Python — rather than trusting the LLM to
    compute the weighted average — guarantees the final score is always
    consistent with the four dimension scores the model returned.
    """
    total = (
        clarity * _SCORE_WEIGHTS["clarity"]
        + structure * _SCORE_WEIGHTS["structure"]
        + depth * _SCORE_WEIGHTS["depth"]
        + relevance * _SCORE_WEIGHTS["relevance"]
    )
    return round(total, 1)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(
        (openai.APIError, openai.APIConnectionError, ValidationError)
    ),
)
async def evaluate_answer(
    question_text: str,
    question_type: str,
    difficulty: str,
    rationale: str,
    anchor: str,
    answer_text: str,
) -> dict:
    """Score a candidate's answer against the 4-dimension rubric.

    Returns the raw structured-output dict so callers can persist it
    directly into InterviewAnswer.evaluation_json. Retries only on
    transient OpenAI failures; everything else propagates.
    """
    user_message = f"""QUESTION (type: {question_type}, difficulty: {difficulty})
{question_text}

WHY THIS QUESTION WAS ASKED
Rationale: {rationale}
Anchor (verbatim from candidate's resume): "{anchor}"

CANDIDATE'S ANSWER
{answer_text}

Evaluate this answer per the rubric. Return the structured JSON."""

    response = await _client.chat.completions.create(
        model=_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        response_format={"type": "json_schema", "json_schema": _EVALUATION_SCHEMA},
        temperature=0.3,  # lower than question gen — we want consistent scoring
    )

    data = json.loads(response.choices[0].message.content)
    # v5: trust the model's holistic overall_score. The prompt now asks for
    # a holistic judgment rather than a strict weighted average, so we no
    # longer overwrite it with compute_overall_score(). The helper is kept
    # below as dead code for unit tests / sanity checks.
    # Enforces the min_length / max_length constraints from EvaluationRubric.
    # On failure, ValidationError propagates → tenacity retries (up to 3x).
    EvaluationRubric.model_validate(data)
    logger.info(
        "Evaluated answer: clarity=%d structure=%d depth=%d relevance=%d overall=%.1f",
        data["clarity"],
        data["structure"],
        data["depth"],
        data["relevance"],
        data["overall_score"],
    )
    return data
