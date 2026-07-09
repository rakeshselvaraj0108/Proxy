"""Multi-domain case entry point: classify a raw query against every active
domain (Domain Router), run the full case workflow once per candidate
domain concurrently, and merge the results into one combined report --
implements the prompt's example directly: "My flight was cancelled and my
travel insurance rejected the claim" -> run Airlines AND Health Insurance,
merge results, instead of forcing the caller to pick one domain upfront.
"""
from __future__ import annotations

import asyncio

from app.agents.orchestrator.case_workflow import case_workflow
from app.agents.role_agents.domain_router import classify_domains

# NegotiationOutput's fields (app/agents/state.py) mapped to a human title
# used both for the saved Appeal's title and the frontend's document-type
# labels -- kept in one place so the two stay in sync.
DOCUMENT_TYPE_TITLES = {
    "appeal_letter": "Appeal Letter",
    "complaint_email": "Complaint Email",
    "escalation_note": "Escalation Note",
    "consumer_complaint": "Consumer Complaint",
}


async def _save_appeals_for_domain(user_id: str, case_id: str, domain_value: str, query: str, state: dict) -> list[dict]:
    negotiation_output = state.get("negotiation_output") or {}
    if not isinstance(negotiation_output, dict):
        return []
    from app.database.postgres.repositories import case_repository

    saved = []
    query_snippet = query[:80] + ("..." if len(query) > 80 else "")
    for doc_type, title_prefix in DOCUMENT_TYPE_TITLES.items():
        content = negotiation_output.get(doc_type)
        if not content or not isinstance(content, str) or not content.strip():
            continue
        appeal = await case_repository.add_appeal(
            case_id, user_id, f"{title_prefix}: {query_snippet}", content,
            document_type=doc_type, domain=domain_value,
        )
        saved.append(appeal)
    return saved


async def _create_analysis_case(user_id: str, case_id: str, primary_domain, query: str, institution_name: str) -> None:
    """Every multi-domain query becomes a real, listable Case -- previously
    only appeals/documents persisted anything, so "My Analyses" would be
    empty for the primary interaction path (the AI Assistant) even though
    real multi-agent analysis work was happening on every query."""
    if not user_id:
        return
    from app.database.postgres.repositories import case_repository
    from app.schemas.cases import CaseCreate, CaseStatus

    query_snippet = query[:120] + ("..." if len(query) > 120 else "")
    await case_repository.create_case(
        user_id,
        CaseCreate(
            domain=primary_domain,
            title=query_snippet or "Untitled analysis",
            institution_name=institution_name or "Not specified",
            summary=query or query_snippet,
        ),
        case_id=case_id,
    )
    await case_repository.update_case_status(case_id, CaseStatus.ANALYZING)


async def _record_analysis_runs(user_id: str, case_id: str, per_domain_results: list[dict], query: str) -> None:
    if not user_id:
        return
    from app.database.postgres.repositories import case_repository
    from app.schemas.cases import CaseStatus

    any_succeeded = False
    for entry in per_domain_results:
        state = entry["state"]
        final = state.get("final_report") or state.get("final_answer")
        succeeded = bool(final)
        any_succeeded = any_succeeded or succeeded
        await case_repository.add_agent_run(
            case_id,
            f"multi_domain:{entry['domain']}",
            status="completed" if succeeded else "failed",
            input_payload={"query": query, "domain": entry["domain"]},
            output_payload={
                "domain": entry["domain"],
                "confidence": entry["confidence"],
                "route": state.get("route"),
                "citations": len(state.get("structured_citations") or []),
            },
        )
    await case_repository.update_case_status(
        case_id, CaseStatus.REVIEW_REQUIRED if any_succeeded else CaseStatus.ANALYZING
    )


async def run_multi_domain_case(base_state: dict, save_appeals: bool = False) -> dict:
    query = base_state.get("case_summary", "")
    user_id = base_state.get("user_id", "")
    candidates = classify_domains(query)
    base_case_id = base_state.get("case_id", "case")

    await _create_analysis_case(user_id, base_case_id, candidates[0]["domain"], query, base_state.get("institution_name", ""))

    async def run_for_candidate(candidate: dict) -> dict:
        domain = candidate["domain"]
        state = dict(base_state)
        state["domain"] = domain
        case_id = f"{base_case_id}-{domain.value}"
        state["case_id"] = case_id
        result = await case_workflow.run(state)
        appeals = await _save_appeals_for_domain(user_id, case_id, domain.value, query, result) if save_appeals else []
        return {"domain": domain.value, "confidence": candidate["confidence"], "state": result, "appeals": appeals}

    per_domain_results = await asyncio.gather(*(run_for_candidate(c) for c in candidates))
    await _record_analysis_runs(user_id, base_case_id, per_domain_results, query)

    combined_citations: list[dict] = []
    combined_summaries: list[str] = []
    for entry in per_domain_results:
        state = entry["state"]
        for citation in state.get("structured_citations", []) or []:
            combined_citations.append({**citation, "domain": entry["domain"]})
        final = state.get("final_report") or state.get("final_answer")
        if final:
            combined_summaries.append(f"[{entry['domain']}] {final}")

    return {
        "query": query,
        "domains_analyzed": [c["domain"].value for c in candidates],
        "primary_domain": candidates[0]["domain"].value,
        "per_domain_results": {
            entry["domain"]: {
                "confidence": entry["confidence"],
                "route": entry["state"].get("route"),
                "final_report": entry["state"].get("final_report") or entry["state"].get("final_answer"),
                "agent_trace": entry["state"].get("agent_trace"),
                "appeals": entry["appeals"],
            }
            for entry in per_domain_results
        },
        "combined_citations": combined_citations,
        "combined_summary": "\n\n".join(combined_summaries),
    }
