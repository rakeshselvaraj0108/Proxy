from __future__ import annotations

from typing import Any, TypedDict

from app.models.domain import Domain


class ResearchOutput(TypedDict, total=False):
    applicable_clauses: list[str]
    possible_exclusions: list[str]
    waiting_periods: list[str]
    regulations: list[str]
    summary: str
    confidence: float


class EvidenceOutput(TypedDict, total=False):
    diagnosis: str
    treatment: str
    hospital: str
    coverage_requested: str
    admission_date: str
    discharge_date: str
    bill_amount: str
    reason_for_rejection: str
    documents_missing: list[str]
    key_dates: list[str]
    summary: str


class StrategyOutput(TypedDict, total=False):
    can_appeal: str
    success_probability: float
    recommended_strategy: str
    evidence_required: list[str]
    escalation_path: list[str]
    summary: str


class NegotiationOutput(TypedDict, total=False):
    appeal_letter: str
    complaint_email: str
    escalation_note: str
    consumer_complaint: str
    summary: str


class ReviewOutput(TypedDict, total=False):
    missing_evidence: list[str]
    hallucination_risks: list[str]
    wrong_clause_risks: list[str]
    weak_arguments: list[str]
    approval_ready: bool
    summary: str


class AgentState(TypedDict, total=False):
    # Case identity
    case_id: str
    user_id: str
    domain: Domain
    case_summary: str
    institution_name: str

    # Raw inputs
    evidence_bundle: str
    documents: list[dict[str, Any]]

    # Research outputs
    retrieved_context: str
    graph_context: str
    web_search_results: list[dict[str, Any]]
    research_output: ResearchOutput
    research_summary: str
    citations: list[str]

    # Evidence outputs
    evidence_output: EvidenceOutput
    evidence_summary: str

    # Strategy outputs
    strategy_output: StrategyOutput
    strategy: str

    # Negotiation outputs
    negotiation_output: NegotiationOutput
    appeal_draft: str

    # Review outputs
    review_output: ReviewOutput
    review_notes: list[str]

    # Final
    final_report: str
    final_answer: str

    # Orchestration metadata
    route: str
    plan: dict[str, Any]
    agent_trace: list[str]
    specialist_outputs: list[dict[str, Any]]
    specialist_results: list[dict[str, Any]]
    llm_call_count: int
    workflow_engine: str

    # Phase 2: Enterprise Intelligence Layer
    candidate_domains: list[dict[str, Any]]
    memory_context: str
    scored_evidence: list[dict[str, Any]]
    structured_citations: list[dict[str, Any]]
