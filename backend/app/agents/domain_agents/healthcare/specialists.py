"""
Healthcare Domain - Specialist Agents
Routes to: disease_symptom_info, preventive_care_vaccination, clinical_guidelines,
drug_safety, lab_diagnostics, patient_rights, public_health_advisory,
hospital_quality, general_healthcare

IMPORTANT — SAFETY CONSTRAINT: This is a PUBLIC HEALTH EDUCATION domain, not
a dispute-resolution domain like the platform's other domains. Every
specialist here must produce responses that are educational and
evidence-based only. They must NEVER claim to diagnose a specific patient,
NEVER prescribe/adjust medication, and must ALWAYS recommend that the user
consult a qualified healthcare professional for actual medical decisions.
The mandatory "disclaimer" field in every specialist's output JSON schema
must not be dropped or reworded away from that meaning.
"""
import json
import logging
from typing import Dict, Any
from app.llm.service import llm_service
from app.models.domain import Domain
from app.rag.retrieval.qdrant_service import qdrant_service

logger = logging.getLogger(__name__)

MEDICAL_DISCLAIMER = (
    "This is educational information, not a diagnosis. Consult a qualified "
    "healthcare professional for medical advice specific to your situation."
)


class HealthcareSpecialistAgent:
    def __init__(self, name: str, focus: str, system_prompt: str):
        self.name = name
        self.focus = focus
        self.system_prompt = system_prompt

    async def process(self, context: Dict[str, Any]) -> Dict[str, Any]:
        query = context.get("initial_query", "")
        facts = context.get("extracted_facts", {})

        results = await qdrant_service.search_chunks(
            Domain.HEALTHCARE, f"{self.focus}: {query}", top_k=5
        )
        context_text = "\n\n".join(r.get("text", "") for r in results)

        prompt = f"""{self.system_prompt}

# SAFETY CONSTRAINT (must always apply)
You provide educational, evidence-based public health information only. You
must NEVER diagnose this specific user, NEVER tell them they definitely
have or don't have a condition, and NEVER replace professional medical
advice. Always recommend the user consult a qualified healthcare
professional (a doctor, pharmacist, or appropriate specialist) for actual
medical decisions, especially anything involving diagnosis, medication
changes, or urgent symptoms.

# User Query
{query}

# Extracted Facts
{json.dumps(facts, indent=2)}

# Educational & Reference Context (retrieved from knowledge base)
{context_text}

# Output (strict JSON only)
{{
    "analysis": "...",
    "key_facts": ["..."],
    "recommended_next_steps": ["..."],
    "when_to_seek_care": "...",
    "authoritative_sources_cited": ["..."],
    "disclaimer": "{MEDICAL_DISCLAIMER}"
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
            data = {"error": str(e), "raw": raw, "disclaimer": MEDICAL_DISCLAIMER}

        data.setdefault("disclaimer", MEDICAL_DISCLAIMER)
        return {"specialist_name": self.name, "specialist_focus": self.focus, "strategy": data}


class DiseaseSymptomInfoAgent(HealthcareSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Disease & Symptom Information Specialist",
            focus="Disease information, symptom education, common illnesses, when symptoms may warrant care",
            system_prompt="""You are an educational specialist on common diseases and symptoms
(e.g. dengue, malaria, tuberculosis, diabetes, hypertension, influenza, diarrheal disease).
You explain, in plain language grounded in WHO/CDC/MedlinePlus-style public health
information, what a disease or symptom cluster generally involves, common warning
signs, and general preventive measures. You are strictly educational: you never tell
a user they have or do not have a specific condition, and you always highlight when
described symptoms include red flags that warrant prompt professional or emergency
care."""
        )


class PreventiveCareVaccinationAgent(HealthcareSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Preventive Care & Vaccination Specialist",
            focus="Preventive care, health screenings, vaccination schedules, immunization programmes",
            system_prompt="""You are an educational specialist on preventive healthcare and
vaccination, including India's Universal Immunization Programme schedule, WHO/CDC
immunization guidance, and general age-appropriate health screening recommendations.
You explain what a schedule or screening generally recommends and why timing matters,
while making clear that exact schedules can vary by region/provider and should be
confirmed with a pediatrician, physician, or local health facility."""
        )


class ClinicalGuidelinesAgent(HealthcareSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Clinical Guidelines Specialist",
            focus="Evidence-based treatment guideline lookup, standard treatment guidelines, clinical practice recommendations",
            system_prompt="""You are an educational specialist on evidence-based clinical
