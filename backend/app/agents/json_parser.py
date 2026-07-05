"""JSON parsing utility for agent outputs."""

from __future__ import annotations

import json
import re


def parse_agent_json(raw: str, fallback_fields: dict | None = None) -> dict:
    """Parse JSON from LLM output, handling markdown fences and common issues."""
    text = raw.strip()

    # Strip markdown code fences
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find the first { ... } block
    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass

    # Fallback: return the raw text in a summary field
    result = {"summary": text, "_parse_failed": True}
    if fallback_fields:
        for key, default in fallback_fields.items():
            result.setdefault(key, default)
    return result
