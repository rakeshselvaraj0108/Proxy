"""Negotiation Agent — generates all dispute documents:

- Appeal Letter (formal to GRO)
- Complaint Email (shorter version)
- Escalation Note (internal/ombudsman path)
- Consumer Complaint (IRDAI IGMS / Ombudsman draft)
"""

from __future__ import annotations

from app.agents.json_parser import parse_agent_json
from app.agents.state import AgentState, NegotiationOutput
from app.llm.service import llm_service
from app.prompts.health_insurance_agents import negotiation_prompt

NEGOTIATION_FALLBACK_FIELDS: dict = {
    "appeal_letter": "",
    "complaint_email": "",
    "escalation_note": "",
    "consumer_complaint": "",
}


async def run_negotiation_agent(state: AgentState) -> AgentState:
    """Execute the negotiation agent: generate all dispute documents."""
    domain = state["domain"]
    case_summary = state.get("case_summary", "")
    context = state.get("retrieved_context", "")
    strategy = state.get("strategy", "")
    evidence_summary = state.get("evidence_summary", "")

    # Use strategy output for richer context if available
    strategy_output = state.get("strategy_output", {})
    if strategy_output:
        strategy_text = (
            f"Can appeal: {strategy_output.get('can_appeal', 'UNKNOWN')}\n"
            f"Probability: {strategy_output.get('success_probability', 'N/A')}\n"
            f"Strategy: {strategy_output.get('recommended_strategy', '')}\n"
            f"Evidence required: {', '.join(strategy_output.get('evidence_required', []))}\n"
            f"Escalation path: {', '.join(strategy_output.get('escalation_path', []))}\n"
            f"Summary: {strategy_output.get('summary', '')}"
        )
    else:
        strategy_text = strategy

    prompt = negotiation_prompt(domain, case_summary, context, strategy_text, evidence_summary)
    raw = await llm_service.generate(prompt, temperature=0.25, purpose="reasoning")

    # Parse structured output
    parsed = parse_agent_json(raw, NEGOTIATION_FALLBACK_FIELDS)
    negotiation_output: NegotiationOutput = {
        "appeal_letter": parsed.get("appeal_letter", ""),
        "complaint_email": parsed.get("complaint_email", ""),
        "escalation_note": parsed.get("escalation_note", ""),
        "consumer_complaint": parsed.get("consumer_complaint", ""),
        "summary": parsed.get("summary", "Appeal documents generated."),
    }
    state["negotiation_output"] = negotiation_output

    # Keep backward compatibility: appeal_draft = the formal appeal letter
    state["appeal_draft"] = negotiation_output["appeal_letter"]
    state["llm_call_count"] = int(state.get("llm_call_count", 0)) + 1
    state.setdefault("agent_trace", []).append("negotiation:all_documents")
    return state
