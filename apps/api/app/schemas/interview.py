import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.evaluation import EvaluationRubric

QuestionType = Literal["behavioral", "technical_concept", "technical_project"]
QuestionDifficulty = Literal["easy", "medium", "hard"]

class GeneratedQuestion(BaseModel):
    question: str
    type: QuestionType
    rationale: str
    difficulty: QuestionDifficulty
    anchor: str

class InterviewPreviewRequest(BaseModel):
    resume_id: uuid.UUID
    job_description_id: uuid.UUID
    num_questions: int = Field(default=8, ge=4, le=12)

class InterviewPreviewResponse(BaseModel):
    resume_id: uuid.UUID
    job_description_id: uuid.UUID
    questions: list[GeneratedQuestion]
    num_resume_chunks_used: int
    model: str

class InterviewSessionCreate(BaseModel):
    resume_id: uuid.UUID
    job_description_id: uuid.UUID
    num_questions: int = Field(default=8, ge=4, le=12)

class InterviewQuestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_index: int
    question: str
    type: str
    rationale: str
    difficulty: str
    anchor: str

class InterviewSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: uuid.UUID
    resume_id: uuid.UUID
    job_description_id: uuid.UUID
    status: str
    model_used: str
    num_questions: int
    created_at: datetime
    questions: list[InterviewQuestionRead]

class InterviewSessionListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: uuid.UUID
    resume_id: uuid.UUID
    job_description_id: uuid.UUID
    status: str
    num_questions: int
    created_at: datetime

class InterviewAnswerCreate(BaseModel):
    question_id: uuid.UUID
    answer_text: str = Field(min_length=1, max_length=8000)

class InterviewAnswerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: uuid.UUID
    session_id: uuid.UUID
    question_id: uuid.UUID
    answer_text: str
    evaluation_json: EvaluationRubric | None = None
    evaluation_status: str
    evaluator_model: str | None
    created_at: datetime

class UserStats(BaseModel):
    total_sessions: int
    completed_sessions: int
    total_answers: int
    average_score: float | None = None
    dimension_averages: dict[str, float] | None = None
    weakest_dimension: str | None = None

    model_config = ConfigDict(from_attributes=True)
