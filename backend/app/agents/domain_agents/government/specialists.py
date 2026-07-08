"""
Government Domain - Specialist Agents
Routes to: identity_documents, travel_documents, civil_certificates,
transport_licensing, property_land_records, pensions_welfare, grievance_rti,
general_government
"""
import json
import logging
from typing import Dict, Any
from app.llm.gemini.service import gemini_service
from app.models.domain import Domain
from app.rag.retrieval.qdrant_service import qdrant_service

logger = logging.getLogger(__name__)


class GovernmentSpecialistAgent:
    def __init__(self, name: str, focus: str, system_prompt: str):
        self.name = name
        self.focus = focus
        self.system_prompt = system_prompt

    async def process(self, context: Dict[str, Any]) -> Dict[str, Any]:
        query = context.get("case_summary", "")
        facts = context.get("extracted_facts", {})

        results = await qdrant_service.search_chunks(
            Domain.GOVERNMENT, f"{self.focus}: {query}", top_k=5
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
    "escalation_path": "Issuing Office -> Appellate Authority -> CPGRAMS / RTI",
    "grievance_channel": "CPGRAMS / RTI Online / Departmental Grievance Cell / Ombudsman",
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


class IdentityDocumentsAgent(GovernmentSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Identity Documents Specialist",
            focus="Aadhaar update/correction, UIDAI enrolment, PAN application/correction, PAN-Aadhaar linking, DigiLocker",
            system_prompt="""You are an expert on Aadhaar (UIDAI) and PAN (Income Tax Department / Protean)
identity document processes in India. You evaluate cases of rejected or delayed Aadhaar updates,
PAN corrections, PAN-Aadhaar linking failures, and DigiLocker document issues. You reference
UIDAI's grievance process, the Aadhaar Act 2016's alternate-identification safeguard, and
Income Tax / Protean correction procedures to recommend the correct next step."""
        )


class TravelDocumentsAgent(GovernmentSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Travel Documents (Passport) Specialist",
            focus="Passport application delay, Tatkal, reissue, police verification, Regional Passport Office grievance",
            system_prompt="""You are an expert on Indian passport issuance under the Ministry of External Affairs
and Passport Seva. You evaluate delayed or stuck passport applications, Tatkal eligibility,
police verification bottlenecks, and reissue/correction cases. You recommend the correct
escalation path through the Regional Passport Office, Passport Seva grievance cell, and
CPGRAMS against MEA."""
        )


class CivilCertificatesAgent(GovernmentSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Civil Certificates Specialist",
            focus="Income certificate, caste certificate, birth certificate, death certificate, e-District/Tahsil delays",
            system_prompt="""You are an expert on state-issued civil certificates in India: income certificates,
caste certificates, and birth/death certificates under the Registration of Births and Deaths
Act, 1969. You evaluate delayed field verification, scrutiny committee backlogs, and late
registration cases, and recommend escalation through the Tahsildar/Registrar, the state's
Right to Public Services appellate authority, and CPGRAMS where applicable."""
        )


class TransportLicensingAgent(GovernmentSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Transport & Licensing Specialist",
            focus="Driving licence, learner's licence, vehicle registration, RC transfer, Parivahan/Sarathi/Vahan",
            system_prompt="""You are an expert on Indian driving licence and vehicle registration processes
under the Ministry of Road Transport and Highways (MoRTH) and the Parivahan/Sarathi/Vahan
platforms. You evaluate stalled learner's/permanent licence applications, rescheduled tests,
incorrect DL records, and vehicle registration/transfer delays, recommending escalation
through the RTO, Regional Transport Commissioner, and CPGRAMS."""
        )


class PropertyLandRecordsAgent(GovernmentSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Property & Land Records Specialist",
            focus="Property registration delay, Sub-Registrar Office, stamp duty, mutation, Record of Rights",
            system_prompt="""You are an expert on property registration under the Registration Act, 1908 and
state land record (mutation) systems. You evaluate registration slot backlogs, documents held
for verification, valuation/stamp duty disputes, and post-registration mutation delays,
recommending escalation through the Sub-Registrar, District Registrar/IGR, and the
Tahsildar for mutation issues."""
        )


class PensionsWelfareAgent(GovernmentSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Pensions & Welfare Specialist",
            focus="EPFO pension/PF, NPS/PFRDA, PDS ration card, DBT failures, welfare scheme grievances",
            system_prompt="""You are an expert on Indian pension and welfare-benefit grievances: EPS-95 pension
and PF claims via EPFO, NPS via PFRDA/CRA, PDS ration entitlement, and Direct Benefit Transfer
(DBT) failures. You evaluate stopped pensions, rejected withdrawal claims, and benefit denials,
recommending escalation through EPFiGMS/CRA grievance channels, the relevant nodal ministry,
and CPGRAMS."""
        )


class GrievanceRtiAgent(GovernmentSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Public Grievance (CPGRAMS) & RTI Specialist",
            focus="CPGRAMS filing/appeal, RTI application, first/second appeal, PIO non-response",
            system_prompt="""You are an expert on India's public grievance redressal system (CPGRAMS, run by
DARPG) and the Right to Information Act, 2005. You evaluate cases needing a CPGRAMS grievance
or appeal, or an RTI application/appeal when a Public Information Officer has not responded
within the statutory window. You draft the correct escalation sequence and cite the relevant
statutory timelines (RTI's 30-day response window, CPGRAMS' appeal mechanism)."""
        )


class GeneralGovernmentAgent(GovernmentSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="General Government Services Specialist",
            focus="National Portal of India, National Consumer Helpline for government services, state e-District portals, welfare schemes",
            system_prompt="""You are a generalist on consumer-facing Indian government services not covered by a
more specific specialist: state e-District/Seva portal services, National Consumer Helpline
complaints about government-run services, and general welfare scheme enquiries. You identify
the correct department/portal and the standard escalation path (department grievance cell ->
CPGRAMS), or hand off to a more specific specialist when the case clearly fits one."""
        )


def get_government_specialists() -> Dict[str, GovernmentSpecialistAgent]:
    return {
        "identity_documents": IdentityDocumentsAgent(),
        "travel_documents": TravelDocumentsAgent(),
        "civil_certificates": CivilCertificatesAgent(),
        "transport_licensing": TransportLicensingAgent(),
        "property_land_records": PropertyLandRecordsAgent(),
        "pensions_welfare": PensionsWelfareAgent(),
        "grievance_rti": GrievanceRtiAgent(),
        "general_government": GeneralGovernmentAgent(),
    }
