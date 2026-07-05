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
Answer ONLY from supplied retrieved knowledge and graph context:
1. Which policy clauses apply?
2. Which exclusions may apply?
3. Which waiting periods apply?
4. Which IRDAI regulations / policyholder rights apply?
Cite sources explicitly. If uncertain, state what document is missing."""
    if graph_context:
        context = f"{context}\n\nInstitutional graph memory:\n{graph_context}"
    return _base(domain, task, case_summary, context)


def evidence_prompt(domain: Domain, case_summary: str, context: str, evidence: str) -> str:
    task = """You are the Evidence Agent. Read uploaded case documents and extract structured facts:
- Diagnosis
- Treatment / procedure
- Hospital name
- Coverage items claimed
- Key dates (admission, discharge, claim, denial)
- Documents still missing
- Insurer's stated reason for rejection
Be factual. Do not invent values not present in evidence."""
    return _base(domain, task, case_summary, context, evidence)


def strategy_prompt(domain: Domain, case_summary: str, context: str, evidence_summary: str, research_summary: str) -> str:
    task = f"""You are the Strategy Agent. Decide the dispute path.
Output clearly:
1. Can the claim be appealed? YES or NO
2. Appeal probability (Low / Medium / High) with one-line reason
3. Recommended strategy (numbered steps)
4. Evidence still required before filing appeal

Research summary:
{research_summary}

Evidence summary:
{evidence_summary}"""
    return _base(domain, task, case_summary, context)


def negotiation_prompt(domain: Domain, case_summary: str, context: str, strategy: str, evidence_summary: str) -> str:
    task = f"""You are the Negotiation Agent. Draft professional outputs for human approval:
1. Appeal letter to insurer (formal, citing policy clauses and evidence)
2. Short complaint email version
3. Escalation note (internal grievance / ombudsman path if applicable)

Strategy to follow:
{strategy}

Evidence to rely on:
{evidence_summary}"""
    return _base(domain, task, case_summary, context)


def review_prompt(
    domain: Domain,
    case_summary: str,
    context: str,
    evidence_summary: str,
    strategy: str,
    appeal_draft: str,
) -> str:
    task = f"""You are the Review Agent (devil's advocate). Audit the case before human approval.
Check for:
- Missing evidence
- Hallucinated clauses or regulations
- Wrong policy clause cited
- Weak or unsupported arguments
Return bullet points only.

Strategy reviewed:
{strategy}

Appeal draft reviewed:
{appeal_draft[:6000]}

Evidence reviewed:
{evidence_summary[:4000]}"""
    return _base(domain, task, case_summary, context)


def final_report_prompt(domain: Domain, state: dict) -> str:
    task = """Compile a concise Final Report for the policyholder.
Sections: Executive Summary, Key Facts, Applicable Clauses, Strategy, Appeal Draft Summary, Review Flags, Next Steps.
Keep it actionable and cite only what prior agents established."""
    return _base(
        domain,
        task,
        state.get("case_summary", ""),
        state.get("retrieved_context", ""),
        state.get("evidence_summary", ""),
    )
