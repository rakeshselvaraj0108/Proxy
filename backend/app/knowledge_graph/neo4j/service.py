from app.knowledge_graph.factory import get_graph_store
from app.knowledge_graph.graph_store import GraphStore
from app.models.domain import Domain


class Neo4jKnowledgeGraph:
    """Facade over the configured GraphStore backend."""

    def __init__(self) -> None:
        self._store: GraphStore | None = None

    @property
    def store(self) -> GraphStore:
        if self._store is None:
            self._store = get_graph_store()
        return self._store

    async def upsert_case_graph(self, case: dict, evidence: dict | None = None) -> dict:
        return await self.store.upsert_case_graph(case, evidence)

    async def upsert_knowledge_document(self, domain: Domain, document_id: str, title: str, source_path: str, metadata: dict) -> dict:
        return await self.store.upsert_knowledge_document(domain, document_id, title, source_path, metadata)

    async def find_institution_patterns(self, domain: Domain, institution_name: str) -> list[dict]:
        return await self.store.query_institution_pattern(domain, institution_name)

    async def find_similar_cases(self, domain: Domain, institution_name: str, limit: int = 5) -> list[dict]:
        return await self.store.find_similar_cases(domain, institution_name, limit)


knowledge_graph = Neo4jKnowledgeGraph()
