from app.models.domain import Domain
from app.prompts.consumer_advocacy import SYSTEM_GUARDRAILS, DOMAIN_PROMPTS


def _base(domain: Domain, task: str, case_summary: str, context: str = "", evidence: str = "") -> str:
    domain_prompt = DOMAIN_PROMPTS.get(domain, "")
    parts = [
        SYSTEM_GUARDRAILS,
        f"Domain instructions:\n{domain_prompt}",
        f"Task:\n{task}",
        f"Case summary:\n{case_summary}",
    ]
    if context:
        parts.append(f"Retrieved knowledge:\n{context[:12000]}")
    if evidence:
        parts.append(f"Uploaded case evidence:\n{evidence[:16000]}")
    return "\n\n".join(parts)


def research_prompt(domain: Domain, case_summary: str, context: str, graph_context: str = "") -> str:
    task = """You are the Research Agent for a health insurance claim dispute.
Answer ONLY from supplied retrieved knowledge and graph context.
Return JSON with exactly this schema:

{
  "applicable_clauses": ["clause 1", "clause 2"],
  "possible_exclusions": ["exclusion 1"],
  "waiting_periods": ["24 months for pre-existing conditions"],
  "regulations": ["IRDAI circular X", "IRDAI Health Insurance Regulations 2024"],
  "summary": "One paragraph research summary citing specific sources.",
  "confidence": 0.75
}

Rules:
1. Which policy clauses apply to this claim?
2. Which exclusions may the insurer invoke?
3. Which waiting periods apply?
4. Which IRDAI regulations / policyholder rights apply?
Cite sources explicitly. If uncertain, state what document is missing.
RETURN JSON ONLY. No markdown fences. Research Agent output."""
    if graph_context:
        context = f"{context}\n\nInstitutional graph memory:\n{graph_context}"
    return _base(domain, task, case_summary, context)


def evidence_prompt(domain: Domain, case_summary: str, context: str, evidence: str) -> str:
    task = """You are the Evidence Agent. Read uploaded case documents and extract structured facts.
Return JSON with exactly this schema:

{
  "diagnosis": "e.g. Lumbar disc herniation L4-L5",
  "treatment": "e.g. Microdiscectomy surgery",
  "hospital": "e.g. Apollo Hospitals, Chennai",
  "coverage_requested": "e.g. Rs 3,50,000 surgery + Rs 45,000 room charges",
  "admission_date": "e.g. 2026-01-15",
  "discharge_date": "e.g. 2026-01-18",
  "bill_amount": "e.g. Rs 4,12,000",
  "reason_for_rejection": "e.g. Pre-existing condition exclusion under clause 4.3",
  "documents_missing": ["Physician support letter", "Pre-authorization form"],
  "key_dates": ["Claim filed: 2026-02-01", "Rejection received: 2026-02-15"],
  "summary": "Concise one-paragraph extraction summary."
}

Be factual. Do not invent values not present in evidence. Leave fields empty string if not found.
RETURN JSON ONLY. No markdown fences. Evidence Agent output."""
    return _base(domain, task, case_summary, context, evidence)


def strategy_prompt(domain: Domain, case_summary: str, context: str, evidence_summary: str, research_summary: str) -> str:
    task = f"""You are the Strategy Agent. Decide the dispute path based on research and evidence.
Return JSON with exactly this schema:

{{
  "can_appeal": "YES",
  "success_probability": 0.72,
  "recommended_strategy": "Step-by-step numbered plan for the appeal",
  "evidence_required": ["Document 1 needed", "Document 2 needed"],
  "escalation_path": ["Internal appeal to insurer GRO", "IRDAI IGMS portal", "Insurance Ombudsman"],
  "summary": "One-paragraph strategy rationale."
}}

Inputs:
Research summary:
{research_summary}

Evidence summary:
{evidence_summary}

Decide:
1. Can the claim be appealed? YES or NO
2. Success probability (0.0 to 1.0) with reason
3. Recommended strategy (numbered steps)
4. Evidence still required before filing appeal
5. Escalation path if insurer does not respond

RETURN JSON ONLY. No markdown fences. Strategy Agent output."""
    return _base(domain, task, case_summary, context)


