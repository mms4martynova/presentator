from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import storage
from app.jobqueue import enqueue_generation
from app.jobs import run_generation
from app.models import Task, Template, TemplateVersion, User
from app.pdf import PdfConversionError, pptx_to_pdf
from app.pptx_builder import validate_template
from app.schemas import TaskCreate, TaskRebuild

SYNC_MAX_SLIDES = 5
MAX_TEMPLATE_BYTES = 50 * 1024 * 1024
CONTENT_FIELDS = {"text", "slides", "slides_count", "language", "audience", "tone"}


def validation_message(exc: ValidationError) -> str:
    return "; ".join(
        error["msg"].removeprefix("Value error, ") for error in exc.errors()
    )


def get_owned_task(db: Session, owner: User, task_id: str) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id, Task.owner_id == owner.id))
    if task is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return task


def get_owned_template(db: Session, owner: User, template_id: int) -> Template:
    template = db.scalar(
        select(Template).where(
            Template.id == template_id, Template.owner_id == owner.id
        )
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    return template


def resolve_active_version(
    db: Session, owner: User, template_id: int | None
) -> int | None:
    if template_id is None:
        return None
    template = get_owned_template(db, owner, template_id)
    active = next((version for version in template.versions if version.is_active), None)
    if active is None:
        raise HTTPException(status_code=422, detail="У шаблона нет активной версии")
    return active.id


def submit_task(db: Session, owner: User, data: TaskCreate) -> Task:
    if data.mode == "sync" and data.slides_count > SYNC_MAX_SLIDES:
        raise HTTPException(
            status_code=422,
            detail=f"Синхронный режим доступен для презентаций до {SYNC_MAX_SLIDES} слайдов",
        )
    task = Task(
        owner_id=owner.id,
        title=data.title,
        want_pdf=data.want_pdf,
        request=data.model_dump(mode="json", exclude={"mode"}),
        template_version_id=resolve_active_version(db, owner, data.template_id),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _start(db, task, data.mode)


def rebuild_task(db: Session, owner: User, parent: Task, changes: TaskRebuild) -> Task:
    changed = changes.model_dump(exclude_unset=True, mode="json")
    try:
        data = TaskCreate.model_validate({**parent.request, **changed, "mode": "async"})
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=validation_message(exc)) from exc

    content_changed = CONTENT_FIELDS & changed.keys()
    task = Task(
        owner_id=owner.id,
        parent_task_id=parent.id,
        title=data.title,
        want_pdf=data.want_pdf,
        request=data.model_dump(mode="json", exclude={"mode"}),
        outline=None if content_changed else parent.outline,
        template_version_id=(
            resolve_active_version(db, owner, data.template_id)
            if "template_id" in changed
            else parent.template_version_id
        ),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _start(db, task, "async")


def _start(db: Session, task: Task, mode: str) -> Task:
    if mode == "sync":
        run_generation(task.id)
        db.refresh(task)
    else:
        enqueue_generation(task.id)
    return task


def create_template(
    db: Session, owner: User, name: str, filename: str, data: bytes
) -> Template:
    validate_upload(filename, data)
    template = Template(owner_id=owner.id, name=name)
    db.add(template)
    db.flush()
    _add_version(db, template, filename, data)
    db.commit()
    db.refresh(template)
    return template


def upload_template_version(
    db: Session, template: Template, filename: str, data: bytes
) -> Template:
    validate_upload(filename, data)
    _add_version(db, template, filename, data)
    db.commit()
    db.refresh(template)
    return template


def activate_template_version(
    db: Session, template: Template, version_id: int
) -> Template:
    if not any(version.id == version_id for version in template.versions):
        raise HTTPException(status_code=404, detail="Версия шаблона не найдена")
    for version in template.versions:
        version.is_active = version.id == version_id
    db.commit()
    db.refresh(template)
    return template


def template_version_preview(db: Session, template: Template, version_id: int) -> bytes:
    version = next((v for v in template.versions if v.id == version_id), None)
    if version is None:
        raise HTTPException(status_code=404, detail="Версия шаблона не найдена")
    try:
        return pptx_to_pdf(storage.load(version.storage_key))
    except PdfConversionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def delete_template(db: Session, template: Template) -> None:
    keys = [version.storage_key for version in template.versions]
    db.delete(template)
    db.commit()
    for key in keys:
        storage.delete(key)


def validate_upload(filename: str, data: bytes) -> None:
    if not filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=422, detail="Поддерживаются только файлы PPTX")
    if not data:
        raise HTTPException(status_code=422, detail="Файл пустой")
    if len(data) > MAX_TEMPLATE_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 50 МБ")
    try:
        validate_template(data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _add_version(
    db: Session, template: Template, filename: str, data: bytes
) -> TemplateVersion:
    number = max((version.version for version in template.versions), default=0) + 1
    for version in template.versions:
        version.is_active = False
    version = TemplateVersion(
        template_id=template.id,
        version=number,
        original_filename=filename,
        storage_key=f"templates/{template.id}/v{number}.pptx",
        is_active=True,
    )
    db.add(version)
    template.versions.append(version)
    storage.save(version.storage_key, data)
    return version
