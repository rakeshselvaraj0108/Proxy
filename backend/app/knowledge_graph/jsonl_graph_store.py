from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.knowledge_graph.graph_store import GraphStore
from app.models.domain import Domain


class JsonlGraphStore(GraphStore):
    def __init__(self) -> None:
        self.fallback_path = Path("datasets") / "knowledge_graph" / "neo4j_fallback.jsonl"
        self.fallback_path.parent.mkdir(parents=True, exist_ok=True)

    def _append(self, event_type: str, payload: dict[str, Any]) -> None:
        record = {"event_type": event_type, "payload": payload}
        with self.fallback_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=True) + "\n")

    def _read_events(self, event_type: str | None = None) -> list[dict[str, Any]]:
        if not self.fallback_path.exists():
            return []
        events: list[dict[str, Any]] = []
        for line in self.fallback_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event_type is None or record.get("event_type") == event_type:
                events.append(record)
        return events

    async def add_event(self, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._append(event_type, payload)
        return {"event_type": event_type, "mode": "jsonl"}

    async def upsert_case_graph(self, case: dict, evidence: dict | None = None) -> dict[str, Any]:
        payload = {"case": self._jsonable(case), "evidence": self._jsonable(evidence or {})}
        self._append("case_graph", payload)
        return {"case_id": case["id"], "mode": "jsonl"}

    async def upsert_knowledge_document(
        self,
        domain: Domain,
        document_id: str,
        title: str,
        source_path: str,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        payload = {
            "domain": domain.value,
            "document_id": document_id,
            "title": title,
            "source_path": source_path,
            "metadata": self._jsonable(metadata),
        }
        self._append("knowledge_document", payload)
        return {"document_id": document_id, "mode": "jsonl"}

    async def query_institution_pattern(self, domain: Domain, institution_name: str) -> list[dict[str, Any]]:
        fallback_cases = 0
        for event in self._read_events("case_graph"):
            case = event.get("payload", {}).get("case", {})
            case_domain = case.get("domain")
            domain_value = case_domain.value if hasattr(case_domain, "value") else case_domain
            if case.get("institution_name") == institution_name and domain_value == domain.value:
                fallback_cases += 1
        if fallback_cases:
            return [
                {
                    "pattern": f"{fallback_cases} prior cases logged against {institution_name} in local graph memory.",
                    "domain": domain.value,
                    "institution": institution_name,
                    "confidence": 0.7,
                }
            ]
        doc_count = sum(
            1
            for event in self._read_events("knowledge_document")
            if institution_name.lower()
            in str(event.get("payload", {}).get("metadata", {}).get("insurer_name", "")).lower()
        )
        if doc_count:
            return [
                {
                    "pattern": f"{doc_count} indexed policy/claim documents available for {institution_name}.",
                    "domain": domain.value,
                    "institution": institution_name,
                    "confidence": 0.74,
                }
            ]
        return [
            {
                "pattern": "Repeated medical necessity denials require physician support letter and internal clinical review request.",
                "domain": domain.value,
                "institution": institution_name,
                "confidence": 0.74,
            }
        ]

    async def find_similar_cases(self, domain: Domain, institution_name: str, limit: int = 5) -> list[dict[str, Any]]:
        cases: list[dict[str, Any]] = []
        for event in self._read_events("case_graph"):
            case = event.get("payload", {}).get("case", {})
            case_domain = case.get("domain")
            domain_value = case_domain.value if hasattr(case_domain, "value") else case_domain
            if case.get("institution_name") == institution_name and domain_value == domain.value:
                cases.append({"case_id": case.get("id"), "title": case.get("title"), "summary": case.get("summary")})
        return cases[:limit]

    def health_check(self) -> dict[str, Any]:
        events = len(self._read_events())
        return {"status": "ready", "backend": "jsonl", "events": events, "path": str(self.fallback_path)}

    def iter_events(self) -> list[dict[str, Any]]:
        return self._read_events()

    def _jsonable(self, value: Any) -> Any:
        if isinstance(value, Domain):
            return value.value
        if isinstance(value, dict):
            return {key: self._jsonable(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self._jsonable(item) for item in value]
        return value
