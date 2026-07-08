from app.core.config import get_settings
from app.knowledge_graph.factory import get_graph_store
from app.knowledge_graph.graph_store import GraphStore
from app.models.domain import Domain
from app.services.cache import graph_cache_key, redis_cache


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
        result = await self.store.upsert_case_graph(case, evidence)
        domain = case.get("domain")
        domain_value = domain.value if hasattr(domain, "value") else domain
        institution = case.get("institution_name")
        if domain_value and institution:
            await redis_cache.delete(graph_cache_key(domain_value, institution))
        return result

    async def upsert_knowledge_document(self, domain: Domain, document_id: str, title: str, source_path: str, metadata: dict) -> dict:
        return await self.store.upsert_knowledge_document(domain, document_id, title, source_path, metadata)

    async def find_institution_patterns(self, domain: Domain, institution_name: str) -> list[dict]:
        key = graph_cache_key(domain.value, institution_name)
        cached = await redis_cache.get_json(key)
        if cached is not None:
            return cached
        result = await self.store.query_institution_pattern(domain, institution_name)
        await redis_cache.set_json(key, result, get_settings().cache_graph_ttl_seconds)
        return result

    async def find_similar_cases(self, domain: Domain, institution_name: str, limit: int = 5) -> list[dict]:
        return await self.store.find_similar_cases(domain, institution_name, limit)

    async def upsert_citizen_case(
        self, user_id: str, domain: Domain, case_id: str, institution_name: str | None, title: str,
    ) -> dict:
        return await self.store.upsert_citizen_case(user_id, domain, case_id, institution_name, title)

    async def get_citizen_profile(self, user_id: str) -> dict:
        return await self.store.get_citizen_profile(user_id)


knowledge_graph = Neo4jKnowledgeGraph()
