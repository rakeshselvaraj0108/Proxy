from app.agents.state import AgentState
from app.core.config import get_settings
from app.llm.service import llm_service


def _default_appeal(state: AgentState) -> str:
    return (
        f"Draft appeal for {state.get('institution_name', 'the insurer')}: Please review this decision against the cited policy terms and supporting evidence. "
        "Provide the exact policy clause relied upon, the medical or claim basis for the decision, and reopen the claim for a reasoned review."
    )


async def _optional_polish(state: AgentState, answer: str) -> str:
    """Synthesize the raw, per-specialist template output into one coherent
    answer -- not just a "make it concise" rewrite. With multiple
    specialists dispatched for one case, `answer` going in is 2-3 sections
    that routinely recommend the exact same escalation channel in slightly
    different words (confirmed live: a real government-domain case produced
    three specialists all independently telling the user to file a CPGRAMS
    grievance), addressed in third person ("the applicant"), with no
    causal diagnosis, no deadline-aware sequencing, and no single coherent
    voice -- structurally worse than a single well-prompted LLM call would
    produce from the same retrieved context, because it never combines the
    specialists' findings into one answer at all."""
    settings = get_settings()
    if not settings.response_agent_llm_enabled:
        return answer
    prompt = f"""You are combining several specialist agents' raw findings into ONE final answer for the
person who asked. Do not add any fact not present in the specialist output or retrieved context below --
your job is synthesis and rewriting, not new research.

Original question/situation (may include the person's name -- address them by it if given, otherwise use
a warm neutral opening; do not write "the applicant" or any third-person case-file language anywhere):
{state.get('case_summary', '')[:2000]}

Raw specialist findings to synthesize (multiple specialists may repeat the same recommendation in
different words -- collapse every repeated recommendation into a single entry, do not list it more than
once just because more than one specialist said it):
{answer}

Retrieved context (for verifying specifics, not for adding new claims):
{state.get('retrieved_context', '')[:6000]}

Write the final answer with this structure:
1. One warm, specific opening sentence or two, addressed directly to the person (by name if they gave one).
2. A short "why this is happening" diagnosis (1-3 sentences) -- the underlying cause, not just a restatement
   of the facts back to them. E.g. "no accountable officer is attached to your file" or "this looks like a
   training gap at this specific office, not a policy issue, because..." -- this is what makes an answer
   read as real expertise instead of a procedure lookup.
3. ONE deduplicated, prioritized action plan -- if the original situation mentions a real deadline or
   urgency, sequence the actions against it explicitly (e.g. "Day 1: do X and Y in parallel", "Day 2-3: Z"),
   not just an unordered list of channels with equal weight.
4. If anything in the specialist findings was flagged as unconfirmed against retrieved sources, fold that
   into at most one natural sentence (e.g. "I'd confirm the exact clause number with the office directly,
   but the underlying process is clear") -- never leave a bracketed technical annotation like
   "(not confirmed word-for-word in retrieved sources)" in the text; that is an internal QA note that must
   never reach the reader verbatim.
5. End with a specific, concrete offer to draft the actual next artifact (name it -- e.g. "the CPGRAMS
   complaint text", "the RTI application", "the formal escalation letter" -- whatever documents are
   genuinely relevant here), not a generic closing line.

Write in second person throughout, one continuous voice -- no agent names, no "Specialist" labels, no
visible seams between where one specialist's input ended and another's began. Keep every real citation,
regulation name, and specific contact detail from the source material; do not invent new ones."""
    state["llm_call_count"] = int(state.get("llm_call_count", 0)) + 1
    state.setdefault("agent_trace", []).append("response:gemini_response")
    return await llm_service.generate(prompt, temperature=0.2, purpose="response")


_SHARED_LIST_FIELDS = ("applicable_rules", "applicable_regulations", "escalation_path")
# Maps each citation-bearing field to the field the deterministic verifier
# (app/services/citation_verification.py) writes the unmatched subset into --
# see the specialist files for where these get populated.
_CITATION_FIELDS = {
    "applicable_rules": "unverified_rules",
    "applicable_regulations": "unverified_regulations",
    "authoritative_sources_cited": "unverified_sources",
}
_UNVERIFIED_FIELDS = tuple(_CITATION_FIELDS.values())


def _render_citation_list(label: str, items: list, unverified: list) -> list[str]:
    lines = [f"\n**{label}:**"]
    for item in items:
        flag = " *(not confirmed word-for-word in retrieved sources -- worth double-checking)*" if item in unverified else ""
        lines.append(f"- {item}{flag}")
    return lines


