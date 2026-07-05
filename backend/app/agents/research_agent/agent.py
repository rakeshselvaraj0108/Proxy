import json

from app.agents.state import AgentState
from app.knowledge_graph.neo4j.service import knowledge_graph
from app.llm.gemini.service import gemini_service
from app.prompts.health_insurance_agents import research_prompt
from app.rag.retrieval.qdrant_service import qdrant_service
from app.services.web_search import web_search_service

from app.agents.research_agent.agent import rank_hits

RESEARCH_QUERIES = [
    "policy coverage clauses exclusions waiting period",
    "IRDAI health insurance regulations claim denial appeal",
    "medical necessity pre-authorization reimbursement",
]


async def run_research_agent(state: AgentState) -> AgentState:
    domain = state["domain"]
    institution = state.get("institution_name", "")
    combined_query = f"{state.get('case_summary', '')} {institution} " + " ".join(RESEARCH_QUERIES)

    all_hits: list[dict] = []
    seen: set[str] = set()
    for query in [combined_query, f"{institution} policy wording exclusions waiting period"]:
        hits = rank_hits(await qdrant_service.search(domain, query, limit=6))
        for hit in hits:
            hit_id = str(hit.get("id"))
            if hit_id not in seen:
                seen.add(hit_id)
                all_hits.append(hit)

    patterns = await knowledge_graph.find_institution_patterns(domain, institution)
    graph_lines = [p.get("pattern", "") for p in patterns if p.get("pattern")]
    state["graph_context"] = "\n".join(graph_lines)

    web_results = await web_search_service.search(
        f"{institution} health insurance claim denial IRDAI appeal {state.get('case_summary', '')[:200]}",
        max_results=3,
    )
    state["web_search_results"] = web_results
    web_context = ""
    if web_results:
        web_context = "\n\n".join(
            f"Web: {r.get('title', '')}\n{r.get('url', '')}\n{r.get('snippet', '')}" for r in web_results
        )

    ranked = rank_hits(all_hits)[:10]
    state["retrieved_context"] = "\n\n".join(
        f"Source: {hit.get('metadata', {}).get('title') or hit.get('metadata', {}).get('filename') or hit['id']}\n"
        f"Authority: {hit.get('metadata', {}).get('authority') or hit.get('metadata', {}).get('insurer_name', 'unknown')}\n"
        f"Category: {hit.get('metadata', {}).get('category', 'unknown')}\n"
        f"Citation: {hit.get('metadata', {}).get('final_url') or hit.get('metadata', {}).get('source_path') or hit['id']}\n"
        f"Text: {hit.get('text', '')[:1500]}"
        for hit in ranked
    )
    if web_context:
        state["retrieved_context"] = f"{state.get('retrieved_context', '')}\n\n{web_context}".strip()

    prompt = research_prompt(
        domain,
        state.get("case_summary", ""),
        state.get("retrieved_context", ""),
        state.get("graph_context", ""),
    )
    analysis = await gemini_service.generate(prompt, temperature=0.15, purpose="reasoning")
    state["research_summary"] = analysis
    state["citations"] = [
        hit.get("metadata", {}).get("final_url") or hit.get("metadata", {}).get("source_path") or str(hit.get("id"))
        for hit in ranked
    ]
    state["llm_call_count"] = int(state.get("llm_call_count", 0)) + 1
    state.setdefault("agent_trace", []).append("research:qdrant+graph+web+gemini")
    return state
