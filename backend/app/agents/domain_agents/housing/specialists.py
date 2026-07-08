"""
Housing Domain - Specialist Agents
Routes to: rental_tenancy, rera_builder, property_registration, property_tax,
apartment_society, home_loan, consumer_escalation, general_housing
"""
import json
import logging
from typing import Dict, Any
from app.llm.service import llm_service
from app.models.domain import Domain
from app.rag.retrieval.qdrant_service import qdrant_service

logger = logging.getLogger(__name__)


class HousingSpecialistAgent:
    def __init__(self, name: str, focus: str, system_prompt: str):
        self.name = name
        self.focus = focus
        self.system_prompt = system_prompt

    async def process(self, context: Dict[str, Any]) -> Dict[str, Any]:
        query = context.get("case_summary", "")
        facts = context.get("extracted_facts", {})

        results = await qdrant_service.search_chunks(
            Domain.HOUSING, f"{self.focus}: {query}", top_k=5
        )
        context_text = "\n\n".join(r.get("text", "") for r in results)

        prompt = f"""{self.system_prompt}

# User Query
{query}

# Extracted Facts
{json.dumps(facts, indent=2)}

# Regulatory & Procedural Context (retrieved from knowledge base)
{context_text}

# Output (strict JSON only)
{{
    "analysis": "...",
    "applicable_rules": ["..."],
    "action_plan": ["..."],
    "escalation_path": "State RERA Authority / Registrar of Cooperative Societies / Sub-Registrar / RBI Ombudsman / Consumer Forum",
    "grievance_channel": "State RERA / Rent Authority / Registrar / NCDRC / National Consumer Helpline",
    "estimated_resolution_days": "..."
}}"""
        raw = await llm_service.generate(prompt, purpose="reasoning")
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


class RentalTenancyAgent(HousingSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Rental & Tenancy Specialist",
            focus="Rental agreement disputes, security deposit refunds, landlord-tenant disputes, illegal eviction, Model Tenancy Act",
            system_prompt="""You are an expert on Indian rental/tenancy law: rental and lease agreements,
security deposit refund disputes, landlord-tenant conflicts, and the Model Tenancy Act, 2021 framework
where a state has adopted it. You evaluate disputes over deposit withholding, illegal lock-outs,
unauthorized rent hikes, and repair obligations, recommending the correct Rent Authority/civil remedy."""
        )


class ReraBuilderAgent(HousingSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="RERA & Builder Disputes Specialist",
            focus="RERA complaints, builder possession delay, defective construction, occupancy certificate, completion certificate, promoter obligations",
            system_prompt="""You are an expert on the Real Estate (Regulation and Development) Act, 2016 (RERA)
and builder-buyer disputes. You evaluate possession delays (Section 18), structural/quality defects
(Section 14(3)), occupancy/completion certificate non-compliance, and hidden charges, citing the
specific RERA section and recommending State RERA Authority complaint procedure and remedy (refund
with interest, continued possession with interest, or rectification)."""
        )


class PropertyRegistrationAgent(HousingSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Property Registration Specialist",
            focus="Property registration delay, Sub-Registrar Office, stamp duty, encumbrance certificate, mutation, Registration Act 1908",
            system_prompt="""You are an expert on property registration under the Registration Act, 1908,
state stamp duty rules, and encumbrance certificates. You evaluate registration delays, stamp duty
refund requests, and encumbrance certificate errors, recommending escalation through the Sub-Registrar,
District Registrar/IGR, and the Tahsildar for mutation issues."""
        )


class PropertyTaxAgent(HousingSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Property Tax Specialist",
            focus="Property tax assessment disputes, wrong classification, municipal corporation tax appeals",
            system_prompt="""You are an expert on Indian municipal property tax assessment and disputes.
You evaluate incorrect classification, wrong built-up area, or incorrect occupancy-status assessments,
recommending correction requests to the Municipal Corporation Revenue department and the applicable
statutory appeal mechanism."""
        )


class ApartmentSocietyAgent(HousingSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Apartment Society & Maintenance Specialist",
            focus="Maintenance charge disputes, society NOC denial, RWA/managing committee conduct, Cooperative Societies Act",
            system_prompt="""You are an expert on housing society/RWA governance under state Cooperative
Societies Acts and RERA-linked builder maintenance obligations. You evaluate disputes over illegal or
undisclosed maintenance charges and NOC denials, recommending escalation to the society general body,
the Registrar of Cooperative Societies, or the State RERA Authority where a builder still controls
maintenance before formal handover."""
        )


class HomeLoanAgent(HousingSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Home Loan Specialist",
            focus="Home loan documentation, foreclosure penalty, property document release, construction-linked disbursement",
            system_prompt="""You are an expert on Indian home loan documentation and RBI's lender-conduct
directions. You evaluate foreclosure/prepayment penalty disputes on floating-rate loans, delayed
release of property documents after loan closure, and construction-linked disbursement issues,
recommending escalation through the lender's Nodal Officer and the RBI Integrated Ombudsman Scheme."""
        )


class ConsumerEscalationAgent(HousingSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Consumer Escalation Specialist",
            focus="NCDRC, consumer court filing, National Consumer Helpline, general housing grievance escalation",
            system_prompt="""You are a generalist on consumer-forum escalation for housing disputes not
resolved by RERA, the society, or the registration department. You know when a District/State/National
Consumer Disputes Redressal Commission complaint is the right next step (deficiency in service,
compensation claims) versus a specialized forum, and cite the applicable pecuniary jurisdiction."""
        )


class GeneralHousingAgent(HousingSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="General Housing Specialist",
            focus="MoHUA policy, PMAY scheme guidance, general housing questions not covered by a more specific specialist",
            system_prompt="""You are a generalist on Indian housing policy: MoHUA programs, PMAY scheme
eligibility and documentation, and general citizen housing questions. You identify the correct
department/portal and hand off to a more specific specialist when the case clearly fits one."""
        )


def get_housing_specialists() -> Dict[str, HousingSpecialistAgent]:
    return {
        "rental_tenancy": RentalTenancyAgent(),
        "rera_builder": ReraBuilderAgent(),
        "property_registration": PropertyRegistrationAgent(),
        "property_tax": PropertyTaxAgent(),
        "apartment_society": ApartmentSocietyAgent(),
        "home_loan": HomeLoanAgent(),
        "consumer_escalation": ConsumerEscalationAgent(),
        "general_housing": GeneralHousingAgent(),
    }
