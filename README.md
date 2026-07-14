# PROXY — Multi-Agent Consumer Advocacy Platform

PROXY is a multi-agent AI system that helps people fight unfair claim
rejections and disputes across 8 domains (health insurance, banking,
telecom, airlines, e-commerce, government, housing, healthcare). A
LangGraph-backed pipeline of specialist agents (Research, Evidence,
Strategy, Negotiation, Review) reasons over real retrieved regulations and
your uploaded evidence to produce a complete, cited resolution plan and
draft escalation documents. Responses are multilingual: the pipeline
detects the language of whatever you type and replies in that same
language.

## Deployment

Deployed on Render as two separate services:

- `backend/Dockerfile` — FastAPI, running against real managed Qdrant
  (vector search), Neo4j Aura (knowledge graph), and Upstash Redis
  (caching).
- `frontend/Dockerfile` — Next.js standalone build, proxying `/api/v1/*`
  to the backend service's public URL.

See `docker-compose.yml` for the equivalent local multi-service setup.

### Required environment variables (backend)

- `NVIDIA_API_KEY` — the app calls the NVIDIA NIM API (chat + embeddings)
  and will not function without it.
- `QDRANT_URL` / `QDRANT_API_KEY` — vector store.
- `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` — knowledge graph.
- `REDIS_URL` — optional; caching degrades safely to a no-op if unset or
  unreachable.

## Local development

Run the backend (`backend/`, FastAPI) and frontend (`frontend/`, Next.js)
directly -- each has its own README/scripts under its respective directory.
Both default to a local JSONL-backed fallback for the vector store and
knowledge graph when `VECTOR_STORE_BACKEND`/`GRAPH_STORE_BACKEND` aren't
set to `qdrant`/`neo4j`, so no external services are required to develop
against real (if smaller-scale) pre-indexed regulatory data checked into
this repo via git-lfs (`backend/datasets/`).
