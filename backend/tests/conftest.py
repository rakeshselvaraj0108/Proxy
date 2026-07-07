import os

# Set environment to test before any imports load settings
os.environ["ENVIRONMENT"] = "test"
os.environ["DISABLE_EXTERNAL_LLM"] = "true"
# Pin the default provider so existing tests are hermetic regardless of the
# developer's local .env LLM_PROVIDER choice; provider-specific behavior is
# covered explicitly in test_llm_providers.py.
os.environ.setdefault("LLM_PROVIDER", "gemini")
