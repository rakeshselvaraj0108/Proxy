"""
E-Commerce Domain - Specialist Agents
Routes to: consumer_protection, returns_refunds, marketplace_policy, delivery_logistics, warranty_seller
"""
import json
import logging
from typing import Dict, Any
from app.llm.gemini.service import gemini_service
from app.models.domain import Domain
from app.rag.retrieval.qdrant_service import qdrant_service

logger = logging.getLogger(__name__)

class EcommerceSpecialistAgent:
    def __init__(self, name: str, focus: str, system_prompt: str):
        self.name = name
        self.focus = focus
        self.system_prompt = system_prompt

    async def process(self, context: Dict[str, Any]) -> Dict[str, Any]:
        query = context.get("case_summary", "")
        facts = context.get("extracted_facts", {})

        results = await qdrant_service.search_chunks(
            Domain.ECOMMERCE, f"{self.focus}: {query}", top_k=5
        )
        context_text = "\n\n".join(r.get("text", "") for r in results)

        prompt = f"""{self.system_prompt}

# User Query
{query}

# Extracted Facts
{json.dumps(facts, indent=2)}

# Regulatory & Policy Context (retrieved from knowledge base)
{context_text}

# Output (strict JSON only)
{{
    "analysis": "...",
    "applicable_rules": ["..."],
    "action_plan": ["..."],
    "escalation_path": "Marketplace Grievance Officer / National Consumer Helpline / Consumer Court",
    "refund_eligible": "YES/NO/PARTIAL",
    "estimated_resolution_days": "..."
}}"""
        raw = await gemini_service.generate(prompt, purpose="reasoning")
        try:
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].strip()
            data = json.loads(raw)
        except Exception as e:
            logger.error(f"{self.name} JSON parse error: {e}")
            data = {"error": str(e), "raw": raw}

        return {"specialist_name": self.name, "specialist_focus": self.focus, "strategy": data}

class ConsumerProtectionAgent(EcommerceSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Consumer Protection Specialist",
            focus="Consumer Protection Act, E-Commerce Rules, ONDC, CCPA, NCH, unfair trade practices",
            system_prompt="""You are an expert in Indian Consumer Protection Law and E-Commerce Rules 2020.
You evaluate disputes involving unfair trade practices, misleading advertisements, and dark patterns.
Your goal is to identify statutory violations and draft complaints to the CCPA or National Consumer Helpline."""
        )

class ReturnsRefundsAgent(EcommerceSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Returns & Refunds Specialist",
            focus="Refund denied, return rejected, cancellation charges, duplicate payment, refund timelines",
            system_prompt="""You are a specialist in e-commerce returns, exchanges, and payment refunds.
You evaluate cases where a marketplace denies a legitimate return request or delays a refund.
You reference specific marketplace return window policies and UPI/Card chargeback guidelines."""
        )

class MarketplacePolicyAgent(EcommerceSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Marketplace Policy Specialist",
            focus="Amazon A-to-z, Flipkart SuperCoins, Myntra terms, account blocking, seller terms",
            system_prompt="""You are an expert on specific marketplace policies (Amazon, Flipkart, Myntra, JioMart, etc.).
You mediate disputes using the platform's own stated terms of service and buyer protection guarantees,
holding them accountable to their published SLAs."""
        )

class DeliveryLogisticsAgent(EcommerceSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Delivery & Logistics Specialist",
            focus="Missing package, delivery delay, damaged shipment, courier, OTP issues, quick commerce",
            system_prompt="""You are a logistics and last-mile delivery specialist.
You investigate missing packages, delayed deliveries, and "delivered but not received" claims.
You use courier policies (Delhivery, Blue Dart) and quick commerce SLAs (Blinkit, Zepto) to demand compensation."""
        )

class WarrantySellerAgent(EcommerceSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="Warranty & Seller Fraud Specialist",
            focus="Fake product, warranty refused, seller disappeared, wrong product delivered, defective item",
            system_prompt="""You specialize in seller fraud, counterfeit goods, and warranty denials.
You know that under E-Commerce Rules, marketplaces share liability for fake products.
You draft notices to sellers and brands to enforce product warranties and demand replacements for defective goods."""
        )

def get_ecommerce_specialists() -> Dict[str, EcommerceSpecialistAgent]:
    return {
        "consumer_protection": ConsumerProtectionAgent(),
        "returns_refunds": ReturnsRefundsAgent(),
        "marketplace_policy": MarketplacePolicyAgent(),
        "delivery_logistics": DeliveryLogisticsAgent(),
        "warranty_seller": WarrantySellerAgent(),
    }
