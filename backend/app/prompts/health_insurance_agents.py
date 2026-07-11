from app.models.domain import Domain
from app.prompts.consumer_advocacy import SYSTEM_GUARDRAILS, DOMAIN_PROMPTS
from app.prompts.domain_profiles import get_profile


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
    profile = get_profile(domain)
    domain_label = domain.value.replace("_", " ")
    questions = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(profile.research_questions))
    task = f"""You are the Research Agent for a {domain_label} case involving a {profile.entity} and a {profile.counterparty}.
Answer ONLY from supplied retrieved knowledge and graph context.
Return JSON with exactly this schema:

{{
  "applicable_clauses": ["clause, term, or rule 1", "clause, term, or rule 2"],
  "possible_exclusions": ["exclusion or limitation 1 that the {profile.counterparty} may invoke"],
  "waiting_periods": ["any relevant timelines, waiting periods, or deadlines -- leave empty list if none apply"],
  "regulations": ["{profile.regulator} rule/circular/provision X"],
  "summary": "One paragraph research summary citing specific sources.",
  "confidence": 0.75
}}

Rules -- answer these questions specifically for this case:
{questions}
Cite sources explicitly. If uncertain, state what document is missing.
RETURN JSON ONLY. No markdown fences. Research Agent output."""
    if graph_context:
        context = f"{context}\n\nInstitutional graph memory:\n{graph_context}"
    return _base(domain, task, case_summary, context)


def evidence_prompt(domain: Domain, case_summary: str, context: str, evidence: str) -> str:
    profile = get_profile(domain)
    domain_label = domain.value.replace("_", " ")
    schema_lines = ",\n  ".join(f'"{key}": "{example}"' for key, example in profile.evidence_schema.items())
    task = f"""You are the Evidence Agent. Read the uploaded case evidence below and extract structured facts for this {domain_label} case.

FIRST, decide whether the uploaded evidence actually relates to the case summary below (same case, same institution/counterparty, same underlying issue -- not just the same broad domain). If the uploaded evidence is about a different, unrelated matter (wrong institution, wrong transaction/incident, or simply doesn't mention anything from the case summary), set "evidence_relevant" to false, leave every extracted field an empty string, and say so plainly in "summary" -- do NOT invent or guess values to fill the schema just because a document was uploaded.

Return JSON with exactly this schema:

{{
  "evidence_relevant": true,
  {schema_lines},
  "documents_missing": ["Document or fact still needed"],
  "key_dates": ["Event: date"],
  "summary": "Concise one-paragraph extraction summary, or a note that the uploaded evidence doesn't match the case if evidence_relevant is false."
}}

Be strictly factual. Do not invent values not present in the evidence. Leave fields empty string if not found there.
RETURN JSON ONLY. No markdown fences. Evidence Agent output."""
    return _base(domain, task, case_summary, context, evidence)


def strategy_prompt(domain: Domain, case_summary: str, context: str, evidence_summary: str, research_summary: str) -> str:
    profile = get_profile(domain)
    escalation_json = ", ".join(f'"{step}"' for step in profile.escalation_path)

    if not profile.is_dispute:
        task = f"""You are the Response Planning Agent for an informational query (not a dispute -- there is no counterparty to appeal to).
Return JSON with exactly this schema:

{{
  "can_appeal": "N/A",
  "success_probability": 1.0,
  "recommended_strategy": "Step-by-step plan for what the response should cover, in order.",
  "evidence_required": ["Any clarifying context that would help answer more precisely, if any"],
  "escalation_path": [{escalation_json}],
  "summary": "One-paragraph plan rationale."
}}

Inputs:
Research summary:
{research_summary}

Evidence summary:
{evidence_summary}

Decide:
1. What should the response prioritize covering?
2. Are there any red-flag/urgent symptoms or concerns that must be flagged prominently?
3. What tone is appropriate (educational, reassuring, or urging prompt care)?

RETURN JSON ONLY. No markdown fences. Response Planning Agent output."""
        return _base(domain, task, case_summary, context)

    task = f"""You are the Strategy Agent. Decide the dispute path for this {profile.entity} vs {profile.counterparty} case, based on research and evidence.
Return JSON with exactly this schema:

{{
  "can_appeal": "YES",
  "success_probability": 0.72,
  "recommended_strategy": "Step-by-step numbered plan for the appeal/dispute",
  "evidence_required": ["Document 1 needed", "Document 2 needed"],
  "escalation_path": [{escalation_json}],
  "summary": "One-paragraph strategy rationale."
}}

Inputs:
Research summary:
{research_summary}

Evidence summary:
{evidence_summary}

Decide:
1. Can this be disputed/appealed? YES or NO
2. Success probability (0.0 to 1.0) with reason
3. Recommended strategy (numbered steps)
4. Evidence still required before filing
5. Escalation path if the {profile.counterparty} does not respond, in order: {' -> '.join(profile.escalation_path)}

RETURN JSON ONLY. No markdown fences. Strategy Agent output."""
    return _base(domain, task, case_summary, context)


