from app.agents.domain_agents.health_insurance.specialists import run_health_specialists
from app.agents.evidence_agent.agent import run_evidence_agent
from app.agents.graph_agent.agent import run_graph_agent
from app.agents.negotiation_agent.agent import run_negotiation_agent
from app.agents.role_agents.graph import run_graph_role_agent
from app.agents.role_agents.negotiator import run_negotiator_agent
from app.agents.role_agents.planner import run_planner_agent
from app.agents.role_agents.response import run_response_agent
from app.agents.role_agents.retrieval import run_retrieval_agent
from app.agents.role_agents.web_search import run_web_search_agent
from app.agents.research_agent.agent import run_research_agent
from app.agents.review_agent.agent import run_review_agent
from app.agents.state import AgentState
from app.agents.strategy_agent.agent import run_strategy_agent


async def run_domain_specialists(state: AgentState) -> AgentState:
    from app.models.domain import Domain
    domain = state["domain"]
    if domain == Domain.BANKING:
        from app.agents.domain_agents.banking.specialists import run_banking_specialists
        return await run_banking_specialists(state)
    return await run_health_specialists(state)


class CaseWorkflow:
    """LangGraph-backed supervisor workflow.

    Default flow:
    FastAPI -> LangGraph StateGraph -> Supervisor start -> Planner ->
    Retrieval -> Graph/Web tool nodes when needed -> selected domain
    specialists -> Negotiator only when multiple specialists are used -> Response.

    If LangGraph is not installed in a deployment, the same nodes run through a
    deterministic fallback sequence so the API remains functional.
    """

    def __init__(self) -> None:
        self._graph = self._compile_graph()

    async def run(self, state: AgentState) -> AgentState:
        if self._graph is not None:
            return await self._graph.ainvoke(state)
        return await self._run_fallback(state)

    async def run_full_review(self, state: AgentState) -> AgentState:
        state = await run_research_agent(state)
        state = await run_graph_agent(state)
        state = await run_evidence_agent(state)
        state = await run_strategy_agent(state)
        state = await run_negotiation_agent(state)
        state = await run_review_agent(state)
        return state

    def _compile_graph(self):
        try:
            from langgraph.graph import END, START, StateGraph
        except Exception:
            return None

        graph = StateGraph(AgentState)
        graph.add_node("supervisor_start", self._supervisor_start)
        graph.add_node("planner", run_planner_agent)
        graph.add_node("retrieval", run_retrieval_agent)
        graph.add_node("graph", run_graph_role_agent)
        graph.add_node("web_search", run_web_search_agent)
        graph.add_node("specialists", run_domain_specialists)
        graph.add_node("negotiator", run_negotiator_agent)
        graph.add_node("evidence", run_evidence_agent)
        graph.add_node("strategy", run_strategy_agent)
        graph.add_node("appeal", run_negotiation_agent)
        graph.add_node("review", run_review_agent)
        graph.add_node("response", run_response_agent)
        graph.add_node("supervisor_done", self._supervisor_done)

        graph.add_edge(START, "supervisor_start")
        graph.add_edge("supervisor_start", "planner")
        graph.add_edge("planner", "retrieval")
        graph.add_edge("retrieval", "graph")
        graph.add_edge("graph", "web_search")
        graph.add_edge("web_search", "specialists")
        graph.add_conditional_edges(
            "specialists",
            self._after_specialists,
            {"negotiator": "negotiator", "evidence": "evidence"},
        )
        graph.add_edge("negotiator", "evidence")
        graph.add_edge("evidence", "strategy")
        graph.add_edge("strategy", "appeal")
        graph.add_edge("appeal", "review")
        graph.add_edge("review", "response")
        graph.add_edge("response", "supervisor_done")
        graph.add_edge("supervisor_done", END)
        return graph.compile()

    async def _run_fallback(self, state: AgentState) -> AgentState:
        state = await self._supervisor_start(state)
        state = await run_planner_agent(state)
        state = await run_retrieval_agent(state)
        state = await run_graph_role_agent(state)
        state = await run_web_search_agent(state)
        state = await run_domain_specialists(state)

        if self._after_specialists(state) == "negotiator":
            state = await run_negotiator_agent(state)
        state = await run_evidence_agent(state)
        state = await run_strategy_agent(state)
        state = await run_negotiation_agent(state)
        state = await run_review_agent(state)
        state = await run_response_agent(state)
        return await self._supervisor_done(state)

    async def _supervisor_start(self, state: AgentState) -> AgentState:
        state.setdefault("agent_trace", []).append("supervisor:start")
        state.setdefault("llm_call_count", 0)
        state["workflow_engine"] = "langgraph" if self._graph is not None else "fallback"
        return state

    async def _supervisor_done(self, state: AgentState) -> AgentState:
        state.setdefault("agent_trace", []).append("supervisor:done")
        return state

    def _after_specialists(self, state: AgentState) -> str:
        if state.get("plan", {}).get("tools", {}).get("negotiator", False):
            return "negotiator"
        return "evidence"


case_workflow = CaseWorkflow()
