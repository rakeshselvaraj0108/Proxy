from __future__ import annotations

from enum import Enum


class DocumentType(str, Enum):
    POLICY = "policy"
    MEDICAL_REPORT = "medical_report"
    REJECTION_LETTER = "rejection_letter"
    BILL = "bill"
    OTHER = "other"


POLICY_KEYWORDS = ("policy", "wording", "prospectus", "terms", "coverage", "brochure")
MEDICAL_KEYWORDS = ("medical", "discharge", "diagnosis", "prescription", "doctor", "hospital record", "lab", "mri", "ct")
REJECTION_KEYWORDS = ("rejection", "denial", "denied", "repudiation", "claim rejection", "declined")
BILL_KEYWORDS = ("bill", "invoice", "receipt", "hospital bill", "pharmacy", "payment", "charges")


def classify_document(filename: str, mime_type: str | None = None) -> DocumentType:
    lower = filename.lower()
    if any(k in lower for k in REJECTION_KEYWORDS):
        return DocumentType.REJECTION_LETTER
    if any(k in lower for k in MEDICAL_KEYWORDS):
        return DocumentType.MEDICAL_REPORT
    if any(k in lower for k in BILL_KEYWORDS):
        return DocumentType.BILL
    if any(k in lower for k in POLICY_KEYWORDS):
        return DocumentType.POLICY
    if lower.endswith(".pdf"):
        return DocumentType.OTHER
    return DocumentType.OTHER


def build_case_summary(case: dict, documents: list[dict]) -> str:
    sections = [
        f"Case: {case.get('title', '')}",
        f"Insurer: {case.get('institution_name', '')}",
        f"Summary: {case.get('summary', '')}",
        f"Jurisdiction: {case.get('jurisdiction', 'IN')}",
    ]
    by_type: dict[str, list[str]] = {}
    for doc in documents:
        doc_type = doc.get("document_type") or DocumentType.OTHER.value
        by_type.setdefault(doc_type, []).append(doc.get("filename", "document"))
    if by_type:
        sections.append("Uploaded documents:")
        for doc_type, names in by_type.items():
            sections.append(f"  - {doc_type}: {', '.join(names)}")
    return "\n".join(sections)


def build_evidence_bundle(documents: list[dict]) -> str:
    if not documents:
        return "No uploaded evidence documents."
    parts: list[str] = []
    for doc in documents:
        doc_type = doc.get("document_type", DocumentType.OTHER.value)
        text = (doc.get("text_extract") or "").strip()
        if not text:
            continue
        parts.append(f"=== {doc_type.upper()}: {doc.get('filename', 'document')} ===\n{text[:8000]}")
    return "\n\n".join(parts) if parts else "Uploaded documents contain no extractable text yet."
