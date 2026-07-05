from pydantic import BaseModel, Field
from app.models.domain import Domain


class CaseStatus(str, Enum):
    DRAFT = "draft"
    INTAKE = "intake"
    ANALYZING = "analyzing"
    REVIEW_REQUIRED = "review_required"
    READY_FOR_APPROVAL = "ready_for_approval"
    SUBMITTED = "submitted"
    RESOLVED = "resolved"
    CLOSED = "closed"


class CaseCreate(BaseModel):
    domain: Domain = Domain.HEALTH_INSURANCE
    title: str = Field(min_length=4, max_length=160)
    institution_name: str = Field(min_length=2, max_length=160)
    summary: str = Field(min_length=10, max_length=4000)
    jurisdiction: str = Field(default="US", max_length=80)


class CaseRead(BaseModel):
    id: str
    user_id: str
    domain: Domain
    title: str
    institution_name: str
    summary: str
    jurisdiction: str
    status: CaseStatus


class CaseEventCreate(BaseModel):
    event_type: str = Field(min_length=2, max_length=80)
    title: str = Field(min_length=2, max_length=160)
    body: str | None = None


class AgentRunRequest(BaseModel):
    case_id: str
    include_negotiation_draft: bool = True


class AgentQuestionRequest(BaseModel):
    domain: Domain = Domain.HEALTH_INSURANCE
    question: str = Field(min_length=3, max_length=2000)
    institution_name: str = Field(default="General health insurer", max_length=160)


class AgentRunResponse(BaseModel):
    case_id: str
    status: str
    evidence_summary: str
    research_summary: str
    strategy: str
    appeal_draft: str
    review_notes: list[str]
    citations: list[str]
    route: str = ""
    agent_trace: list[str] = Field(default_factory=list)
    specialist_outputs: list[dict] = Field(default_factory=list)
    llm_call_count: int = 0
    workflow_engine: str = ""
    final_answer: str = ""
