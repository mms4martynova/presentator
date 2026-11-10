import json
import logging
import re

import httpx
from pydantic import BaseModel, Field

from app import advisor
from app.config import settings
from app.llm import chat_json, llm_enabled
from app.schemas import SlideSpec, TaskCreate

logger = logging.getLogger(__name__)

_OUTLINE_FORMAT = """Верни только JSON-объект вида:
{"slides": [{"title": "строка", "bullets": ["строка", ...],
  "table": {"headers": [...], "rows": [[...], ...]} | null,
  "chart": {"categories": [...], "series": [{"name": "...", "values": [числа]}]} | null,
  "comparison": {"left_title": "...", "left_items": [...], "right_title": "...", "right_items": [...]} | null}]}
Используй table, chart или comparison только когда в описании есть данные для них, иначе null.
Сделай ровно {count} слайдов. Заголовки короткие, тезисы конкретные, без пустых слайдов."""

_SYSTEM_PROMPTS = {
    "ru": "Ты создаешь структуру корпоративной презентации по описанию пользователя. Пиши на русском языке.\n"
    + _OUTLINE_FORMAT,
    "en": "You create the structure of a corporate presentation from the user's description. Write in English.\n"
    + _OUTLINE_FORMAT,
}


class _LLMOutline(BaseModel):
    slides: list[SlideSpec] = Field(min_length=1, max_length=40)


def build_outline(data: TaskCreate) -> list[SlideSpec]:
    structured = list(data.slides or [])
    generated: list[SlideSpec] = []
    if data.text:
        remaining = max(data.slides_count - len(structured), 1)
        generated = (
            _generate_with_llm(data, remaining) if llm_enabled() else None
        ) or split_text(data.text, remaining)
    return [advisor.resolve(slide) for slide in structured + generated]


def split_text(text: str, max_slides: int) -> list[SlideSpec]:
    blocks: list[dict] = []
    current: dict | None = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            if current is not None:
                blocks.append(current)
                current = None
            continue
        if line.startswith("#"):
            if current is not None:
                blocks.append(current)
            current = {"title": line.lstrip("#").strip(), "bullets": []}
        elif current is None:
            current = {"title": line[:200], "bullets": []}
        else:
            current["bullets"].append(re.sub(r"^[-*•]\s*", "", line)[:500])
    if current is not None:
        blocks.append(current)

    while len(blocks) > max(max_slides, 1):
        index = min(
            range(len(blocks) - 1),
            key=lambda i: len(blocks[i]["bullets"]) + len(blocks[i + 1]["bullets"]),
        )
        merged = blocks[index]
        merged["bullets"] += [blocks[index + 1]["title"], *blocks[index + 1]["bullets"]]
        del blocks[index + 1]

    return [
        SlideSpec(title=block["title"], bullets=block["bullets"][:30])
        for block in blocks
    ]


def _generate_with_llm(data: TaskCreate, count: int) -> list[SlideSpec] | None:
    system = _SYSTEM_PROMPTS[data.language].replace("{count}", str(count))
    user = json.dumps(
        {
            "presentation_title": data.title,
            "description": data.text,
            "audience": data.audience,
            "tone": data.tone,
        },
        ensure_ascii=False,
    )
    for attempt in range(1, settings.llm_max_attempts + 1):
        try:
            outline = _LLMOutline.model_validate(chat_json(system, user))
            return [slide.model_copy(update={"type": None}) for slide in outline.slides]
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
            logger.warning(
                "LLM outline attempt %s/%s failed: %s",
                attempt,
                settings.llm_max_attempts,
                exc,
            )
    logger.warning("LLM outline unavailable, falling back to deterministic split")
    return None
