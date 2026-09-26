from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Paths

PACKAGE_ROOT = Path(__file__).resolve().parent
PROMPTS_DIR = PACKAGE_ROOT / "prompts"
SERVICE_ROOT = PACKAGE_ROOT.parents[1]

# Settings

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=SERVICE_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    anthropic_api_key: str = Field(default="")
    extraction_model: str = Field(default="claude-sonnet-4-6")
    max_tokens: int = Field(default=8000)

    batch_size: int = Field(default=20)
    max_items_per_text: int = Field(default=60)
    max_retries: int = Field(default=2)
    request_timeout_seconds: float = Field(default=120.0)

    min_zipf: float = Field(default=2.5)
    max_zipf: float = Field(default=5.5)

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

# Prompts

def load_prompt(name: str, **values: str) -> str:
    path = PROMPTS_DIR / f"{name}.md"
    raw = path.read_text(encoding="utf-8")

    body = raw
    version = "0"
    if raw.startswith("---"):
        _, front, body = raw.split("---", 2)
        for line in front.splitlines():
            if line.strip().startswith("version:"):
                version = line.split(":", 1)[1].strip()

    text = body.strip()
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    return text

def prompt_version(name: str) -> str:
    path = PROMPTS_DIR / f"{name}.md"
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---"):
        return "0"
    _, front, _ = raw.split("---", 2)
    for line in front.splitlines():
        if line.strip().startswith("version:"):
            return line.split(":", 1)[1].strip()
    return "0"