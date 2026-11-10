from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import advisor, storage
from app.db import get_db
from app.models import Task, User
from app.schemas import (
    ErrorOut,
    MeOut,
    RecommendationOut,
    SlideSpec,
    TaskCreate,
    TaskOut,
    TaskRebuild,
    TaskSummary,
)
from app.security import get_current_user

router = APIRouter(prefix="/api/v1")
HISTORY_LIMIT = 50
PPTX_MEDIA = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

AUTH_BAD_REQUEST = {
    401: {"model": ErrorOut, "description": "Неверный или отсутствующий API-ключ"},
    422: {"model": ErrorOut, "description": "Ошибка валидации входных данных"},
}

# ─── Аутентификация ──────────────────────────────────────────────────────────


@router.get(
    "/me",
    response_model=MeOut,
    tags=["Аутентификация"],
    summary="Профиль пользователя",
    description=(
        "Возвращает идентификатор и имя пользователя, которому принадлежит API-ключ.\n\n"
        "Используйте этот метод для проверки, что API-ключ корректен и активен."
    ),
    responses=AUTH_BAD_REQUEST,
)
def read_me(user: User = Depends(get_current_user)):
    return MeOut(id=user.id, name=user.name)


# ─── AI Visual Advisor ─────────────────────────────────────────────────────────


@router.post(
    "/advisor/recommend",
    response_model=RecommendationOut,
    tags=["AI Visual Advisor"],
    summary="Рекомендация типа визуализации для слайда",
    description=(
        "Анализирует описание одного слайда и рекомендует оптимальный способ визуализации:\n"
        "- **text** — текстовый блок (нет числовых данных)\n"
        "- **table** — таблица (разрозненные числовые показатели)\n"
        "- **line_chart** — линейный график (временные ряды)\n"
        "- **column_chart** — столбчатая диаграмма (сравнение категорий)\n"
        "- **pie_chart** — круговая диаграмма (доли целого)\n"
        "- **comparison** — слайд сравнения (два набора данных)\n"
        "- **image** — слайд с изображением\n\n"
        "Если тип слайда задан явно в поле `type`, он имеет приоритет над рекомендацией."
    ),
    responses=AUTH_BAD_REQUEST,
)
def recommend_visualization(slide: SlideSpec, _: User = Depends(get_current_user)):
    return advisor.recommend(slide)


# ─── Задачи генерации ──────────────────────────────────────────────────────────


@router.post(
    "/tasks",
    response_model=TaskOut,
    tags=["Задачи"],
    summary="Создать задачу генерации презентации",
    description=(
        "Создаёт задачу генерации презентации на основе текстового описания или "
        "структурированных слайдов.\n\n"
        "**Режимы:**\n"
        "- `async` (по умолчанию) — задача ставится в очередь, ответ `202 Accepted` "
        "с идентификатором задачи. Статус отслеживается через `GET /tasks/{id}`.\n"
        "- `sync` — синхронная генерация для презентаций до 5 слайдов, ответ `200 OK` "
        "с готовой задачей.\n\n"
        "Необходимо указать хотя бы `text` (текстовое описание) или `slides` "
        "(структурированные слайды)."
    ),
    responses={
        **AUTH_BAD_REQUEST,
        200: {"model": TaskOut, "description": "Задача завершена (синхронный режим)"},
        202: {"model": TaskOut, "description": "Задача поставлена в очередь"},
    },
)
def create_task(
    body: TaskCreate,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = submit_task(db, user, body)
    response.status_code = 200 if body.mode == "sync" else 202
    return task


@router.get(
    "/tasks",
    response_model=list[TaskSummary],
    tags=["Задачи"],
    summary="История генераций",
    description=(
        "Возвращает список последних задач генерации текущего пользователя "
        f"(до {HISTORY_LIMIT} записей), отсортированный по дате создания (сначала новые)."
    ),
    responses=AUTH_BAD_REQUEST,
)
def list_tasks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Task)
        .where(Task.owner_id == user.id)
        .order_by(Task.created_at.desc())
        .limit(HISTORY_LIMIT)
    ).all()


@router.get(
    "/tasks/{task_id}",
    response_model=TaskOut,
    tags=["Задачи"],
    summary="Статус задачи",
    description=(
        "Возвращает полную информацию о задаче генерации: статус, прогресс, "
        "структуру слайдов (outline), наличие готовых файлов.\n\n"
        "Статусы: `queued` → `processing` → `completed` / `failed`."
    ),
    responses={
        **AUTH_BAD_REQUEST,
        404: {"model": ErrorOut, "description": "Задача не найдена"},
    },
)
def read_task(
    task_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return get_owned_task(db, user, task_id)


@router.post(
    "/tasks/{task_id}/rebuild",
    response_model=TaskOut,
    status_code=202,
    tags=["Задачи"],
    summary="Повторная сборка с изменёнными параметрами",
    description=(
        "Создаёт новую задачу на основе существующей, переопределяя указанные параметры. "
        "Поля, не переданные в запросе, наследуются от родительской задачи.\n\n"
        "Если меняются только параметры рендеринга (заголовок, шаблон, флаг PDF), "
        "структура слайдов (outline) переиспользуется без повторного вызова LLM. "
        "При изменении содержания (текст, слайды, число слайдов, язык, аудитория, тон) "
        "outline генерируется заново."
    ),
    responses={
        **AUTH_BAD_REQUEST,
        404: {"model": ErrorOut, "description": "Родительская задача не найдена"},
    },
)
def rebuild(
    task_id: str,
    body: TaskRebuild,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parent = get_owned_task(db, user, task_id)
    return rebuild_task(db, user, parent, body)


@router.get(
    "/tasks/{task_id}/result",
    tags=["Задачи"],
    summary="Скачать готовую презентацию (PPTX или PDF)",
    description=(
        "Скачивает готовый файл презентации в указанном формате.\n\n"
        "Параметр `format`:\n"
        "- `pptx` — PowerPoint-презентация (по умолчанию)\n"
        "- `pdf` — PDF-документ (доступен, если при создании был указан `want_pdf=true`)\n\n"
        "Имя файла формируется из названия задачи с корректной кодировкой UTF-8."
    ),
    responses={
        **AUTH_BAD_REQUEST,
        404: {"model": ErrorOut, "description": "Файл в этом формате ещё не готов"},
    },
    response_class=Response,
)
def download_result(
    task_id: str,
    format: str = Query(
        default="pptx",
        description="Формат файла: `pptx` или `pdf`",
        pattern="^(pptx|pdf)$",
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = get_owned_task(db, user, task_id)
    key = task.pptx_key if format == "pptx" else task.pdf_key
    if key is None:
        raise HTTPException(status_code=404, detail="Файл в этом формате еще не готов")
    media = PPTX_MEDIA if format == "pptx" else "application/pdf"
    return Response(
        content=storage.load(key),
        media_type=media,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(f'{task.title}.{format}')}"
        },
    )
