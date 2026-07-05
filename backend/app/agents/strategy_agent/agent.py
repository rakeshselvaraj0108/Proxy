from app.agents.state import AgentState
from app.llm.gemini.service import gemini_service
from app.prompts.health_insurance_agents import strategy_prompt


async def run_strategy_agent(state: AgentState) -> AgentState:
    prompt = strategy_prompt(
        state["domain"],
        state.get("case_summary", ""),
        state.get("retrieved_context", ""),
        state.get("evidence_summary", ""),
        state.get("research_summary", ""),
    )
    state["strategy"] = await gemini_service.generate(prompt, temperature=0.2, purpose="reasoning")
    state["llm_call_count"] = int(state.get("llm_call_count", 0)) + 1
    state.setdefault("agent_trace", []).append("strategy:gemini")
    return state
