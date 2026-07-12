"""
One-off migration: move already-embedded chunks from the local JSONL
fallback vector store into a real Qdrant instance, WITHOUT re-calling the
NVIDIA embedding API -- the vectors are already computed and sitting in the
JSONL files, this just re-homes them.

Usage:
    Set QDRANT_URL and QDRANT_API_KEY in the environment (or .env) first --
    this always writes to whatever VECTOR_STORE_BACKEND=qdrant resolves to,
    regardless of the CURRENT backend setting, so it's safe to run before
    flipping VECTOR_STORE_BACKEND over in production.

    python scripts/migrate_jsonl_to_qdrant.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.domain import ACTIVE_DOMAINS
from app.rag.retrieval.jsonl_vector_store import JsonlVectorStore
from app.rag.retrieval.qdrant_vector_store import QdrantVectorStore
from app.rag.retrieval.qdrant_service import qdrant_service

BATCH_SIZE = 200


def main():
    jsonl_store = JsonlVectorStore()
    qdrant_store = QdrantVectorStore()

    grand_total = 0
    for domain in ACTIVE_DOMAINS:
        collection_name = qdrant_service.collection_name(domain)
        records = list(jsonl_store._load(collection_name).values())
        if not records:
            print(f"[{domain.value}] nothing to migrate (0 records in {collection_name})")
            continue

        print(f"[{domain.value}] migrating {len(records)} chunks from {collection_name}...")
        migrated = 0
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i : i + BATCH_SIZE]
            qdrant_store.upsert_batch(collection_name, batch)
            migrated += len(batch)
            print(f"  {migrated}/{len(records)}")

        grand_total += migrated
        print(f"[{domain.value}] done -- {migrated} chunks now in real Qdrant.\n")

    print(f"Migration complete. Total chunks migrated: {grand_total}")
    print("Verify with: qdrant_service.count(<domain>) after setting VECTOR_STORE_BACKEND=qdrant.")


if __name__ == "__main__":
    main()
