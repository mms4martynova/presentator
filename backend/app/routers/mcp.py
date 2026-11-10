import base64
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import advisor, storage
from app.db import get_db
from app.models import Template, User
from app.schemas import RecommendationOut, SlideSpec, TaskCreate
from app.security import get_current_user
from app.services import get_owned_task, submit_task, validation_message

router = APIRouter(tags=["MCP"])

PROTOCOL_VERSION = "2025-03-26"
SERVER_INFO = {"name": "presentator", "version": "1.0.0"}
PPTX_MEDIA = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

_SESSIONS: dict[str, dict[str, Any]] = {}

_SESSION_TTL = 3600

TOOLS = [
    {
        "name": "generate_presentation",
        "description": (
            "Создать презентацию в асинхронном режиме. "
            "Возвращает идентификатор задачи и начальный статус."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Название презентации"},
                "text": {
                    "type": "string",
                    "description": "Описание или структура содержания",
                },
                "slides_count": {"type": "integer", "minimum": 1, "maximum": 40},
                "language": {"type": "string", "enum": ["ru", "en"]},
                "audience": {"type": "string"},
                "tone": {"type": "string"},
                "template_id": {"type": "integer"},
                "want_pdf": {"type": "boolean"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "get_task_status",
        "description": "Статус и прогресс задачи генерации.",
        "inputSchema": {
            "type": "object",
            "properties": {"task_id": {"type": "string"}},
            "required": ["task_id"],
        },
    },
    {
        "name": "list_tasks",
        "description": "Список последних задач генерации (до 50).",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_templates",
        "description": "Список корпоративных шаблонов с активной версией.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_result",
        "description": (
            "Готовый файл презентации в base64 (после статуса completed). "
            "Поддерживает форматы pptx и pdf."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "format": {"type": "string", "enum": ["pptx", "pdf"]},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "recommend_visualization",
        "description": (
            "AI Visual Advisor: анализирует данные одного слайда и рекомендует "
            "оптимальный способ визуализации (текст, таблица, график, диаграмма, "
            "сравнение, изображение) с объяснением выбора."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Заголовок слайда"},
                "bullets": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Текстовые пункты слайда",
                },
                "type": {
                    "type": "string",
                    "enum": ["text", "table", "chart", "comparison", "image"],
                    "description": "Явно заданный тип (имеет приоритет)",
                },
                "chart": {
                    "type": "object",
                    "description": "Данные диаграммы: categories, series, kind",
                },
                "table": {
                    "type": "object",
                    "description": "Данные таблицы: headers, rows",
                },
                "comparison": {
                    "type": "object",
                    "description": "Данные сравнения: left_title, left_items, right_title, right_items",
                },
                "image": {
                    "type": "object",
                    "description": "Изображение в base64",
                },
            },
            "required": ["title"],
        },
    },
    {
        "name": "analyze_presentation",
        "description": (
            "AI Visual Advisor: анализирует весь ввод презентации (текст, слайды, "
            "аудиторию, тон) и возвращает контекст с метриками: количество числовых "
            "данных, упоминания трендов, сравнений, процессов, тип аудитории и "
            "уровень формальности."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Текстовое описание презентации"},
                "slides": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Структурированные слайды",
                },
                "slides_count": {"type": "integer"},
                "audience": {"type": "string"},
                "tone": {"type": "string"},
            },
        },
    },
]


def _now() -> float:
    return datetime.now(timezone.utc).timestamp()


def _create_session() -> str:
    session_id = str(uuid.uuid4())
    _SESSIONS[session_id] = {"created": _now(), "initialized": False}
    _gc_sessions()
    return session_id


def _gc_sessions() -> None:
    cutoff = _now() - _SESSION_TTL
    expired = [sid for sid, data in _SESSIONS.items() if data["created"] < cutoff]
    for sid in expired:
        _SESSIONS.pop(sid, None)


def _is_valid_session(session_id: str | None) -> bool:
    if not session_id:
        return False
    _gc_sessions()
    return session_id in _SESSIONS


def _sse_event(data: dict, event_type: str | None = None) -> str:
    payload = json.dumps(data, ensure_ascii=False, default=str)
    lines = []
    if event_type:
        lines.append(f"event: {event_type}")
    lines.append(f"data: {payload}")
    lines.append("")
    return "\n".join(lines) + "\n"


