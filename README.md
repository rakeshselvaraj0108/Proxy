---
title: PROXY
emoji: ⚖️
colorFrom: blue
colorTo: cyan
sdk: docker
app_port: 7860
pinned: false
---

# PROXY — Multi-Agent Consumer Advocacy Platform

PROXY is a multi-agent AI system that helps people fight unfair claim
rejections and disputes across 8 domains (health insurance, banking,
telecom, airlines, e-commerce, government, housing, healthcare). A
LangGraph-backed pipeline of specialist agents (Research, Evidence,
Strategy, Negotiation, Review) reasons over real retrieved regulations and
your uploaded evidence to produce a complete, cited resolution plan and
draft escalation documents.

## Running this Space

This Space runs a single Docker container (see `Dockerfile` at the repo
root) that serves the Next.js frontend on the exposed port and the FastAPI
backend internally, proxying `/api/v1/*` between them. Vector search and the
knowledge graph run against a local JSONL-backed store (no external Qdrant/
Neo4j/Redis needed) with real, pre-indexed regulatory data checked into this
repo via git-lfs (`backend/datasets/`).

### Required secret

Set `NVIDIA_API_KEY` in this Space's **Settings → Repository secrets** --
the app calls the NVIDIA NIM API (chat + embeddings) and will not function
without it.

## Local development

See `docker-compose.yml` for the full multi-service setup (real Qdrant,
Neo4j, Redis) used during development, or run the backend
(`backend/`, FastAPI) and frontend (`frontend/`, Next.js) directly -- each
has its own README/scripts under its respective directory.
