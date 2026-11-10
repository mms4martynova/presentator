from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Template, User
from app.schemas import TemplateOut
from app.security import get_current_user
from app.services import (
    MAX_TEMPLATE_BYTES,
    activate_template_version,
    create_template,
    delete_template,
    get_owned_template,
    template_version_preview,
    upload_template_version,
)

router = APIRouter(prefix="/templates", tags=["Шаблоны"])


@router.get("", response_model=list[TemplateOut], summary="Список шаблонов")
def list_templates(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return db.scalars(
        select(Template).where(Template.owner_id == user.id).order_by(Template.id)
    ).all()


@router.post(
    "", response_model=TemplateOut, status_code=201, summary="Загрузить PPTX-шаблон"
)
def upload_template(
    name: str = Form(min_length=1, max_length=200),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return create_template(db, user, name, file.filename or "", _read_upload(file))


@router.get("/{template_id}", response_model=TemplateOut, summary="Шаблон и его версии")
def read_template(
    template_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_owned_template(db, user, template_id)


@router.post(
    "/{template_id}/versions",
    response_model=TemplateOut,
    summary="Загрузить новую версию",
)
def upload_version(
    template_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    template = get_owned_template(db, user, template_id)
    return upload_template_version(
        db, template, file.filename or "", _read_upload(file)
    )


@router.post(
    "/{template_id}/versions/{version_id}/activate",
    response_model=TemplateOut,
    summary="Назначить активной версию (откат)",
)
def activate_version(
    template_id: int,
    version_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    template = get_owned_template(db, user, template_id)
    return activate_template_version(db, template, version_id)


@router.get(
    "/{template_id}/versions/{version_id}/preview",
    response_class=Response,
    summary="Предпросмотр версии в PDF",
)
def preview_version(
    template_id: int,
    version_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    template = get_owned_template(db, user, template_id)
    return Response(
        content=template_version_preview(db, template, version_id),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"},
    )


@router.delete("/{template_id}", status_code=204, summary="Удалить шаблон")
def remove_template(
    template_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    delete_template(db, get_owned_template(db, user, template_id))


def _read_upload(file: UploadFile) -> bytes:
    data = file.file.read(MAX_TEMPLATE_BYTES + 1)
    if len(data) > MAX_TEMPLATE_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 50 МБ")
    return data
