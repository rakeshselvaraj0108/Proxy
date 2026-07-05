"""Strategy Agent — decides the dispute path:

- Can the claim be appealed? YES / NO
- Probability of success
- Recommended strategy
- Evidence still required
"""

from __future__ import annotations

from app.agents.json_parser import parse_agent_json
from app.agents.state import AgentState, StrategyOutput
from app.llm.gemini.service import gemini_service
from app.prompts.health_insurance_agents import strategy_prompt

STRATEGY_FALLBACK_FIELDS: dict = {
    "can_appeal": "UNKNOWN",
    "success_probability": 0.0,
    "recommended_strategy": "",
    "evidence_required": [],
    "escalation_path": [],
}


async def run_strategy_agent(state: AgentState) -> AgentState:
    """Execute the strategy agent: assess appeal viability and recommend approach."""
    domain = state["domain"]
    case_summary = state.get("case_summary", "")
    context = state.get("retrieved_context", "")
    evidence_summary = state.get("evidence_summary", "")
    research_summary = state.get("research_summary", "")

    prompt = strategy_prompt(domain, case_summary, context, evidence_summary, research_summary)
    raw = await gemini_service.generate(prompt, temperature=0.2, purpose="reasoning")

    # Parse structured output
    parsed = parse_agent_json(raw, STRATEGY_FALLBACK_FIELDS)
    strategy_output: StrategyOutput = {
        "can_appeal": parsed.get("can_appeal", "UNKNOWN"),
        "success_probability": float(parsed.get("success_probability", 0.5)),
        "recommended_strategy": parsed.get("recommended_strategy", ""),
        "evidence_required": parsed.get("evidence_required", []),
        "escalation_path": parsed.get("escalation_path", []),
        "summary": parsed.get("summary", raw[:2000]),
    }
    state["strategy_output"] = strategy_output
    state["strategy"] = strategy_output["summary"]
    state["llm_call_count"] = int(state.get("llm_call_count", 0)) + 1
    state.setdefault("agent_trace", []).append("strategy:gemini")
    return state
