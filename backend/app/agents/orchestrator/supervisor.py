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
        elif domain == Domain.BANKING:
            from app.agents.domain_agents.banking.specialists import run_banking_specialists
            return await run_banking_specialists(state)
        elif domain == Domain.AIRLINES:
            from app.agents.domain_agents.airlines.specialists import get_airline_specialists
            state.setdefault("agent_trace", []).append("airlines_orchestrator:start")
            plan = state.get("plan", {})
            routes = plan.get("specialists", ["general_aviation"])
            specialists = get_airline_specialists()
            all_results = []
            for route in routes:
                agent = specialists.get(route)
                if agent:
                    res = await agent.process(state)
                    all_results.append(res)
                    state.setdefault("agent_trace", []).append(f"specialist_executed:{agent.name}")
            state["specialist_results"] = all_results
            return state
        elif domain == Domain.TELECOM:
            from app.agents.domain_agents.telecom.specialists import get_telecom_specialists
            state.setdefault("agent_trace", []).append("telecom_orchestrator:start")
            plan = state.get("plan", {})
            routes = plan.get("specialists", ["general_telecom"])
            specialists = get_telecom_specialists()
            all_results = []
            for route in routes:
                agent = specialists.get(route)
                if agent:
                    res = await agent.process(state)
                    all_results.append(res)
                    state.setdefault("agent_trace", []).append(f"specialist_executed:{agent.name}")
            state["specialist_results"] = all_results
            return state
        elif domain == Domain.ECOMMERCE:
            from app.agents.domain_agents.ecommerce.specialists import get_ecommerce_specialists
            state.setdefault("agent_trace", []).append("ecommerce_orchestrator:start")
            plan = state.get("plan", {})
            routes = plan.get("specialists", ["consumer_protection"])
            specialists = get_ecommerce_specialists()
            all_results = []
            for route in routes:
                agent = specialists.get(route)
                if agent:
                    res = await agent.process(state)
                    all_results.append(res)
                    state.setdefault("agent_trace", []).append(f"specialist_executed:{agent.name}")
            state["specialist_results"] = all_results
            return state
        elif domain == Domain.GOVERNMENT:
            from app.agents.domain_agents.government.specialists import get_government_specialists
            state.setdefault("agent_trace", []).append("government_orchestrator:start")
            plan = state.get("plan", {})
            routes = plan.get("specialists", ["general_government"])
            specialists = get_government_specialists()
            all_results = []
            for route in routes:
                agent = specialists.get(route)
                if agent:
                    res = await agent.process(state)
                    all_results.append(res)
                    state.setdefault("agent_trace", []).append(f"specialist_executed:{agent.name}")
            state["specialist_results"] = all_results
            return state
        state.setdefault("specialist_outputs", []).append(
            {
                "agent": "FAQ/General Agent",
                "route": "faq",
                "answer": f"This domain {domain} is registered for future support. Add domain specialists before production routing.",
                "citations": state.get("citations", []),
            }
        )
        return state



supervisor_agent = SupervisorAgent()
