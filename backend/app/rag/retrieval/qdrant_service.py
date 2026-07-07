from uuid import NAMESPACE_URL, uuid5

from app.core.config import get_settings
from app.llm.service import llm_service
from app.models.domain import Domain
from app.rag.retrieval.factory import get_vector_store


class QdrantService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def collection_name(self, domain: Domain) -> str:
        return f"{self.settings.qdrant_collection_prefix}_{domain.value}"

    async def upsert_chunks(self, domain: Domain, document_id: str, chunks: list[str], metadata: dict) -> int:
        if not chunks:
            return 0

        vectors = await llm_service.embed_documents(chunks)
        collection_name = self.collection_name(domain)
        store = get_vector_store()
        points = [
            {
                "id": str(uuid5(NAMESPACE_URL, f"{domain.value}:{document_id}:{index}")),
                "vector": vector,
                "payload": {
                    "document_id": document_id,
                    "chunk_index": index,
                    "text": chunk,
                    "domain": domain.value,
                    **metadata,
                },
            }
            for index, (chunk, vector) in enumerate(zip(chunks, vectors))
        ]
        count = store.upsert_batch(collection_name, points)
        store.flush(collection_name)
        return count

    async def search(self, domain: Domain, query: str, limit: int = 5, filters: dict | None = None) -> list[dict]:
        collection_name = self.collection_name(domain)
        store = get_vector_store()
        query_vector = await llm_service.embed_query(query)
        hits = store.query(collection_name, query_vector, top_k=limit, filters=filters)
        if hits:
            return [
                {
                    "id": str(hit["id"]),
                    "score": float(hit["score"]),
                    "text": hit["payload"].get("text", ""),
                    "metadata": {key: value for key, value in hit["payload"].items() if key != "text"},
                }
                for hit in hits
            ]

        if self.settings.environment != "development":
            return []

        return [
            {
                "id": f"{domain.value}-sample-policy-clause",
                "score": 0.82,
                "text": "Sample retrieved clause: physician-directed diagnostic imaging may be covered when clinically justified and not excluded by policy terms.",
                "metadata": {"domain": domain.value, "source": "offline_seed", **(filters or {})},
            }
        ][:limit]

    async def search_chunks(self, domain: Domain, query: str, top_k: int = 5, filters: dict | None = None) -> list[dict]:
        return await self.search(domain, query, limit=top_k, filters=filters)

    def count(self, domain: Domain) -> int:
        return get_vector_store().count(self.collection_name(domain))


qdrant_service = QdrantService()

