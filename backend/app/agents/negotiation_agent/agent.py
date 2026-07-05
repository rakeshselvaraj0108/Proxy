from app.agents.state import AgentState
from app.llm.gemini.service import gemini_service
from app.prompts.health_insurance_agents import negotiation_prompt


async def run_negotiation_agent(state: AgentState) -> AgentState:
    prompt = negotiation_prompt(
        state["domain"],
        state.get("case_summary", ""),
        state.get("retrieved_context", ""),
        state.get("strategy", ""),
        state.get("evidence_summary", ""),
    )
    state["appeal_draft"] = await gemini_service.generate(prompt, temperature=0.25, purpose="reasoning")
    state["llm_call_count"] = int(state.get("llm_call_count", 0)) + 1
    state.setdefault("agent_trace", []).append("negotiation:appeal_draft")
    return state
