import json
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class LLMUnavailable(Exception):
    pass


def llm_enabled() -> bool:
    return bool(settings.llm_base_url and settings.llm_api_key)


def chat_json(system: str, user: str) -> dict:
    if not llm_enabled():
        raise LLMUnavailable("LLM не настроен")
    response = httpx.post(
        f"{settings.llm_base_url.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {settings.llm_api_key}"},
        json={
            "model": settings.llm_model,
            "temperature": 0.4,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        },
        timeout=settings.llm_timeout_seconds,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        raise ValueError("Ответ LLM должен быть JSON-объектом")
    return parsed
