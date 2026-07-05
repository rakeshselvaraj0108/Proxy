from __future__ import annotations

from app.core.config import get_settings
from app.rag.retrieval.factory import get_vector_store, validate_vector_store_startup


def run_startup_checks() -> None:
    settings = get_settings()
    if settings.environment == "test":
        return
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY must be configured in environment or .env file.")
    validate_vector_store_startup()
    from app.knowledge_graph.factory import validate_graph_store_startup

    validate_graph_store_startup()
    if settings.environment == "production" and not settings.supabase_jwt_secret:
        raise RuntimeError("Production requires SUPABASE_JWT_SECRET for JWT verification")


async def collect_health_status() -> dict:
    settings = get_settings()
    vector = get_vector_store().health_check()
    from app.knowledge_graph.factory import get_graph_store

    graph = get_graph_store().health_check()
    redis_status = _redis_health(settings.redis_url)
    return {
        "vector_store": vector,
        "graph_store": graph,
        "supabase": {
            "status": "configured" if settings.supabase_url and settings.supabase_service_role_key else "not_configured",
            "url": settings.supabase_url or "",
        },
        "gemini": {
            "status": "disabled" if settings.disable_external_llm else ("configured" if settings.gemini_api_key else "missing_key"),
        },
        "redis": redis_status,
        "web_search": {
            "status": "configured" if settings.tavily_api_key else "not_configured",
        },
    }


def _redis_health(redis_url: str) -> dict:
    try:
        import redis

        client = redis.from_url(redis_url, socket_connect_timeout=2)
        client.ping()
        return {"status": "ready", "url": redis_url}
    except Exception as exc:
        return {"status": "unreachable", "url": redis_url, "error": str(exc)}
