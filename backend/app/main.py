import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import api, mcp, templates

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s"
)

TAGS_METADATA = [
    {
        "name": "Аутентификация",
        "description": "Проверка API-ключа и получение профиля пользователя.",
    },
    {
        "name": "Задачи",
        "description": (
            "Создание задач генерации презентаций, отслеживание статуса, "
            "история генераций, повторная сборка и скачивание результатов в PPTX/PDF."
        ),
    },
    {
        "name": "Шаблоны",
        "description": (
            "Управление корпоративными PPTX-шаблонами: загрузка, версионирование, "
            "откат к предыдущим версиям, предпросмотр в PDF, удаление."
        ),
    },
    {
        "name": "AI Visual Advisor",
        "description": (
            "Анализ данных слайда и рекомендация оптимального способа визуализации: "
            "текст, таблица, график, диаграмма, сравнение, изображение."
        ),
    },
    {
        "name": "MCP",
        "description": (
            "MCP-сервер на базе протокола Streamable HTTP для интеграции "
            "с внешними ИИ-агентами. Реализует JSON-RPC 2.0 поверх HTTP "
            "с поддержкой SSE-стрима."
        ),
    },
    {
        "name": "Служебное",
        "description": "Проверка работоспособности сервиса (health check).",
    },
]

app = FastAPI(
    title="Презентатор (Presentation Generator)",
    version="1.0.0",
    description=(
        "## Интеллектуальная система автоматического создания корпоративных презентаций\n\n"
        "Система формирует многостраничные презентации в форматах **PPTX** и **PDF** "
        "по текстовому описанию или структурированным данным, с поддержкой:\n\n"
        "- Корпоративных шаблонов с версионированием\n"
        "- AI Visual Advisor — подбор способа визуализации данных\n"
        "- LLM-генерации структуры и содержания слайдов\n"
        "- MCP-сервера для интеграции с внешними ИИ-агентами\n\n"
        "### Аутентификация\n"
        "Все запросы требуют API-ключ в заголовке `X-API-Key`. "
        "Создаётся скриптом `create_api_key.py`.\n\n"
        "### Режимы генерации\n"
        "- **Асинхронный** (`mode=async`) — задача ставится в очередь, "
        "ответ `202 Accepted` с ID задачи.\n"
        "- **Синхронный** (`mode=sync`) — генерация до 5 слайдов, "
        "ответ `200 OK` с готовой задачей."
    ),
    openapi_tags=TAGS_METADATA,
    openapi_url="/api/v1/openapi.json",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    swagger_ui_oauth2_redirect_url="/api/v1/docs/oauth2-redirect",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api.router)
app.include_router(templates.router)
app.include_router(mcp.router)


@app.get(
    "/health",
    tags=["Служебное"],
    summary="Проверка работоспособности",
    description='Возвращает `{"status": "ok"}`, если сервис запущен и отвечает на запросы.',
)
def health():
    return {"status": "ok"}