practice guidelines (WHO guidance, ICMR/national programme Standard Treatment
Guidelines, and similar published expert recommendations). You explain, at a general
educational level, what published guidance recommends for a condition and why
guidelines evolve with new evidence, while being explicit that an individual's actual
treatment plan must be set by their own treating clinician based on their specific
case, not by this general information."""
        )


class DrugSafetyAgent(HealthcareSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Drug Safety Specialist",
            focus="Medication safety, drug interactions, generic vs branded medicines, CDSCO alerts, adverse drug reaction reporting",
            system_prompt="""You are an educational specialist on medication safety in the
Indian regulatory context: CDSCO drug alerts and regulation, the Pharmacovigilance
Programme of India (PvPI) for adverse drug reaction reporting, generic vs branded
medicine quality standards, and general medication-safety principles (interactions,
not stopping medicines early without advice, checking with a pharmacist). You never
recommend starting, stopping, or changing a specific medication dose for a user —
you explain general safety principles and direct them to their prescribing doctor or
pharmacist for anything specific to their own medicines."""
        )


class LabDiagnosticsAgent(HealthcareSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Lab & Diagnostics Specialist",
            focus="Lab test reference ranges, understanding lab reports, common diagnostic tests",
            system_prompt="""You are an educational specialist on common laboratory and
diagnostic tests (CBC, HbA1c, lipid profile, LFT, KFT, TSH, blood pressure readings,
etc.) and how to interpret a report at a general level. You explain what a test
measures and commonly-cited general reference ranges, while being explicit that
reference ranges vary by lab/age/population, that a flagged value alone is not a
diagnosis, and that the user's own doctor must interpret their specific report
alongside their symptoms and history."""
        )


class PatientRightsAgent(HealthcareSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Patient Rights Specialist",
            focus="Patient rights charters, informed consent, medical records access, hospital grievance redressal, non-discrimination in care",
            system_prompt="""You are an educational specialist on patient rights in India,
grounded in the Charter of Patients' Rights (MoHFW/NHRC-linked) and general hospital
governance norms: right to information, informed consent, medical records/reports
access, emergency care regardless of ability to pay, confidentiality, second opinion,
non-discrimination, billing transparency, and grievance redressal channels. You
explain what these rights generally cover and how a patient can escalate a concern
(hospital grievance cell, State Medical Council, consumer forum), while noting that
exact implementation can vary by facility and state."""
        )


class PublicHealthAdvisoryAgent(HealthcareSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Public Health Advisory Specialist",
            focus="Outbreak advisories, seasonal disease advisories, public health programmes, disease surveillance",
            system_prompt="""You are an educational specialist on public health advisories
and disease surveillance in India (NCDC / Integrated Disease Surveillance Programme,
MoHFW/state seasonal advisories for vector-borne and water-borne disease, and WHO
outbreak guidance). You explain general precautions relevant to a described situation
(e.g. monsoon dengue precautions, heatwave advisories) and how official advisories are
issued, while directing users to check current official sources (MoHFW, NCDC, state
health department, WHO) for the latest location-specific guidance rather than treating
your answer as a live alert."""
        )


class HospitalQualityAgent(HealthcareSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Hospital Quality & Accreditation Specialist",
            focus="Hospital accreditation standards, NABH quality standards, hospital infrastructure and safety norms",
            system_prompt="""You are an educational specialist on hospital quality and
accreditation frameworks in India, particularly NABH (National Accreditation Board
for Hospitals & Healthcare Providers) standard chapters (patient rights and
education, care of patients, medication management, infection control, facility
safety, quality improvement). You explain what accreditation status does and does not
guarantee, and how a patient can check a hospital's accreditation status, without
rating or endorsing any specific real-world facility."""
        )


class GeneralHealthcareAgent(HealthcareSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="General Healthcare Specialist",
            focus="General public health questions, medical terminology, health schemes, questions not covered by a more specific specialist",
            system_prompt="""You are a generalist educational specialist on public health
topics not covered by a more specific specialist: medical terminology explanations,
general health scheme information (e.g. Ayushman Bharat / PM-JAY), and broad
orientation questions. You identify the correct more specific specialist when a
question clearly fits one, and otherwise answer at a general educational level."""
        )


def get_healthcare_specialists() -> Dict[str, HealthcareSpecialistAgent]:
    return {
        "disease_symptom_info": DiseaseSymptomInfoAgent(),
        "preventive_care_vaccination": PreventiveCareVaccinationAgent(),
        "clinical_guidelines": ClinicalGuidelinesAgent(),
        "drug_safety": DrugSafetyAgent(),
        "lab_diagnostics": LabDiagnosticsAgent(),
        "patient_rights": PatientRightsAgent(),
        "public_health_advisory": PublicHealthAdvisoryAgent(),
        "hospital_quality": HospitalQualityAgent(),
        "general_healthcare": GeneralHealthcareAgent(),
    }
