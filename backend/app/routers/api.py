from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import advisor, storage
from app.db import get_db
from app.models import Task, User
from app.schemas import (
    MeOut,
    RecommendationOut,
    SlideSpec,
    TaskCreate,
    TaskOut,
    TaskRebuild,
    TaskSummary,
)
from app.security import get_current_user
from app.services import get_owned_task, rebuild_task, submit_task

router = APIRouter()
HISTORY_LIMIT = 50
PPTX_MEDIA = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


@router.get("/me", response_model=MeOut, tags=["Аутентификация"])
def read_me(user: User = Depends(get_current_user)):
    return MeOut(id=user.id, name=user.name)


@router.post(
    "/advisor/recommend", response_model=RecommendationOut, tags=["AI Visual Advisor"]
)
def recommend_visualization(slide: SlideSpec, _: User = Depends(get_current_user)):
    return advisor.recommend(slide)


@router.post(
    "/tasks",
    response_model=TaskOut,
    tags=["Задачи"],
    summary="Создать задачу генерации",
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
)
def list_tasks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Task)
        .where(Task.owner_id == user.id)
        .order_by(Task.created_at.desc())
        .limit(HISTORY_LIMIT)
    ).all()


@router.get(
    "/tasks/{task_id}", response_model=TaskOut, tags=["Задачи"], summary="Статус задачи"
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
)
def rebuild(
    task_id: str,
    body: TaskRebuild,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parent = get_owned_task(db, user, task_id)
    return rebuild_task(db, user, parent, body)


@router.get("/tasks/{task_id}/result", tags=["Задачи"], summary="Скачать PPTX или PDF")
def download_result(
    task_id: str,
    format: str = "pptx",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if format not in ("pptx", "pdf"):
        raise HTTPException(status_code=422, detail="Формат должен быть pptx или pdf")
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
