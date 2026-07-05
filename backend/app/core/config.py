import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel


def _load_dotenv() -> None:
    root = Path(__file__).resolve().parents[3]
    env_path = root / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key not in os.environ or os.environ.get(key, "").strip() == "":
            os.environ[key] = value


_load_dotenv()


def _optional_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return None
    return value


def _env(name: str, default: str) -> str:
    return os.getenv(name) or default


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _csv_env(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseModel):
    app_name: str = "PROXY API"
    environment: str = "development"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]
    vector_store_backend: str = "jsonl"
    graph_store_backend: str = "jsonl"
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None
    database_url: str | None = None
    storage_bucket_documents: str = "case-documents"
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str | None = None
    qdrant_collection_prefix: str = "proxy"
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str | None = None
    redis_url: str = "redis://localhost:6379/0"
    rate_limit_per_minute: int = 60
    max_upload_mb: int = 25
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_reasoning_model: str = "gemini-2.5-flash"
    gemini_router_model: str = "gemini-2.5-flash-lite"
    gemini_planner_model: str = "gemini-2.5-flash-lite"
    gemini_response_model: str = "gemini-2.5-flash"
    gemini_summarization_model: str = "gemini-2.5-flash-lite"
    gemini_ocr_model: str = "gemini-2.5-flash"
    response_agent_llm_enabled: bool = False
    disable_external_llm: bool = False
    embedding_model: str = "text-embedding-004"
    jwt_audience: str = "authenticated"
    jwt_issuer: str | None = None
    supabase_jwt_secret: str | None = None
    tavily_api_key: str | None = None
    web_search_cache_ttl_seconds: int = 86400
    web_search_rate_limit_per_minute: int = 10


@lru_cache
def get_settings() -> Settings:
    gemini_model = _env("GEMINI_MODEL", "gemini-2.5-flash")
    return Settings(
        environment=_env("ENVIRONMENT", "development"),
        cors_origins=_csv_env("CORS_ORIGINS", ["http://localhost:3000", "http://localhost:3001"]),
        vector_store_backend=_env("VECTOR_STORE_BACKEND", "jsonl"),
        graph_store_backend=_env("GRAPH_STORE_BACKEND", "jsonl"),
        supabase_url=_optional_env("SUPABASE_URL"),
        supabase_anon_key=_optional_env("SUPABASE_ANON_KEY"),
        supabase_service_role_key=_optional_env("SUPABASE_SERVICE_ROLE_KEY"),
        database_url=_optional_env("DATABASE_URL"),
        storage_bucket_documents=_env("STORAGE_BUCKET_DOCUMENTS", "case-documents"),
        qdrant_url=_env("QDRANT_URL", "http://localhost:6333"),
        qdrant_api_key=_optional_env("QDRANT_API_KEY"),
        qdrant_collection_prefix=_env("QDRANT_COLLECTION_PREFIX", "proxy"),
        neo4j_uri=_env("NEO4J_URI", "bolt://localhost:7687"),
        neo4j_user=_env("NEO4J_USER", "neo4j"),
        neo4j_password=_optional_env("NEO4J_PASSWORD"),
        redis_url=_env("REDIS_URL", "redis://localhost:6379/0"),
        rate_limit_per_minute=int(_env("RATE_LIMIT_PER_MINUTE", "60")),
        max_upload_mb=int(_env("MAX_UPLOAD_MB", "25")),
        gemini_api_key=_optional_env("GEMINI_API_KEY"),
        gemini_model=gemini_model,
        gemini_reasoning_model=_env("GEMINI_REASONING_MODEL", gemini_model),
        gemini_router_model=_env("GEMINI_ROUTER_MODEL", "gemini-2.5-flash-lite"),
        gemini_planner_model=_env("GEMINI_PLANNER_MODEL", "gemini-2.5-flash-lite"),
        gemini_response_model=_env("GEMINI_RESPONSE_MODEL", gemini_model),
        gemini_summarization_model=_env("GEMINI_SUMMARIZATION_MODEL", "gemini-2.5-flash-lite"),
        gemini_ocr_model=_env("GEMINI_OCR_MODEL", gemini_model),
        response_agent_llm_enabled=_bool_env("RESPONSE_AGENT_LLM_ENABLED", False),
        disable_external_llm=_bool_env("DISABLE_EXTERNAL_LLM", False),
        embedding_model=_env("EMBEDDING_MODEL", "text-embedding-004"),
        jwt_audience=_env("JWT_AUDIENCE", "authenticated"),
        jwt_issuer=_optional_env("JWT_ISSUER"),
        supabase_jwt_secret=_optional_env("SUPABASE_JWT_SECRET"),
        tavily_api_key=_optional_env("TAVILY_API_KEY"),
        web_search_cache_ttl_seconds=int(_env("WEB_SEARCH_CACHE_TTL_SECONDS", "86400")),
        web_search_rate_limit_per_minute=int(_env("WEB_SEARCH_RATE_LIMIT_PER_MINUTE", "10")),
    )