def _jsonrpc_result(request_id: Any, result: Any) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _jsonrpc_error(request_id: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


class _UnknownMethod(Exception):
    pass


# ─── Single endpoint: POST /mcp ───────────────────────────────────────────


@router.post("/mcp", summary="MCP-сервер (Streamable HTTP)")
async def mcp_endpoint(
    request: Request,
    accept: str | None = Header(default=None, alias="Accept"),
    mcp_session_id: str | None = Header(default=None, alias="Mcp-Session-Id"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    body = await request.json()
    method = body.get("method")
    request_id = body.get("id")

    wants_sse = accept and "text/event-stream" in accept

    if method == "initialize":
        session_id = _create_session()
        result = {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {
                "tools": {},
                "logging": {},
            },
            "serverInfo": SERVER_INFO,
        }
        response_data = _jsonrpc_result(request_id, result)
        headers = {"Mcp-Session-Id": session_id}
        if wants_sse:
            return StreamingResponse(
                _sse_stream([response_data]),
                media_type="text/event-stream",
                headers=headers,
            )
        return Response(
            content=json.dumps(response_data, ensure_ascii=False),
            media_type="application/json",
            headers=headers,
        )

    if not _is_valid_session(mcp_session_id):
        err = _jsonrpc_error(request_id, -32000, "Сессия не найдена или истекла. Выполните initialize.")
        if wants_sse:
            return StreamingResponse(
                _sse_stream([err]),
                media_type="text/event-stream",
                status_code=400,
            )
        return Response(
            content=json.dumps(err, ensure_ascii=False),
            media_type="application/json",
            status_code=400,
        )

    if method == "notifications/initialized":
        if mcp_session_id in _SESSIONS:
            _SESSIONS[mcp_session_id]["initialized"] = True
        return Response(status_code=204)

    if request_id is None:
        return Response(status_code=202)

    try:
        result = _dispatch(method, body.get("params") or {}, user, db)
        response_data = _jsonrpc_result(request_id, result)
    except _UnknownMethod:
        response_data = _jsonrpc_error(request_id, -32601, "Метод не найден")
    except HTTPException as exc:
        response_data = _jsonrpc_error(request_id, -32000, str(exc.detail))
    except Exception as exc:
        response_data = _jsonrpc_error(request_id, -32603, f"Внутренняя ошибка: {exc}")

    if wants_sse:
        return StreamingResponse(
            _sse_stream([response_data]),
            media_type="text/event-stream",
        )
    return Response(
        content=json.dumps(response_data, ensure_ascii=False),
        media_type="application/json",
    )


@router.get("/mcp", summary="MCP SSE-stream (server-to-client notifications)")
async def mcp_sse_stream(
    mcp_session_id: str | None = Header(default=None, alias="Mcp-Session-Id"),
    user: User = Depends(get_current_user),
):
    if not _is_valid_session(mcp_session_id):
        return Response(
            content=json.dumps(
                _jsonrpc_error(None, -32000, "Сессия не найдена"),
                ensure_ascii=False,
            ),
            media_type="application/json",
            status_code=400,
        )

    async def heartbeat():
        yield _sse_event({"jsonrpc": "2.0", "method": "notifications/heartbeat"})

    return StreamingResponse(heartbeat(), media_type="text/event-stream")


@router.delete("/mcp", summary="Завершить MCP-сессию")
async def mcp_close_session(
    mcp_session_id: str | None = Header(default=None, alias="Mcp-Session-Id"),
    user: User = Depends(get_current_user),
):
    if mcp_session_id and mcp_session_id in _SESSIONS:
        _SESSIONS.pop(mcp_session_id, None)
    return Response(status_code=204)


def _sse_stream(messages: list[dict]):
    def generate():
        for msg in messages:
            yield _sse_event(msg)
    return generate()


# ─── Dispatch ─────────────────────────────────────────────────────────────


def _dispatch(method: str | None, params: dict, user: User, db: Session) -> dict:
    if method == "ping":
        return {"status": "pong", "timestamp": datetime.now(timezone.utc).isoformat()}
    if method == "tools/list":
        return {"tools": TOOLS}
    if method == "tools/call":
        return _call_tool(params.get("name"), params.get("arguments") or {}, user, db)
    if method == "logging/setLevel":
        return {"level": params.get("level", "info")}
    raise _UnknownMethod(method)


def _call_tool(name: str | None, args: dict, user: User, db: Session) -> dict:
    try:
        payload = _run_tool(name, args, user, db)
    except HTTPException as exc:
        return _tool_result(str(exc.detail), is_error=True)
    except ValidationError as exc:
        return _tool_result(validation_message(exc), is_error=True)
    return _tool_result(payload)


def _run_tool(name: str | None, args: dict, user: User, db: Session) -> Any:
    if name == "generate_presentation":
        task = submit_task(
            db, user, TaskCreate.model_validate({**args, "mode": "async"})
        )
        return {"task_id": task.id, "status": task.status, "progress": task.progress}

    if name == "get_task_status":
        task = get_owned_task(db, user, args.get("task_id", ""))
        return {
            "task_id": task.id,
            "status": task.status,
            "progress": task.progress,
            "error": task.error,
        }

    if name == "list_tasks":
        from app.models import Task

        tasks = db.scalars(
            select(Task)
            .where(Task.owner_id == user.id)
            .order_by(Task.created_at.desc())
            .limit(50)
        ).all()
        return {
            "tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "status": t.status,
                    "progress": t.progress,
                    "has_pptx": t.pptx_key is not None,
                    "has_pdf": t.pdf_key is not None,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                }
                for t in tasks
            ]
        }

    if name == "list_templates":
        templates = db.scalars(
            select(Template)
            .where(Template.owner_id == user.id)
            .order_by(Template.id)
        ).all()
        return {
            "templates": [
                {
                    "id": template.id,
                    "name": template.name,
                    "active_version": next(
                        (v.version for v in template.versions if v.is_active), None
                    ),
                }
                for template in templates
            ]
        }

    if name == "get_result":
        return _result(args, user, db)

    if name == "recommend_visualization":
        return _recommend_visualization(args)

    if name == "analyze_presentation":
        return _analyze_presentation(args)

    raise HTTPException(status_code=404, detail=f"Неизвестный инструмент: {name}")


def _result(args: dict, user: User, db: Session) -> dict:
    task = get_owned_task(db, user, args.get("task_id", ""))
    fmt = args.get("format", "pptx")
    key = task.pptx_key if fmt == "pptx" else task.pdf_key if fmt == "pdf" else None
    if key is None:
        raise HTTPException(status_code=409, detail="Файл в этом формате еще не готов")
    return {
        "format": fmt,
        "filename": f"{task.title}.{fmt}",
        "media_type": PPTX_MEDIA if fmt == "pptx" else "application/pdf",
        "base64": base64.b64encode(storage.load(key)).decode(),
    }


def _recommend_visualization(args: dict) -> dict:
    slide_data = {k: v for k, v in args.items() if v is not None}
    try:
        slide = SlideSpec.model_validate(slide_data)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=validation_message(exc)) from exc
    rec: RecommendationOut = advisor.recommend(slide)
    return {
        "visualization": rec.visualization,
        "slide_type": rec.slide_type,
        "reasoning": rec.reasoning,
    }


