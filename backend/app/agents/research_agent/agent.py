"""Research Agent — searches Qdrant, Neo4j, and Web to answer:

- Which clauses apply?
- Which exclusions apply?
- Which waiting period applies?
- Which regulations apply?
"""

from __future__ import annotations

from app.agents.json_parser import parse_agent_json
from app.agents.state import AgentState, ResearchOutput
from app.knowledge_graph.neo4j.service import knowledge_graph
from app.llm.service import llm_service
from app.prompts.health_insurance_agents import research_prompt
from app.rag.retrieval.qdrant_service import qdrant_service
from app.services.web_search import web_search_service

RESEARCH_QUERIES = [
    "policy coverage clauses exclusions waiting period",
    "IRDAI health insurance regulations claim denial appeal",
    "medical necessity pre-authorization reimbursement",
]

RESEARCH_FALLBACK_FIELDS: dict = {
    "applicable_clauses": [],
    "possible_exclusions": [],
    "waiting_periods": [],
    "regulations": [],
    "confidence": 0.0,
}


def rank_hits(hits: list[dict]) -> list[dict]:
    """Rank vector search hits by score with authority boost."""
    for hit in hits:
        score = float(hit.get("score", 0))
        meta = hit.get("metadata", {})
        # Boost IRDAI, RBI, NPCI and regulatory sources
        authority = (meta.get("authority") or meta.get("category") or "").lower()
        if any(keyword in authority for keyword in ("irdai", "rbi", "npci", "regulation", "circular", "guideline", "ombudsman")):
            score += 0.5
        # Boost insurer/bank-specific documents
        if meta.get("insurer_name") or meta.get("bank"):
            score += 0.05
        hit["_rank_score"] = min(score, 1.0)
    return sorted(hits, key=lambda h: h.get("_rank_score", 0), reverse=True)


async def run_research_agent(state: AgentState) -> AgentState:
    """Execute the research agent: search Qdrant + Neo4j + Web, then synthesize via Gemini."""
    domain = state["domain"]
    institution = state.get("institution_name", "")
    case_summary = state.get("case_summary", "")
    combined_query = f"{case_summary} {institution} " + " ".join(RESEARCH_QUERIES)

    # --- 1. Vector search (Qdrant) ---
    all_hits: list[dict] = []
    seen: set[str] = set()
    for query in [combined_query, f"{institution} policy wording rules regulations"]:
        hits = await qdrant_service.search(domain, query, limit=6)
        for hit in hits:
            hit_id = str(hit.get("id"))
            if hit_id not in seen:
                seen.add(hit_id)
                all_hits.append(hit)

    # --- 2. Knowledge Graph (Neo4j) ---
    patterns = await knowledge_graph.find_institution_patterns(domain, institution)
    graph_lines = [p.get("pattern", "") for p in patterns if p.get("pattern")]
    state["graph_context"] = "\n".join(graph_lines)

    # --- 3. Web Search ---
    from app.models.domain import Domain as DomainEnum
    if domain == DomainEnum.BANKING:
        web_query = f"{institution} banking dispute RBI ombudsman complaint {case_summary[:200]}"
    else:
        web_query = f"{institution} health insurance claim denial IRDAI appeal {case_summary[:200]}"
    web_results = await web_search_service.search(
        web_query,
        max_results=3,
    )

    state["web_search_results"] = web_results
    web_context = ""
    if web_results:
        web_context = "\n\n".join(
            f"Web: {r.get('title', '')}\n{r.get('url', '')}\n{r.get('snippet', '')}" for r in web_results
        )

    # --- 4. Rank and format context ---
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

    # --- 5. Gemini synthesis ---
    prompt = research_prompt(
        domain,
        case_summary,
        state.get("retrieved_context", ""),
        state.get("graph_context", ""),
    )
    raw = await llm_service.generate(prompt, temperature=0.15, purpose="reasoning")

    # --- 6. Parse structured output ---
    parsed = parse_agent_json(raw, RESEARCH_FALLBACK_FIELDS)
    research_output: ResearchOutput = {
        "applicable_clauses": parsed.get("applicable_clauses", []),
        "possible_exclusions": parsed.get("possible_exclusions", []),
        "waiting_periods": parsed.get("waiting_periods", []),
        "regulations": parsed.get("regulations", []),
        "summary": parsed.get("summary", raw[:2000]),
        "confidence": float(parsed.get("confidence", 0.5)),
    }
    state["research_output"] = research_output
    state["research_summary"] = research_output["summary"]
    state["citations"] = [
        hit.get("metadata", {}).get("final_url") or hit.get("metadata", {}).get("source_path") or str(hit.get("id"))
        for hit in ranked
    ]
    from app.services.citation_engine import build_citations
    state["structured_citations"] = build_citations(domain, ranked)
    state["llm_call_count"] = int(state.get("llm_call_count", 0)) + 1
    state.setdefault("agent_trace", []).append("research:qdrant+graph+web+gemini")
    return state
