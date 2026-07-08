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


async def run_multi_domain_case(base_state: dict) -> dict:
    query = base_state.get("case_summary", "")
    candidates = classify_domains(query)
    base_case_id = base_state.get("case_id", "case")

    async def run_for_candidate(candidate: dict) -> dict:
        domain = candidate["domain"]
        state = dict(base_state)
        state["domain"] = domain
        state["case_id"] = f"{base_case_id}-{domain.value}"
        result = await case_workflow.run(state)
        return {"domain": domain.value, "confidence": candidate["confidence"], "state": result}

    per_domain_results = await asyncio.gather(*(run_for_candidate(c) for c in candidates))

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
            }
            for entry in per_domain_results
        },
        "combined_citations": combined_citations,
        "combined_summary": "\n\n".join(combined_summaries),
    }