def negotiation_prompt(domain: Domain, case_summary: str, context: str, strategy: str, evidence_summary: str) -> str:
    profile = get_profile(domain)

    if not profile.is_dispute:
        task = f"""You are the Response Drafting Agent. Produce a clear, accurate, well-organized informational answer.
Generate the following in ONE JSON response:

{{
  "appeal_letter": "The full informational answer in plain language, organized with clear sections. This is NOT a legal letter -- it is a direct answer to the reader's question, written for a general audience.",
  "complaint_email": "",
  "escalation_note": "",
  "consumer_complaint": "",
  "summary": "Brief description of what was generated."
}}

Response plan to follow:
{strategy}

Context to rely on:
{evidence_summary}

Always include a clear disclaimer that this is educational information, not a diagnosis, and to consult a licensed physician for personal medical advice. If any red-flag/urgent symptoms were identified in the plan, state them prominently and recommend seeking care promptly.

RETURN JSON ONLY. No markdown fences. Response Drafting Agent output."""
        return _base(domain, task, case_summary, context)

    task = f"""You are the Negotiation Agent. Draft professional outputs for human approval for this {profile.entity} vs {profile.counterparty} dispute.
Generate ALL of the following in ONE JSON response:

{{
  "appeal_letter": "Full formal appeal/dispute letter to the {profile.counterparty}. Cite specific clauses, {profile.regulator} rules, and evidence. Be firm but professional. Include subject line, body, and closing.",
  "complaint_email": "Shorter email version for the {profile.counterparty}'s customer care / support desk. Include subject line and body.",
  "escalation_note": "Internal escalation memo if the first-level response fails. Reference this escalation path: {' -> '.join(profile.escalation_path)}.",
  "consumer_complaint": "Draft complaint for {profile.regulator}. Include {profile.entity} details placeholder, reference/account number placeholder, dispute details, and relief sought.",
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
    profile = get_profile(domain)
    task = f"""You are the Review Agent (devil's advocate). Audit the entire case before human approval.
Return JSON with exactly this schema:

{{
  "missing_evidence": ["List specific documents or facts still missing"],
  "hallucination_risks": ["Any claims made without evidence backing"],
  "wrong_clause_risks": ["Any clauses, rules, or regulations cited incorrectly or that may not apply"],
  "weak_arguments": ["Arguments the {profile.counterparty} could easily counter"],
  "approval_ready": false,
  "summary": "Overall audit verdict and what must be fixed before submission."
}}

Check:
- Missing evidence that weakens the case
- Hallucinated clauses, rules, or regulations not in the retrieved knowledge
- Wrong clause or regulation cited (verify against {profile.regulator} where applicable)
- Weak or unsupported arguments

Strategy reviewed:
{strategy}

Draft reviewed:
{appeal_draft[:6000]}

Evidence reviewed:
{evidence_summary[:4000]}

RETURN JSON ONLY. No markdown fences. Review Agent output."""
    return _base(domain, task, case_summary, context)


def final_report_prompt(domain: Domain, state: dict) -> str:
    profile = get_profile(domain)
    research_output = state.get("research_output", {})
    evidence_output = state.get("evidence_output", {})
    strategy_output = state.get("strategy_output", {})
    negotiation_output = state.get("negotiation_output", {})
    review_output = state.get("review_output", {})

    section_5 = "Response Drafted - Summary of the generated informational answer" if not profile.is_dispute else "Generated Documents - Summary of appeal letter, complaint, and escalation drafts"
    section_4 = "Response Plan - What the answer covers and its tone" if not profile.is_dispute else "Appeal Strategy - Recommended approach with probability"

    task = f"""Compile a comprehensive Final Case Report for the {profile.entity}.

Sections to include:
1. Executive Summary - One paragraph overview of the case and recommendation
2. Key Facts - Extracted from evidence
3. Applicable Rules & Regulations - From research
4. {section_4}
5. {section_5}
6. Review Flags - Issues found by the review agent
7. Next Steps - Actionable items for the {profile.entity}

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
