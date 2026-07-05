import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.knowledge_graph.jsonl_graph_store import JsonlGraphStore
from app.knowledge_graph.neo4j_graph_store import Neo4jGraphStore
from app.models.domain import Domain


async def migrate() -> dict:
    jsonl = JsonlGraphStore()
    neo4j = Neo4jGraphStore()
    events = jsonl.iter_events()
    replayed = 0
    for event in events:
        await neo4j.add_event(event["event_type"], event["payload"])
        replayed += 1
    health = neo4j.health_check()
    return {"events_read": len(events), "events_replayed": replayed, "neo4j": health}


def main() -> None:
    import asyncio

    result = asyncio.run(migrate())
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
