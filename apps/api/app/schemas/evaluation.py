from pydantic import BaseModel, ConfigDict, Field

class EvaluationRubric(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    clarity: int = Field(ge=0, le=5)
    structure: int = Field(ge=0, le=5)
    depth: int = Field(ge=0, le=5)
    relevance: int = Field(ge=0, le=5)
    overall_score: float = Field(ge=0, le=5)
    strengths: list[str] = Field(min_length=1, max_length=3)
    weaknesses: list[str] = Field(min_length=1, max_length=3)
    suggested_improvement: str = Field(min_length=10)
