from __future__ import annotations

from app.agents.state import AgentState

CLAIM_TERMS = {"claim", "denial", "denied", "cashless", "reimbursement", "settlement", "preauth", "pre-authorisation", "preauthorization", "hospital bill"}
POLICY_TERMS = {"cover", "covered", "coverage", "policy", "exclusion", "waiting period", "room rent", "sum insured", "rider", "add-on", "deductible"}
MEDICAL_TERMS = {"surgery", "disease", "diagnosis", "treatment", "procedure", "cataract", "cancer", "diabetes", "mri", "ct scan", "ayush"}
LEGAL_TERMS = {"irdai", "regulation", "circular", "ombudsman", "grievance", "complaint", "rights", "rule", "law", "appeal"}
FAQ_TERMS = {"how", "what", "when", "where", "who", "faq", "general", "explain"}


def _contains(text: str, terms: set[str]) -> bool:
    return any(term in text for term in terms)


def build_plan(state: AgentState) -> dict:
    query = state.get("case_summary", "").lower()
    specialists: list[str] = []

    if _contains(query, CLAIM_TERMS):
        specialists.append("claims")
    if _contains(query, POLICY_TERMS):
        specialists.append("policy")
    if _contains(query, MEDICAL_TERMS):
        specialists.append("medical")
    if _contains(query, LEGAL_TERMS):
        specialists.append("legal")

    if not specialists:
        specialists.append("faq")
    if _contains(query, FAQ_TERMS) and len(specialists) == 0:
        specialists.append("faq")

    needs_graph = bool(state.get("institution_name"))
    needs_web = any(term in query for term in ["latest", "today", "current", "new circular", "recent"])

    return {
        "route": specialists[0],
        "specialists": specialists[:3],
        "tools": {
            "retrieval": True,
            "knowledge_graph": needs_graph,
            "web_search": needs_web,
            "negotiator": len(specialists) > 1,
        },
        "reason": f"Routed to {', '.join(specialists)} based on query intent.",
    }


async def run_planner_agent(state: AgentState) -> AgentState:
    plan = build_plan(state)
    state["plan"] = plan
    state["route"] = plan["route"]
    state.setdefault("agent_trace", []).append(f"planner:{plan['route']}")
    return state
