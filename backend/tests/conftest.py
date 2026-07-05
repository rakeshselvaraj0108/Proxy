import os

# Set environment to test before any imports load settings
os.environ["ENVIRONMENT"] = "test"
os.environ["DISABLE_EXTERNAL_LLM"] = "true"
