from app.agents.evidence_agent.agent import run_evidence_agent
from app.agents.final_report_agent.agent import run_final_report_agent
from app.agents.graph_agent.agent import run_graph_agent
from app.agents.negotiation_agent.agent import run_negotiation_agent
from app.agents.research_agent.agent import run_research_agent
from app.agents.review_agent.agent import run_review_agent
from app.agents.state import AgentState
from app.agents.strategy_agent.agent import run_strategy_agent


class CaseAnalysisWorkflow:
    """Linear LangGraph pipeline for full health insurance case analysis.

    Upload Documents -> Research -> Evidence -> Knowledge Graph ->
    Strategy -> Negotiation -> Review -> Final Report
    """

    def __init__(self) -> None:
        self._graph = self._compile_graph()

    async def run(self, state: AgentState) -> AgentState:
        if self._graph is not None:
            return await self._graph.ainvoke(state)
        return await self._run_fallback(state)

    async def run_research_only(self, state: AgentState) -> AgentState:
        state = await self._init(state)
        state = await run_research_agent(state)
        state = await run_graph_agent(state)
        return state

    async def run_appeal_only(self, state: AgentState) -> AgentState:
        state = await self._init(state)
        if not state.get("research_summary"):
            state = await run_research_agent(state)
        if not state.get("evidence_summary"):
            state = await run_evidence_agent(state)
        if not state.get("strategy"):
            state = await run_strategy_agent(state)
        state = await run_negotiation_agent(state)
        return state

    def _compile_graph(self):
        try:
            from langgraph.graph import END, START, StateGraph
        except Exception:
            return None

        graph = StateGraph(AgentState)
        graph.add_node("init", self._init)
        graph.add_node("research", run_research_agent)
        graph.add_node("evidence", run_evidence_agent)
        graph.add_node("graph", run_graph_agent)
        graph.add_node("strategy", run_strategy_agent)
        graph.add_node("negotiation", run_negotiation_agent)
        graph.add_node("review", run_review_agent)
        graph.add_node("final_report", run_final_report_agent)
        graph.add_node("done", self._done)

        graph.add_edge(START, "init")
        graph.add_edge("init", "research")
        graph.add_edge("research", "evidence")
        graph.add_edge("evidence", "graph")
        graph.add_edge("graph", "strategy")
        graph.add_edge("strategy", "negotiation")
        graph.add_edge("negotiation", "review")
        graph.add_edge("review", "final_report")
        graph.add_edge("final_report", "done")
        graph.add_edge("done", END)
        return graph.compile()

    async def _run_fallback(self, state: AgentState) -> AgentState:
        state = await self._init(state)
        state = await run_research_agent(state)
        state = await run_evidence_agent(state)
        state = await run_graph_agent(state)
        state = await run_strategy_agent(state)
        state = await run_negotiation_agent(state)
        state = await run_review_agent(state)
        state = await run_final_report_agent(state)
        return await self._done(state)

    async def _init(self, state: AgentState) -> AgentState:
        state.setdefault("agent_trace", []).append("case_analysis:start")
        state.setdefault("llm_call_count", 0)
        state["workflow_engine"] = "langgraph" if self._graph is not None else "fallback"
        return state

    async def _done(self, state: AgentState) -> AgentState:
        state.setdefault("agent_trace", []).append("case_analysis:done")
        return state


case_analysis_workflow = CaseAnalysisWorkflow()
