from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.models.domain import Domain


class GraphStore(ABC):
    @abstractmethod
    async def add_event(self, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def upsert_case_graph(self, case: dict, evidence: dict | None = None) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def upsert_knowledge_document(
        self,
        domain: Domain,
        document_id: str,
        title: str,
        source_path: str,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def query_institution_pattern(self, domain: Domain, institution_name: str) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    async def find_similar_cases(self, domain: Domain, institution_name: str, limit: int = 5) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def health_check(self) -> dict[str, Any]:
        raise NotImplementedError
