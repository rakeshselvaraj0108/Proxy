# Health Insurance Knowledge Seed

This folder is the first active PROXY domain. Add policies, denial letters, appeal templates, regulations, sample cases, medical necessity references, and insurer-specific patterns here.

Suggested structure:

- `policies/`: policy clauses and coverage examples
- `regulations/`: jurisdiction-specific insurance appeal rules
- `appeal_templates/`: reusable appeal structures
- `sample_cases/`: anonymized examples and outcomes
- `insurance_companies/`: institution-specific response patterns

Run ingestion:

```bash
python scripts/ingest_knowledge.py --domain health_insurance
```