def _analyze_presentation(args: dict) -> dict:
    from app.schemas import TaskCreate

    try:
        data = TaskCreate.model_validate({
            "title": "analysis",
            "text": args.get("text", ""),
            "slides": args.get("slides"),
            "slides_count": args.get("slides_count", 8),
            "audience": args.get("audience"),
            "tone": args.get("tone"),
        })
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=validation_message(exc)) from exc

    text = data.text or ""
    slides = data.slides or []
    audience = data.audience or ""
    tone = data.tone or ""

    import re

    trend_re = re.compile(
        r"динамик|рост|снижен|паден|тренд|измен|увелич|уменьш|grow|decline|trend|change",
        re.IGNORECASE,
    )
    comparison_re = re.compile(
        r"сравн|преимуществ|недостат|плюс|минус|против|versus|vs|отлич|разница",
        re.IGNORECASE,
    )
    process_re = re.compile(
        r"этап|шаг|стадия|фаз|процесс|step|stage|phase|process|алгоритм",
        re.IGNORECASE,
    )
    number_re = re.compile(r"^\s*[-+]?\d", re.IGNORECASE)

    return {
        "has_structured": len(slides) > 0,
        "has_free_text": bool(text.strip()),
        "slide_count": len(slides),
        "chart_count": sum(1 for s in slides if s.chart),
        "table_count": sum(1 for s in slides if s.table),
        "comparison_count": sum(1 for s in slides if s.comparison),
        "image_count": sum(1 for s in slides if s.image),
        "numeric_bullets": sum(1 for line in text.split("\n") if number_re.match(line.strip())),
        "trend_mentions": len(trend_re.findall(text)),
        "comparison_mentions": len(comparison_re.findall(text)),
        "process_mentions": len(process_re.findall(text)),
        "audience": audience or None,
        "tone": tone or None,
        "slides_count_requested": data.slides_count,
        "language": data.language,
    }


def _tool_result(payload: Any, is_error: bool = False) -> dict:
    text = (
        payload
        if isinstance(payload, str)
        else json.dumps(payload, ensure_ascii=False, default=str)
    )
    return {"content": [{"type": "text", "text": text}], "isError": is_error}
