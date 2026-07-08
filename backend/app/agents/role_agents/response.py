from app.agents.state import AgentState
from app.core.config import get_settings
from app.llm.service import llm_service


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
    return await llm_service.generate(prompt, temperature=0.15, purpose="response")


def _render_specialist_results(results: list[dict]) -> str | None:
    """Render state["specialist_results"] (the shape produced by
    specialist_dispatch.py's parallel executor for 6 of the 8 domains --
    {"specialist_name", "specialist_focus", "strategy": {...json fields...}})
    into readable text. This is distinct from state["specialist_outputs"]
    (Health Insurance/Banking's own {"answer": ...} shape, handled below)."""
    if not results:
        return None
    sections = []
    for result in results:
        strategy = result.get("strategy", {})
        if not isinstance(strategy, dict):
            continue
        name = result.get("specialist_name", "Specialist")
        # "###" (not "##") because the caller nests this under a domain-level
        # "##" heading -- and "analysis" is the common first field across
        # every domain's output schema (housing/airlines/healthcare/etc. all
        # define one), so lead with it as plain prose, then render every
        # other field as a proper markdown list/line, not a comma-joined
        # run-on sentence.
        lines = [f"### {name}"]
        analysis = strategy.get("analysis")
        if analysis:
            lines.append(str(analysis))
        for key, value in strategy.items():
            if key == "analysis" or not value:
                continue
            label = key.replace("_", " ").title()
            if isinstance(value, list):
                lines.append(f"\n**{label}:**")
                lines.extend(f"- {item}" for item in value)
            else:
                lines.append(f"\n**{label}:** {value}")
        sections.append("\n".join(lines))
    return "\n\n".join(sections) if sections else None


async def run_response_agent(state: AgentState) -> AgentState:
    outputs = state.get("specialist_outputs", [])
    if outputs:
        primary = outputs[0]["answer"]
    else:
        primary = _render_specialist_results(state.get("specialist_results", [])) or state.get(
            "final_answer", "No specialist output was produced."
        )
    final_answer = state.get("final_answer") or primary
    final_answer = await _optional_polish(state, final_answer)
    state["final_answer"] = final_answer
    state["evidence_summary"] = state.get("evidence_summary") or final_answer
    state["strategy"] = state.get("strategy") or f"Use the {state.get('route', 'faq')} route: verify policy wording, attach evidence, and escalate only if the institution response conflicts with cited rules."
    state["appeal_draft"] = state.get("appeal_draft") or _default_appeal(state)
    
    from app.models.domain import Domain
    if state.get("domain") == Domain.BANKING:
        state["review_notes"] = state.get("review_notes") or [
            "Verify the exact card agreement or loan terms name before relying on a clause.",
            "Prefer bank terms & conditions and RBI/NPCI sources over generic summaries.",
        ]
    else:
        state["review_notes"] = state.get("review_notes") or [
            "Verify the exact policy/product name before relying on a clause.",
            "Prefer insurer policy wording and IRDAI sources over generic summaries.",
        ]
        
    state.setdefault("agent_trace", []).append("response:final")
    return state

