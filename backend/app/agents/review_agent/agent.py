from app.agents.state import AgentState
from app.llm.gemini.service import gemini_service
from app.prompts.health_insurance_agents import review_prompt


async def run_review_agent(state: AgentState) -> AgentState:
    prompt = review_prompt(
        state["domain"],
        state.get("case_summary", ""),
        state.get("retrieved_context", ""),
        state.get("evidence_summary", ""),
        state.get("strategy", ""),
        state.get("appeal_draft", ""),
    )
    review = await gemini_service.generate(prompt, temperature=0.15, purpose="reasoning")
    state["review_notes"] = [line.strip("- ").strip() for line in review.splitlines() if line.strip()]
    if len(state["review_notes"]) <= 1 and "." in review:
        state["review_notes"] = [note.strip() for note in review.split(".") if note.strip()]
    state["llm_call_count"] = int(state.get("llm_call_count", 0)) + 1
    state.setdefault("agent_trace", []).append("review:gemini")
    return state
