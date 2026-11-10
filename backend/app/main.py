import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import api, mcp, templates

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s"
)

app = FastAPI(
    title="Презентатор (Presentation Generator)",
    version="1.0.0",
    description="Автоматическое создание корпоративных презентаций по шаблонам и описанию.",
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


@app.get("/health", tags=["Служебное"])
def health():
    return {"status": "ok"}
