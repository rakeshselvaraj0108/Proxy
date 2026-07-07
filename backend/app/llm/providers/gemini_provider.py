from __future__ import annotations

from typing import AsyncIterator

from app.core.config import Settings
from app.llm.base import LLMProvider, LLMPurpose
from app.llm.observability import log_llm_call


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._configured = False

    def _configure(self) -> bool:
        if self._configured:
            return True
        if self.settings.disable_external_llm:
            return False
        if not self.settings.gemini_api_key:
            return False
        try:
            import google.generativeai as genai

            genai.configure(api_key=self.settings.gemini_api_key)
            self._configured = True
            return True
        except Exception:
            return False

    def embedding_mode(self) -> str:
        if self._configure():
            return "gemini"
        if self.settings.environment == "test" or self.settings.disable_external_llm:
            return "hash_fallback"
        return "gemini"

    def model_for(self, purpose: LLMPurpose | None = None, model_name: str | None = None) -> str:
        if model_name:
            return model_name
        if purpose == "router":
            return self.settings.gemini_router_model
        if purpose == "planner":
            return self.settings.gemini_planner_model
        if purpose == "response":
            return self.settings.gemini_response_model
        if purpose == "summarization":
            return self.settings.gemini_summarization_model
        if purpose == "ocr":
            return self.settings.gemini_ocr_model
        return self.settings.gemini_reasoning_model

    async def generate(
        self,
        prompt: str,
        temperature: float = 0.2,
        purpose: LLMPurpose = "reasoning",
        model_name: str | None = None,
    ) -> str:
        selected_model = self.model_for(purpose, model_name)
        async with log_llm_call(self.name, "generate", purpose, selected_model) as record:
            if self._configure():
                try:
                    import google.generativeai as genai

                    model = genai.GenerativeModel(selected_model)
                    response = model.generate_content(
                        prompt,
                        generation_config={"temperature": temperature},
                    )
                    usage = getattr(response, "usage_metadata", None)
                    if usage is not None:
                        record["prompt_tokens"] = getattr(usage, "prompt_token_count", None)
                        record["completion_tokens"] = getattr(usage, "candidates_token_count", None)
                        record["total_tokens"] = getattr(usage, "total_token_count", None)
                    if response.text:
                        return response.text
                except Exception as exc:
                    if self.settings.environment != "test":
                        raise RuntimeError(f"Gemini generation API call failed: {exc}") from exc

            if self.settings.environment == "test" or self.settings.disable_external_llm:
                return self._offline_response(prompt)
            raise RuntimeError("Gemini API is not configured. Please set GEMINI_API_KEY in your environment/dotenv file.")

    async def generate_stream(
        self,
        prompt: str,
        temperature: float = 0.2,
        purpose: LLMPurpose = "reasoning",
        model_name: str | None = None,
    ) -> AsyncIterator[str]:
        selected_model = self.model_for(purpose, model_name)
        if self._configure():
            try:
                import google.generativeai as genai

                model = genai.GenerativeModel(selected_model)
                response = model.generate_content(
                    prompt,
                    generation_config={"temperature": temperature},
                    stream=True,
                )
                for chunk in response:
                    if chunk.text:
                        yield chunk.text
                return
            except Exception as exc:
                if self.settings.environment != "test":
                    raise RuntimeError(f"Gemini streaming API call failed: {exc}") from exc

        if self.settings.environment == "test" or self.settings.disable_external_llm:
            yield self._offline_response(prompt)
            return
        raise RuntimeError("Gemini API is not configured. Please set GEMINI_API_KEY in your environment/dotenv file.")

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if self._configure():
            try:
                import google.generativeai as genai

                model = self.settings.embedding_model
                if not model.startswith(("models/", "tunedModels/")):
                    model = f"models/{model}"
                embeddings: list[list[float]] = []
                for start in range(0, len(texts), 1):
                    batch = texts[start:start + 1]
                    response = genai.embed_content(
                        model=model,
                        content=batch,
                        task_type="retrieval_document",
                        output_dimensionality=768,
                        request_options={"timeout": 60},
                    )
                    raw_embeddings = response.get("embedding") if isinstance(response, dict) else None
                    if raw_embeddings and isinstance(raw_embeddings[0], list):
                        embeddings.extend([[float(value) for value in item] for item in raw_embeddings])
                    elif raw_embeddings:
                        embeddings.append([float(value) for value in raw_embeddings])
                if len(embeddings) == len(texts):
                    return embeddings
            except Exception as exc:
                if self.settings.environment != "test":
                    raise RuntimeError(f"Gemini batch embedding API call failed: {exc}") from exc

        if self.settings.environment == "test" or self.settings.disable_external_llm:
            return [self._hash_embedding(text) for text in texts]
        raise RuntimeError("Gemini API is not configured. Please set GEMINI_API_KEY in your environment/dotenv file.")

    async def embed_query(self, text: str) -> list[float]:
        return await self._embed(text, "retrieval_query")

    async def _embed(self, text: str, task_type: str) -> list[float]:
        if not text:
            return [0.0] * 768
        if self._configure():
            try:
                import google.generativeai as genai

                model = self.settings.embedding_model
                if not model.startswith(("models/", "tunedModels/")):
                    model = f"models/{model}"
                response = genai.embed_content(
                    model=model,
                    content=text,
                    task_type=task_type,
                    output_dimensionality=768,
                    request_options={"timeout": 60},
                )
                embedding = response.get("embedding") if isinstance(response, dict) else None
                if embedding:
                    return [float(value) for value in embedding]
            except Exception as exc:
                if self.settings.environment != "test":
                    raise RuntimeError(f"Gemini embedding API call failed: {exc}") from exc

        if self.settings.environment == "test" or self.settings.disable_external_llm:
            return self._hash_embedding(text)
        raise RuntimeError("Gemini API is not configured. Please set GEMINI_API_KEY in your environment/dotenv file.")

    def health_check(self) -> dict:
        if self.settings.disable_external_llm:
            return {"provider": self.name, "status": "disabled"}
        if not self.settings.gemini_api_key:
            return {"provider": self.name, "status": "missing_key"}
        return {"provider": self.name, "status": "configured", "reasoning_model": self.settings.gemini_reasoning_model}

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
            return "Executive Summary: Case analyzed offline. Upload documents and configure GEMINI_API_KEY for full semantic analysis."
        if "appeal" in lower or "draft" in lower:
            return "Draft appeal: request clinical review, cite policy clause, attach physician support, and ask insurer to specify exclusion relied upon."
        if "strategy" in lower:
            return "Recommended strategy: verify policy wording, attach clinical necessity evidence, request expedited internal appeal, then regulator escalation if needed."
        if "review" in lower or "devil" in lower:
            return "Review notes: verify appeal deadline, attach physician letter, confirm policy clause number, and avoid unsupported statutory citations."
        return "Evidence summary: extract denial reason, dates, hospital, treatment, and missing documents from uploaded files."
