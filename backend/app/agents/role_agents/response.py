from app.agents.state import AgentState
from app.core.config import get_settings
from app.llm.gemini.service import gemini_service


def _default_appeal(state: AgentState) -> str:
    return (
        f"Draft appeal for {state.get('institution_name', 'the insurer')}: Please review this decision against the cited policy terms and supporting evidence. "
        "Provide the exact policy clause relied upon, the medical or claim basis for the decision, and reopen the claim for a reasoned review."
    )


async def _optional_polish(state: AgentState, answer: str) -> str:
    settings = get_settings()
    if not settings.response_agent_llm_enabled:
        return answer
    prompt = (
        "Rewrite the specialist answer into a concise final user response. Keep citations and uncertainty. "
        "Do not add new facts beyond the specialist output and retrieved context.\n\n"
        f"Specialist output:\n{answer}\n\nRetrieved context:\n{state.get('retrieved_context', '')[:6000]}"
    )
    state["llm_call_count"] = int(state.get("llm_call_count", 0)) + 1
    state.setdefault("agent_trace", []).append("response:gemini_response")
    return await gemini_service.generate(prompt, temperature=0.15, purpose="response")


async def run_response_agent(state: AgentState) -> AgentState:
    outputs = state.get("specialist_outputs", [])
    primary = outputs[0]["answer"] if outputs else state.get("final_answer", "No specialist output was produced.")
    final_answer = state.get("final_answer") or primary
    final_answer = await _optional_polish(state, final_answer)
    state["final_answer"] = final_answer
    state["evidence_summary"] = state.get("evidence_summary") or final_answer
    state["strategy"] = state.get("strategy") or f"Use the {state.get('route', 'faq')} route: verify policy wording, attach evidence, and escalate only if the insurer response conflicts with cited rules."
    state["appeal_draft"] = state.get("appeal_draft") or _default_appeal(state)
    state["review_notes"] = state.get("review_notes") or [
        "Verify the exact policy/product name before relying on a clause.",
        "Prefer insurer policy wording and IRDAI sources over generic summaries.",
    ]
    state.setdefault("agent_trace", []).append("response:final")
    return state
