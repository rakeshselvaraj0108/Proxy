from app.agents.state import AgentState
from app.llm.gemini.service import gemini_service
from app.prompts.health_insurance_agents import evidence_prompt


async def run_evidence_agent(state: AgentState) -> AgentState:
    prompt = evidence_prompt(
        state["domain"],
        state.get("case_summary", ""),
        state.get("retrieved_context", ""),
        state.get("evidence_bundle") or state.get("case_summary", ""),
    )
    state["evidence_summary"] = await gemini_service.generate(prompt, temperature=0.1, purpose="reasoning")
    state["llm_call_count"] = int(state.get("llm_call_count", 0)) + 1
    state.setdefault("agent_trace", []).append("evidence:gemini")
    return state