def _render_one_specialist(name: str, strategy: dict, skip_keys: tuple[str, ...] = ()) -> list[str]:
    lines = [f"**{name}**"]
    facts = strategy.get("evidence_facts")
    if isinstance(facts, list) and facts and "evidence_facts" not in skip_keys:
        # Mirrors the mandatory callout in consumer_advocacy.py's
        # build_agent_prompt -- the specific facts pulled from an uploaded
        # document need to be impossible to miss, not buried in prose,
        # otherwise an evidence-grounded answer reads the same as a generic
        # one and the upload seems to have made no difference.
        lines.append("**Facts confirmed from your uploaded document:**")
        lines.extend(f"- {fact}" for fact in facts)
    analysis = strategy.get("analysis")
    if analysis:
        lines.append(str(analysis))
    for key, value in strategy.items():
        if key in ("analysis", "evidence_relevant", "evidence_facts", *_UNVERIFIED_FIELDS, *skip_keys) or not value:
            continue
        if key in _CITATION_FIELDS and isinstance(value, list):
            label = key.replace("_", " ").title()
            lines.extend(_render_citation_list(label, value, strategy.get(_CITATION_FIELDS[key]) or []))
            continue
        label = key.replace("_", " ").title()
        if isinstance(value, list):
            lines.append(f"\n**{label}:**")
            lines.extend(f"- {item}" for item in value)
        else:
            lines.append(f"**{label}:** {value}")
    return lines


def _render_specialist_results(results: list[dict]) -> str | None:
    """Render state["specialist_results"] (the shape produced by
    specialist_dispatch.py's parallel executor for 6 of the 8 domains --
    {"specialist_name", "specialist_focus", "strategy": {...json fields...}})
    into readable text. This is distinct from state["specialist_outputs"]
    (Health Insurance/Banking's own {"answer": ...} shape, handled below)."""
    valid = [r for r in results if isinstance(r.get("strategy"), dict)]
    if not valid:
        return None

    if len(valid) == 1:
        strategy = valid[0]["strategy"]
        lines = _render_one_specialist(valid[0].get("specialist_name", "Specialist"), strategy)
        if strategy.get("evidence_relevant") is False:
            lines.insert(
                0,
                "**NOTE:** The document you uploaded does not appear to relate to this case -- "
                "this analysis is based only on your written description.",
            )
        return "\n".join(lines)

    # Multiple specialists ran for the same case -- they routinely cite the
    # exact same rules/escalation path (and, since they're reading the same
    # uploaded document, the same evidence facts), which used to repeat
    # verbatim under every specialist's heading and read as the report
    # saying the same thing over and over. Pull anything identical across
    # specialists into one shared section up top, then only show each
    # specialist's distinct analysis and any fields that actually differ.
    shared_facts: list[str] = []
    for result in valid:
        for fact in result["strategy"].get("evidence_facts") or []:
            if fact not in shared_facts:
                shared_facts.append(fact)

    shared: dict[str, list[str]] = {}
    shared_unverified: dict[str, list[str]] = {}
    for result in valid:
        strategy = result["strategy"]
        for key in _SHARED_LIST_FIELDS:
            values = strategy.get(key)
            if isinstance(values, list):
                bucket = shared.setdefault(key, [])
                for v in values:
                    if v not in bucket:
                        bucket.append(v)
            unverified_key = _CITATION_FIELDS.get(key)
            if unverified_key:
                unverified_values = strategy.get(unverified_key)
                if isinstance(unverified_values, list):
                    ubucket = shared_unverified.setdefault(key, [])
                    for v in unverified_values:
                        if v not in ubucket:
                            ubucket.append(v)

    lines: list[str] = []
    if any(r["strategy"].get("evidence_relevant") is False for r in valid):
        lines.append(
            "**NOTE:** The document you uploaded does not appear to relate to this case -- "
            "this analysis is based only on your written description."
        )
    if shared_facts:
        lines.append("**Facts confirmed from your uploaded document:**")
        lines.extend(f"- {fact}" for fact in shared_facts)
    for key, values in shared.items():
        if key in _CITATION_FIELDS:
            label = f"{key.replace('_', ' ').title()} (applies to all findings below)"
            lines.extend(_render_citation_list(label, values, shared_unverified.get(key, [])))
            continue
        label = key.replace("_", " ").title()
        lines.append(f"\n**{label} (applies to all findings below):**")
        lines.extend(f"- {v}" for v in values)

    lines.append("\n### Specialist perspectives")
    for result in valid:
        name = result.get("specialist_name", "Specialist")
        lines.append("")
        # _SHARED_LIST_FIELDS were already rendered once in the shared
        # section above -- only skip them here, in the multi-specialist
        # path; the single-specialist branch above calls
        # _render_one_specialist directly with no skip_keys, so those
        # fields still render there (there's no separate shared section to
        # have shown them in).
        lines.extend(_render_one_specialist(name, result["strategy"], skip_keys=("evidence_facts", *_SHARED_LIST_FIELDS)))

    return "\n".join(lines)


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
    
    if not state.get("review_notes"):
        # Was hardcoded to insurance-specific text ("insurer policy wording
        # and IRDAI sources") for every domain except banking -- a telecom,
        # airlines, ecommerce, government, healthcare, or housing case would
        # get nonsensical advice to check IRDAI (India's insurance
        # regulator) sources. get_profile(domain) already has the correct
        # counterparty/regulator per domain; use it instead.
        from app.prompts.domain_profiles import get_profile
        domain = state.get("domain")
        profile = get_profile(domain) if domain else None
        if profile:
            state["review_notes"] = [
                f"Verify the exact {profile.counterparty} terms/product name before relying on a clause.",
                f"Prefer {profile.counterparty} documentation and {profile.regulator} sources over generic summaries.",
            ]
        else:
            state["review_notes"] = ["Verify the exact terms/policy name and cite the specific regulator before relying on a clause."]

    state.setdefault("agent_trace", []).append("response:final")
    return state

