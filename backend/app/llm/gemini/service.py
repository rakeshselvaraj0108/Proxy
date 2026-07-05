from typing import Literal

from app.core.config import get_settings

GeminiPurpose = Literal["reasoning", "router", "planner", "response", "summarization", "ocr"]
EmbeddingPurpose = Literal["document", "query"]


class GeminiService:
    def __init__(self) -> None:
        self.settings = get_settings()
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

    def model_for(self, purpose: GeminiPurpose | None = None, model_name: str | None = None) -> str:
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
        purpose: GeminiPurpose = "reasoning",
        model_name: str | None = None,
    ) -> str:
        selected_model = self.model_for(purpose, model_name)
        if self._configure():
            try:
                import google.generativeai as genai

                model = genai.GenerativeModel(selected_model)
                response = model.generate_content(
                    prompt,
                    generation_config={"temperature": temperature},
                )
                if response.text:
                    return response.text
            except Exception as exc:
                if self.settings.environment != "test":
                    raise RuntimeError(f"Gemini generation API call failed: {exc}") from exc

        if self.settings.environment == "test" or self.settings.disable_external_llm:
            return self._offline_response(prompt)
        raise RuntimeError("Gemini API is not configured. Please set GEMINI_API_KEY in your environment/dotenv file.")

    async def summarize(self, text: str, instruction: str = "Summarize the retrieved evidence.") -> str:
        prompt = f"{instruction}\n\nText:\n{text[:12000]}"
        return await self.generate(prompt, temperature=0.1, purpose="summarization")

    async def embed(self, text: str, purpose: EmbeddingPurpose = "document") -> list[float]:
        if purpose == "query":
            return await self.embed_query(text)
        return await self.embed_document(text)

    async def embed_document(self, text: str) -> list[float]:
        return await self._embed(text, "retrieval_document")

    async def embed_query(self, text: str) -> list[float]:
        return await self._embed(text, "retrieval_query")

    async def _embed(self, text: str, task_type: str) -> list[float]:
        if not text:
            return [0.0] * 768
        if self._configure():
            try:
                import google.generativeai as genai

                response = genai.embed_content(
                    model=self.settings.embedding_model,
                    content=text,
                    task_type=task_type,
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

    def _hash_embedding(self, text: str, dimensions: int = 768) -> list[float]:
        seed = sum(ord(ch) for ch in text)
        return [((seed + index * 31) % 997) / 997 for index in range(dimensions)]

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


gemini_service = GeminiService()

