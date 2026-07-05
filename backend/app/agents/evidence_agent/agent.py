"""Evidence Agent — reads uploaded documents and extracts structured facts:

- Diagnosis, Treatment, Hospital
- Coverage, Dates, Bill amounts
- Documents missing
- Reason for rejection
"""

from __future__ import annotations

from app.agents.json_parser import parse_agent_json
from app.agents.state import AgentState, EvidenceOutput
from app.llm.gemini.service import gemini_service
from app.prompts.health_insurance_agents import evidence_prompt

EVIDENCE_FALLBACK_FIELDS: dict = {
    "diagnosis": "",
    "treatment": "",
    "hospital": "",
    "coverage_requested": "",
    "admission_date": "",
    "discharge_date": "",
    "bill_amount": "",
    "reason_for_rejection": "",
    "documents_missing": [],
    "key_dates": [],
}


async def run_evidence_agent(state: AgentState) -> AgentState:
    """Execute the evidence agent: parse documents and extract structured medical/insurance facts."""
    domain = state["domain"]
    case_summary = state.get("case_summary", "")
    context = state.get("retrieved_context", "")
    evidence = state.get("evidence_bundle") or case_summary

    prompt = evidence_prompt(domain, case_summary, context, evidence)
    raw = await gemini_service.generate(prompt, temperature=0.1, purpose="reasoning")

    # Parse structured output
    parsed = parse_agent_json(raw, EVIDENCE_FALLBACK_FIELDS)
    evidence_output: EvidenceOutput = {
        "diagnosis": parsed.get("diagnosis", ""),
        "treatment": parsed.get("treatment", ""),
        "hospital": parsed.get("hospital", ""),
        "coverage_requested": parsed.get("coverage_requested", ""),
        "admission_date": parsed.get("admission_date", ""),
        "discharge_date": parsed.get("discharge_date", ""),
        "bill_amount": parsed.get("bill_amount", ""),
        "reason_for_rejection": parsed.get("reason_for_rejection", ""),
        "documents_missing": parsed.get("documents_missing", []),
        "key_dates": parsed.get("key_dates", []),
        "summary": parsed.get("summary", raw[:2000]),
    }
    state["evidence_output"] = evidence_output
    state["evidence_summary"] = evidence_output["summary"]
    state["llm_call_count"] = int(state.get("llm_call_count", 0)) + 1
    state.setdefault("agent_trace", []).append("evidence:gemini")
    return state
