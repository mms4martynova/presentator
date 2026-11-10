import logging

from sqlalchemy.orm import Session

from app import storage
from app.content import build_outline
from app.db import SessionLocal
from app.models import (
    TASK_COMPLETED,
    TASK_FAILED,
    TASK_PROCESSING,
    Task,
    TemplateVersion,
)
from app.pdf import PdfConversionError, pptx_to_pdf
from app.pptx_builder import build_pptx
from app.schemas import SlideSpec, TaskCreate

logger = logging.getLogger(__name__)

_USER_FACING_ERRORS = (PdfConversionError, ValueError)


def run_generation(task_id: str) -> None:
    with SessionLocal() as db:
        task = db.get(Task, task_id)
        if task is None:
            logger.error("Generation task %s not found", task_id)
            return
        logger.info("Generation task %s started", task_id)
        try:
            _execute(db, task)
            logger.info("Generation task %s completed", task_id)
        except Exception as exc:
            logger.exception("Generation task %s failed", task_id)
            db.rollback()
            task = db.get(Task, task_id)
            task.status = TASK_FAILED
            task.error = (
                str(exc)[:1000]
                if isinstance(exc, _USER_FACING_ERRORS)
                else "Внутренняя ошибка генерации"
            )
            db.commit()


def _execute(db: Session, task: Task) -> None:
    data = TaskCreate.model_validate(task.request)
    _advance(db, task, 10)
    if task.outline is None:
        task.outline = [slide.model_dump(mode="json") for slide in build_outline(data)]
    slides = [SlideSpec.model_validate(item) for item in task.outline]
    _advance(db, task, 40)

    pptx = build_pptx(data.title, slides, _load_template(db, task.template_version_id))
    task.pptx_key = storage.save(f"tasks/{task.id}/presentation.pptx", pptx)
    _advance(db, task, 70)

    if task.want_pdf:
        task.pdf_key = storage.save(
            f"tasks/{task.id}/presentation.pdf", pptx_to_pdf(pptx)
        )

    task.status = TASK_COMPLETED
    task.progress = 100
    task.error = None
    db.commit()


def _advance(db: Session, task: Task, progress: int) -> None:
    task.status = TASK_PROCESSING
    task.progress = progress
    db.commit()


def _load_template(db: Session, version_id: int | None) -> bytes | None:
    if version_id is None:
        return None
    version = db.get(TemplateVersion, version_id)
    if version is None:
        return None
    return storage.load(version.storage_key)
