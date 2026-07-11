"""
Telecom Domain - Specialist Agents
Routes to: trai_regulatory, billing_disputes, network_quality, mnp_portability, general_telecom
"""
import json
import logging
from typing import Dict, Any
from app.llm.gemini.service import gemini_service
from app.models.domain import Domain
from app.rag.retrieval.qdrant_service import qdrant_service

logger = logging.getLogger(__name__)


class TelecomSpecialistAgent:
    def __init__(self, name: str, focus: str, system_prompt: str):
        self.name = name
        self.focus = focus
        self.system_prompt = system_prompt

    async def process(self, context: Dict[str, Any]) -> Dict[str, Any]:
        query = context.get("case_summary", "")
        evidence_bundle = context.get("evidence_bundle", "")

        results = await qdrant_service.search_chunks(
            Domain.TELECOM, f"{self.focus}: {query}", top_k=5
        )
        context_text = "\n\n".join(r.get("text", "") for r in results)

        evidence_section = evidence_bundle[:16000] if evidence_bundle else "No documents were uploaded for this case."
        evidence_instruction = (
            "Before using the uploaded evidence above, check whether it actually relates to this case "
            "(same operator/account, same bill or incident, same underlying issue -- not just the same broad "
            "topic). Set \"evidence_relevant\" to false if it clearly does NOT relate (e.g. it's a certificate "
            "or an unrelated document), and in that case do not draw any facts from it. Set it to true if it "
            "DOES relate, and then treat its dates, amounts, and reference numbers as verified facts and use "
            "them directly."
            if evidence_bundle
            else ""
        )

        prompt = f"""{self.system_prompt}

# User Query
{query}

# Uploaded Case Evidence
{evidence_section}

# Regulatory & Policy Context (retrieved from knowledge base)
{context_text}

{evidence_instruction}

# Output (strict JSON only)
{{
    "evidence_relevant": true,
    "analysis": "...",
    "applicable_regulations": ["..."],
    "action_plan": ["..."],
    "escalation_path": "TRAI / DoT / TDSAT / Consumer Court",
    "refund_eligible": "YES/NO/PARTIAL",
    "estimated_resolution_days": "..."
}}"""
        raw = await gemini_service.generate(prompt, purpose="reasoning")
        try:
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].strip()
            data = json.loads(raw)
        except Exception as e:
            logger.error(f"{self.name} JSON parse error: {e}")
            data = {"error": str(e), "raw": raw}

        return {"specialist_name": self.name, "specialist_focus": self.focus, "strategy": data}


class TRAIRegulatoryAgent(TelecomSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="TRAI Regulatory Specialist",
            focus="TRAI regulations, Telecom Consumer Protection, QoS, billing transparency, DoT guidelines",
            system_prompt="""You are an expert TRAI regulatory specialist.
You have deep knowledge of the Telecom Consumer Protection Regulations 2012,
Quality of Service (QoS) standards, tariff orders, and the Consumer Protection Act 2019.
Your goal is to identify which specific TRAI regulation the operator has violated,
cite the exact clause, and draft a formal complaint to TRAI/DoT."""
        )


class BillingDisputeAgent(TelecomSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Billing & Recharge Dispute Specialist",
            focus="Wrong bill, unauthorized deductions, VAS charges, roaming charges, double recharge, refund",
            system_prompt="""You are an expert telecom billing dispute agent.
You understand how operators generate bills, apply surcharges, activate VAS without consent,
and illegally deduct balance. You enforce the TRAI directive that operators must obtain
EXPLICIT DOUBLE CONFIRMATION before activating any VAS. You calculate refund amounts
and compose strong demand letters citing TRAI regulations."""
        )


class NetworkQualityAgent(TelecomSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Network Quality & Speed Specialist",
            focus="Call drops, slow internet, data speed, signal quality, fiber delay, broadband QoS, SLA breach",
            system_prompt="""You are a telecom network quality expert.
You know the TRAI QoS benchmarks: operators must maintain minimum 90% call success rate,
and broadband providers must deliver 80% of the advertised speed. You investigate
SLA breaches, calculate compensation for service downtime, and escalate to TRAI's
consumer portal when operators fail to meet mandated quality standards."""
        )


class MNPAgent(TelecomSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Mobile Number Portability (MNP) Specialist",
            focus="MNP failure, SIM not activated, port rejection, transfer delay, UPC code",
            system_prompt="""You are an MNP (Mobile Number Portability) dispute specialist.
You know that under TRAI MNP regulations, a porting request must be completed within
7 working days. Operators cannot reject a port request without a valid reason.
You identify unlawful port rejections and draft escalation complaints to TRAI and DoT."""
        )


class GeneralTelecomAgent(TelecomSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="General Telecom Support Specialist",
            focus="SIM activation, disconnection, OTT bundles, enterprise complaints, consumer rights",
            system_prompt="""You are a general telecom consumer rights advocate.
You handle SIM activation failures, unauthorized disconnections, OTT bundle disputes,
and enterprise connectivity issues. You reference the Consumer Protection Act 2019
and TRAI's grievance redressal framework to resolve complex cases."""
        )


def get_telecom_specialists() -> Dict[str, TelecomSpecialistAgent]:
    return {
        "trai_regulatory": TRAIRegulatoryAgent(),
        "billing_disputes": BillingDisputeAgent(),
        "network_quality": NetworkQualityAgent(),
        "mnp_portability": MNPAgent(),
        "general_telecom": GeneralTelecomAgent(),
    }
