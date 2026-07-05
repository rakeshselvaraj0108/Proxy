from typing import Any, TypedDict

from app.models.domain import Domain


class AgentState(TypedDict, total=False):
    case_id: str
    user_id: str
    domain: Domain
    case_summary: str
    institution_name: str
    evidence_bundle: str
    retrieved_context: str
    graph_context: str
    evidence_summary: str
    research_summary: str
    strategy: str
    appeal_draft: str
    review_notes: list[str]
    final_report: str
    citations: list[str]
    route: str
    plan: dict[str, Any]
    agent_trace: list[str]
    specialist_outputs: list[dict[str, Any]]
    final_answer: str
    llm_call_count: int
    workflow_engine: str
    web_search_results: list[dict[str, Any]]
    documents: list[dict[str, Any]]