def negotiation_prompt(domain: Domain, case_summary: str, context: str, strategy: str, evidence_summary: str) -> str:
    task = f"""You are the Negotiation Agent. Draft professional outputs for human approval.
Generate ALL of the following in ONE JSON response:

{{
  "appeal_letter": "Full formal appeal letter to the insurer. Address to the Grievance Redressal Officer. Cite specific policy clauses, IRDAI regulations, and evidence. Be firm but professional. Include subject line, body, and closing.",
  "complaint_email": "Shorter email version for the insurer's customer care. Include subject line and body.",
  "escalation_note": "Internal escalation memo if internal appeal fails. Reference GRO timeline, ombudsman path, and IRDAI IGMS portal.",
  "consumer_complaint": "Draft complaint for the IRDAI IGMS portal or Insurance Ombudsman. Include policyholder details placeholder, policy number placeholder, claim details, rejection details, and relief sought.",
  "summary": "Brief description of what was generated."
}}

Strategy to follow:
{strategy}

Evidence to rely on:
{evidence_summary}

RETURN JSON ONLY. No markdown fences. Negotiation Agent output."""
    return _base(domain, task, case_summary, context)


def review_prompt(
    domain: Domain,
    case_summary: str,
    context: str,
    evidence_summary: str,
    strategy: str,
    appeal_draft: str,
) -> str:
    task = f"""You are the Review Agent (devil's advocate). Audit the entire case before human approval.
Return JSON with exactly this schema:

{{
  "missing_evidence": ["List specific documents or facts still missing"],
  "hallucination_risks": ["Any claims made without evidence backing"],
  "wrong_clause_risks": ["Any policy clauses cited incorrectly or that may not apply"],
  "weak_arguments": ["Arguments that an insurer could easily counter"],
  "approval_ready": false,
  "summary": "Overall audit verdict and what must be fixed before submission."
}}

Check:
- Missing evidence that weakens the appeal
- Hallucinated clauses or regulations not in the retrieved knowledge
- Wrong policy clause cited
- Wrong IRDAI regulation cited
- Weak or unsupported arguments

Strategy reviewed:
{strategy}

Appeal draft reviewed:
{appeal_draft[:6000]}

Evidence reviewed:
{evidence_summary[:4000]}

RETURN JSON ONLY. No markdown fences. Review Agent output."""
    return _base(domain, task, case_summary, context)


def final_report_prompt(domain: Domain, state: dict) -> str:
    research_output = state.get("research_output", {})
    evidence_output = state.get("evidence_output", {})
    strategy_output = state.get("strategy_output", {})
    negotiation_output = state.get("negotiation_output", {})
    review_output = state.get("review_output", {})

    task = f"""Compile a comprehensive Final Case Report for the policyholder.

Sections to include:
1. Executive Summary - One paragraph overview of the case and recommendation
2. Key Facts - Extracted from evidence (diagnosis, treatment, hospital, dates, amounts)
3. Applicable Clauses & Regulations - From research
4. Appeal Strategy - Recommended approach with probability
5. Generated Documents - Summary of appeal letter, complaint, and escalation drafts
6. Review Flags - Issues found by the review agent
7. Next Steps - Actionable items for the policyholder

Research findings: {research_output.get('summary', state.get('research_summary', 'Not available'))}
Evidence findings: {evidence_output.get('summary', state.get('evidence_summary', 'Not available'))}
Strategy: {strategy_output.get('summary', state.get('strategy', 'Not available'))}
Documents generated: {negotiation_output.get('summary', 'Not available')}
Review flags: {review_output.get('summary', 'Not available')}
Review approval status: {'READY' if review_output.get('approval_ready') else 'NEEDS ATTENTION'}

Keep it actionable and cite only what prior agents established.
Return the final case report as a plain text document. Do NOT return JSON for this one — return formatted text with clear section headings."""
    return _base(
        domain,
        task,
        state.get("case_summary", ""),
        state.get("retrieved_context", ""),
        state.get("evidence_summary", ""),
    )
