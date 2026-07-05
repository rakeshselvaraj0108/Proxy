import json
import logging
from typing import Dict, Any, Optional
from app.llm.gemini.service import gemini_service
from app.models.domain import Domain
from app.rag.retrieval.qdrant_service import qdrant_service
from app.agents.role_agents.base import BaseAgent

logger = logging.getLogger(__name__)

class AirlineSpecialistAgent(BaseAgent):
    """Base class for all airline specialists"""
    def __init__(self, name: str, focus: str, system_prompt: str):
        self.name = name
        self.focus = focus
        self.system_prompt = system_prompt
        
    async def process(self, context: Dict[str, Any]) -> Dict[str, Any]:
        query = context.get("initial_query", "")
        facts = context.get("extracted_facts", {})
        
        # Pull vector context
        search_query = f"{self.focus}: {query}"
        results = await qdrant_service.search_chunks(Domain.AIRLINES, search_query, top_k=5)
        context_text = "\n\n".join([r.get("text", "") for r in results])
        
        prompt = f"""
{self.system_prompt}

# Task
Analyze the user's issue and provided evidence, and formulate a strategy based on the retrieved airline policies and DGCA regulations.

# User Query
{query}

# User Facts
{json.dumps(facts, indent=2)}

# Regulatory & Policy Context
{context_text}

# Output format
Return ONLY valid JSON:
{{
    "analysis": "...",
    "applicable_rules": ["..."],
    "action_plan": ["..."],
    "compensation_eligibility": "YES/NO/PARTIAL",
    "compensation_amount_estimate": "..."
}}
"""
        raw_response = await gemini_service.generate(prompt, purpose="reasoning")
        
        try:
            if "```json" in raw_response:
                raw_response = raw_response.split("```json")[1].split("```")[0].strip()
            elif "```" in raw_response:
                raw_response = raw_response.split("```")[1].strip()
            data = json.loads(raw_response)
        except Exception as e:
            logger.error(f"Failed to parse JSON from {self.name}: {e}")
            data = {"error": "Failed to parse strategy", "raw": raw_response}
            
        return {
            "specialist_name": self.name,
            "specialist_focus": self.focus,
            "strategy": data
        }

# ==========================================
# Specialized Airline Agents
# ==========================================

class DelayCancellationAgent(AirlineSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Delay and Cancellation Specialist",
            focus="Flight Delays, Cancellations, Missed Connections, Overbooking, DGCA CAR",
            system_prompt="""You are an expert aviation dispute agent specializing in flight delays, cancellations, and denied boarding.
You possess deep knowledge of the DGCA Civil Aviation Requirements (CAR), Passenger Charter, and Montreal Convention.
Your goal is to determine if the airline owes compensation, meals, or hotel accommodation based on the delay duration or cancellation notice period, and draft strong arguments to force the airline to comply."""
        )

class BaggageAgent(AirlineSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Baggage Claim Specialist",
            focus="Lost Baggage, Damaged Baggage, Delayed Baggage, Property Irregularity Report (PIR)",
            system_prompt="""You are an expert baggage dispute agent.
You understand the Montreal Convention weight-based limits (SDR) for international flights, and domestic carriage limits.
You focus on ensuring the passenger filed a Property Irregularity Report (PIR) within the strict timeline (7 days for damage, 21 days for delay/loss) and calculating maximum liability."""
        )

class RefundTicketingAgent(AirlineSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Refund & Ticketing Specialist",
            focus="Ticket Refunds, Cancellation Fees, Duplicate Charges, Name Corrections, No-Show Policies",
            system_prompt="""You are an expert in airline ticketing and refund policies.
You analyze fare rules (refundable vs non-refundable), DGCA rules on cancellation charges (which cannot exceed base fare + fuel surcharge), and mandatory refunds for statutory taxes (UDF, PSF).
You ensure passengers aren't charged predatory cancellation fees and help resolve duplicate booking charges."""
        )

class GeneralAviationAgent(AirlineSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="General Airline Support Specialist",
            focus="Customer Service Complaints, Wheelchair Assistance, Pet Travel, Lounge Issues, Travel Insurance",
            system_prompt="""You are a general airline dispute agent handling customer service failures, unprovided special assistance (wheelchairs), denied access, and travel insurance claims.
You use airline Conditions of Carriage and passenger charters to hold airlines accountable for service deficiencies."""
        )

# Factory function
def get_airline_specialists() -> Dict[str, AirlineSpecialistAgent]:
    return {
        "delay_cancellation": DelayCancellationAgent(),
        "baggage": BaggageAgent(),
        "refund_ticketing": RefundTicketingAgent(),
        "general_aviation": GeneralAviationAgent()
    }
