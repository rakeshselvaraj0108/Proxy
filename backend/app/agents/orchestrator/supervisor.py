from app.agents.domain_agents.health_insurance.specialists import run_health_specialists
from app.agents.role_agents.graph import run_graph_role_agent
from app.agents.role_agents.negotiator import run_negotiator_agent
from app.agents.role_agents.planner import run_planner_agent
from app.agents.role_agents.response import run_response_agent
from app.agents.role_agents.retrieval import run_retrieval_agent
from app.agents.state import AgentState
from app.models.domain import Domain


class SupervisorAgent:
    """Routes work to the smallest useful set of agents.

    Supervisor and planner are deterministic to avoid spending an LLM call on
    orchestration. Retrieval and graph are tool calls. Only selected domain
    specialists call the LLM, and the negotiator runs only for multi-route cases.
    """

    async def run(self, state: AgentState) -> AgentState:
        state.setdefault("agent_trace", []).append("supervisor:start")
        state = await run_planner_agent(state)
        state = await run_retrieval_agent(state)
        state = await run_graph_role_agent(state)
        state = await self._run_domain_specialists(state)
        if state.get("plan", {}).get("tools", {}).get("negotiator", False):
            state = await run_negotiator_agent(state)
        state = await run_response_agent(state)
        state.setdefault("agent_trace", []).append("supervisor:done")
        return state

    async def _run_domain_specialists(self, state: AgentState) -> AgentState:
        domain = state["domain"]
        if domain == Domain.HEALTH_INSURANCE:
            return await run_health_specialists(state)
        state.setdefault("specialist_outputs", []).append(
            {
                "agent": "FAQ/General Agent",
                "route": "faq",
                "answer": "This domain is registered for future support. Add domain specialists before production routing.",
                "citations": state.get("citations", []),
            }
        )
        return state


supervisor_agent = SupervisorAgent()
