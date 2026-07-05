from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from app.rag.retrieval.vector_store import VectorStore


class JsonlVectorStore(VectorStore):
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or Path("datasets") / "vector_embeddings"
        self.root.mkdir(parents=True, exist_ok=True)
        self._cache: dict[str, dict[str, dict]] = {}
        self._dirty: set[str] = set()

    def _path(self, collection: str) -> Path:
        safe_name = "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in collection)
        return self.root / f"{safe_name}.jsonl"

    def _load(self, collection: str) -> dict[str, dict]:
        if collection not in self._cache:
            self._cache[collection] = {record["id"]: record for record in self._read(self._path(collection))}
        return self._cache[collection]

    def upsert(self, collection: str, point_id: str, vector: list[float], payload: dict[str, Any]) -> None:
        self.upsert_batch(collection, [{"id": point_id, "vector": vector, "payload": payload}])

    def upsert_batch(self, collection: str, points: list[dict[str, Any]]) -> int:
        if not points:
            return 0
        cache = self._load(collection)
        for point in points:
            cache[point["id"]] = point
        self._dirty.add(collection)
        return len(points)

    def flush(self, collection: str | None = None) -> None:
        targets = [collection] if collection else list(self._dirty)
        for name in targets:
            if name not in self._cache:
                continue
            with self._path(name).open("w", encoding="utf-8") as handle:
                for record in self._cache[name].values():
                    handle.write(json.dumps(record, ensure_ascii=True) + "\n")
            self._dirty.discard(name)

    def query(
        self,
        collection: str,
        vector: list[float],
        top_k: int = 5,
        filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        self.flush(collection)
        scored: list[dict[str, Any]] = []
        for record in self._load(collection).values():
            payload = record.get("payload", {})
            if filters and any(payload.get(key) != value for key, value in filters.items()):
                continue
            score = self._cosine(vector, record.get("vector", []))
            scored.append({"id": record["id"], "score": score, "payload": payload})
        return sorted(scored, key=lambda item: item["score"], reverse=True)[:top_k]

    def delete(self, collection: str, point_id: str) -> None:
        cache = self._load(collection)
        if point_id in cache:
            del cache[point_id]
            self._dirty.add(collection)

    def collection_exists(self, collection: str) -> bool:
        return self._path(collection).exists() or collection in self._cache

    def count(self, collection: str) -> int:
        return len(self._load(collection))

    def health_check(self) -> dict[str, Any]:
        collections = list(self.root.glob("*.jsonl"))
        total = sum(self.count(path.stem) for path in collections) if collections else 0
        return {"status": "ready", "backend": "jsonl", "root": str(self.root), "collections": len(collections), "total_points": total}

    def iter_collection_files(self) -> list[Path]:
        return sorted(self.root.glob("*.jsonl"))

    def read_collection_file(self, path: Path) -> tuple[str, list[dict[str, Any]]]:
        collection = path.stem
        return collection, self._read(path)

    def _read(self, path: Path) -> list[dict[str, Any]]:
        if not path.exists():
            return []
        records: list[dict[str, Any]] = []
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return records

    def _cosine(self, left: list[float], right: list[float]) -> float:
        if not left or not right or len(left) != len(right):
            return 0.0
        dot = sum(a * b for a, b in zip(left, right))
        left_norm = math.sqrt(sum(value * value for value in left))
        right_norm = math.sqrt(sum(value * value for value in right))
        if not left_norm or not right_norm:
            return 0.0
        return dot / (left_norm * right_norm)
