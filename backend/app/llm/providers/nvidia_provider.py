from __future__ import annotations

from typing import AsyncIterator

import httpx

from app.core.config import Settings
from app.llm.base import LLMProvider, LLMPurpose
from app.llm.observability import RateLimiter, build_retrying, log_llm_call


class NvidiaProvider(LLMProvider):
    """NVIDIA NIM provider using the OpenAI-compatible /chat/completions and
    /embeddings endpoints at integrate.api.nvidia.com (or a self-hosted NIM)."""

    name = "nvidia"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._rate_limiter = RateLimiter(settings.nvidia_rate_limit_per_minute)

    def _configured(self) -> bool:
        return bool(self.settings.nvidia_api_key) and not self.settings.disable_external_llm

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.nvidia_api_key}",
            "Content-Type": "application/json",
        }

    def embedding_mode(self) -> str:
        if self._configured():
            return "nvidia"
        if self.settings.environment == "test" or self.settings.disable_external_llm:
            return "hash_fallback"
        return "nvidia"

    def model_for(self, purpose: LLMPurpose | None = None, model_name: str | None = None) -> str:
        if model_name:
            return model_name
        if purpose == "router":
            return self.settings.nvidia_router_model
        if purpose == "planner":
            return self.settings.nvidia_planner_model
        if purpose == "response":
            return self.settings.nvidia_response_model
        if purpose == "summarization":
            return self.settings.nvidia_summarization_model
        if purpose == "ocr":
            return self.settings.nvidia_ocr_model
        return self.settings.nvidia_reasoning_model

    async def generate(
        self,
        prompt: str,
        temperature: float = 0.2,
        purpose: LLMPurpose = "reasoning",
        model_name: str | None = None,
    ) -> str:
        selected_model = self.model_for(purpose, model_name)
        async with log_llm_call(self.name, "generate", purpose, selected_model) as record:
            if not self._configured():
                if self.settings.environment == "test" or self.settings.disable_external_llm:
                    return self._offline_response(prompt)
                raise RuntimeError("NVIDIA API is not configured. Please set NVIDIA_API_KEY in your environment/dotenv file.")

            payload = {
                "model": selected_model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
            }

            async def _call() -> httpx.Response:
                await self._rate_limiter.acquire()
                async with httpx.AsyncClient(timeout=self.settings.nvidia_request_timeout_seconds) as client:
                    resp = await client.post(
                        f"{self.settings.nvidia_base_url}/chat/completions",
                        headers=self._headers(),
                        json=payload,
                    )
                    resp.raise_for_status()
                    return resp

            try:
                retryer = build_retrying(self.settings.nvidia_max_retries)
                async for attempt in retryer:
                    with attempt:
                        record["retries"] = attempt.retry_state.attempt_number - 1
                        response = await _call()
            except Exception as exc:
                if self.settings.environment == "test" or self.settings.disable_external_llm:
                    return self._offline_response(prompt)
                raise RuntimeError(f"NVIDIA chat completion API call failed: {exc}") from exc

            data = response.json()
            usage = data.get("usage") or {}
            record["prompt_tokens"] = usage.get("prompt_tokens")
            record["completion_tokens"] = usage.get("completion_tokens")
            record["total_tokens"] = usage.get("total_tokens")
            choices = data.get("choices") or []
            if choices and choices[0].get("message", {}).get("content"):
                return choices[0]["message"]["content"]
            raise RuntimeError(f"NVIDIA chat completion returned no content: {data}")

    async def generate_stream(
        self,
        prompt: str,
        temperature: float = 0.2,
        purpose: LLMPurpose = "reasoning",
        model_name: str | None = None,
    ) -> AsyncIterator[str]:
        selected_model = self.model_for(purpose, model_name)
        if not self._configured():
            if self.settings.environment == "test" or self.settings.disable_external_llm:
                yield self._offline_response(prompt)
                return
            raise RuntimeError("NVIDIA API is not configured. Please set NVIDIA_API_KEY in your environment/dotenv file.")

        payload = {
            "model": selected_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "stream": True,
        }
        await self._rate_limiter.acquire()
        try:
            async with httpx.AsyncClient(timeout=self.settings.nvidia_request_timeout_seconds) as client:
                async with client.stream(
                    "POST",
                    f"{self.settings.nvidia_base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    import json as _json

                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        chunk_raw = line[len("data:"):].strip()
                        if chunk_raw == "[DONE]":
                            break
                        try:
                            chunk = _json.loads(chunk_raw)
                        except _json.JSONDecodeError:
                            continue
                        delta = (chunk.get("choices") or [{}])[0].get("delta", {})
                        content = delta.get("content")
                        if content:
                            yield content
        except Exception as exc:
            if self.settings.environment == "test" or self.settings.disable_external_llm:
                yield self._offline_response(prompt)
                return
            raise RuntimeError(f"NVIDIA streaming API call failed: {exc}") from exc

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._embed_batch(texts, "passage")

    async def embed_query(self, text: str) -> list[float]:
        vectors = await self._embed_batch([text], "query")
        return vectors[0] if vectors else []

    async def _embed_batch(self, texts: list[str], input_type: str) -> list[list[float]]:
        if not texts:
            return []
        if not self._configured():
            if self.settings.environment == "test" or self.settings.disable_external_llm:
                return [self._hash_embedding(text) for text in texts]
            raise RuntimeError("NVIDIA API is not configured. Please set NVIDIA_API_KEY in your environment/dotenv file.")

        payload = {
            "model": self.settings.nvidia_embedding_model,
            "input": texts,
            "input_type": input_type,
            "encoding_format": "float",
        }

        async def _call() -> httpx.Response:
            await self._rate_limiter.acquire()
            async with httpx.AsyncClient(timeout=self.settings.nvidia_request_timeout_seconds) as client:
                resp = await client.post(
                    f"{self.settings.nvidia_base_url}/embeddings",
                    headers=self._headers(),
                    json=payload,
                )
                resp.raise_for_status()
                return resp

        async with log_llm_call(self.name, "embed", input_type, self.settings.nvidia_embedding_model):
            try:
                retryer = build_retrying(self.settings.nvidia_max_retries)
                response = None
                async for attempt in retryer:
                    with attempt:
                        response = await _call()
                data = response.json()
            except Exception as exc:
                # Local fallback embedding for development only — never used when a
                # real key is configured and the service call actually succeeds.
                if self.settings.environment == "test" or self.settings.disable_external_llm:
                    return [self._hash_embedding(text) for text in texts]
                raise RuntimeError(f"NVIDIA embedding API call failed: {exc}") from exc

        items = sorted(data.get("data", []), key=lambda item: item.get("index", 0))
        vectors = [[float(v) for v in item["embedding"]] for item in items]
        if len(vectors) != len(texts):
            raise RuntimeError(f"NVIDIA embedding count mismatch: sent {len(texts)}, got {len(vectors)}")
        return vectors

    def health_check(self) -> dict:
        if self.settings.disable_external_llm:
            return {"provider": self.name, "status": "disabled"}
        if not self.settings.nvidia_api_key:
            return {"provider": self.name, "status": "missing_key"}
        return {
            "provider": self.name,
            "status": "configured",
            "base_url": self.settings.nvidia_base_url,
            "reasoning_model": self.settings.nvidia_reasoning_model,
            "embedding_model": self.settings.nvidia_embedding_model,
        }

    def _offline_response(self, prompt: str) -> str:
        lower = prompt.lower()
        if "return json" in lower and "research agent" in lower:
            return '{"applicable_clauses":["Sample coverage clause"],"possible_exclusions":[],"waiting_periods":[],"regulations":["IRDAI health insurance guidelines"],"summary":"Offline research fallback using indexed knowledge.","confidence":0.55}'
        if "return json" in lower and "evidence agent" in lower:
            return '{"diagnosis":"","treatment":"","hospital":"","coverage_requested":"","admission_date":"","discharge_date":"","bill_amount":"","reason_for_rejection":"","documents_missing":["Physician support letter"],"key_dates":[],"summary":"Offline evidence extraction fallback."}'
        if "return json" in lower and "strategy agent" in lower:
            return '{"can_appeal":"YES","success_probability":0.62,"recommended_strategy":"Request internal appeal with policy clause citation and medical necessity evidence.","evidence_required":["Physician letter","Policy wording"],"escalation_path":["Internal appeal","GRO"],"summary":"Appeal recommended pending missing documents."}'
        if "return json" in lower and "review agent" in lower:
            return '{"missing_evidence":["Verify exact policy product name"],"hallucination_risks":[],"wrong_clause_risks":[],"weak_arguments":[],"approval_ready":false,"summary":"Human review required before submission."}'
        if "appeal letter" in lower or "negotiation agent" in lower:
            return (
                '{"appeal_letter":"Formal appeal letter draft.",'
                '"complaint_email":"Complaint email draft.",'
                '"escalation_note":"Escalation note draft.",'
                '"consumer_complaint":"Consumer complaint draft.",'
                '"summary":"Generated all negotiation documents."}'
            )
        if "final case report" in lower:
            return "Executive Summary: Case analyzed offline. Upload documents and configure NVIDIA_API_KEY for full semantic analysis."
        if "appeal" in lower or "draft" in lower:
            return "Draft appeal: request clinical review, cite policy clause, attach physician support, and ask insurer to specify exclusion relied upon."
        if "strategy" in lower:
            return "Recommended strategy: verify policy wording, attach clinical necessity evidence, request expedited internal appeal, then regulator escalation if needed."
        if "review" in lower or "devil" in lower:
            return "Review notes: verify appeal deadline, attach physician letter, confirm policy clause number, and avoid unsupported statutory citations."
        return "Evidence summary: extract denial reason, dates, hospital, treatment, and missing documents from uploaded files."
