from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Template, User
from app.schemas import ErrorOut, TemplateOut
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

router = APIRouter(prefix="/api/v1/templates", tags=["Шаблоны"])

AUTH_AND_ERRORS = {
    401: {"model": ErrorOut, "description": "Неверный или отсутствующий API-ключ"},
    404: {"model": ErrorOut, "description": "Шаблон или версия не найдена"},
    413: {"model": ErrorOut, "description": "Файл превышает 50 МБ"},
    422: {"model": ErrorOut, "description": "Файл не является PPTX или имеет неверную структуру"},
    503: {"model": ErrorOut, "description": "Ошибка конвертации в PDF"},
}


@router.get(
    "",
    response_model=list[TemplateOut],
    summary="Список шаблонов",
    description=(
        "Возвращает все шаблоны текущего пользователя с историей их версий. "
        "У каждой версии указан номер, оригинальное имя файла, флаг активности "
        "и дата создания."
    ),
    responses=AUTH_AND_ERRORS,
)
def list_templates(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return db.scalars(
        select(Template).where(Template.owner_id == user.id).order_by(Template.id)
    ).all()


@router.post(
    "",
    response_model=TemplateOut,
    status_code=201,
    summary="Загрузить PPTX-шаблон",
    description=(
        "Создаёт новый шаблон и загружает его первую версию PPTX-файла.\n\n"
        "Параметры:\n"
        "- `name` — название шаблона (1–200 символов)\n"
        "- `file` — PPTX-файл (до 50 МБ)\n\n"
        "Файл проверяется на корректность структуры PPTX. Загруженная версия "
        "автоматически становится активной."
    ),
    responses=AUTH_AND_ERRORS,
)
def upload_template(
    name: str = Form(min_length=1, max_length=200, description="Название шаблона"),
    file: UploadFile = File(..., description="PPTX-файл шаблона"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return create_template(db, user, name, file.filename or "", _read_upload(file))


@router.get(
    "/{template_id}",
    response_model=TemplateOut,
    summary="Информация о шаблоне и его версиях",
    description="Возвращает шаблон по ID со списком всех его версий.",
    responses=AUTH_AND_ERRORS,
)
def read_template(
    template_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_owned_template(db, user, template_id)


@router.post(
    "/{template_id}/versions",
    response_model=TemplateOut,
    summary="Загрузить новую версию шаблона",
    description=(
        "Добавляет новую версию PPTX-файла к существующему шаблону. "
        "Новая версия автоматически становится активной, предыдущие — деактивируются. "
        "Номер версии увеличивается на 1 от максимального существующего."
    ),
    responses=AUTH_AND_ERRORS,
)
def upload_version(
    template_id: int,
    file: UploadFile = File(..., description="Новый PPTX-файл"),
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
    summary="Назначить активную версию (откат)",
    description=(
        "Делает указанную версию активной, деактивируя все остальные. "
        "Используется для отката к предыдущей версии шаблона."
    ),
    responses=AUTH_AND_ERRORS,
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
    description=(
        "Конвертирует указанную версию PPTX-шаблона в PDF и возвращает его "
        "для предпросмотра в браузере (Content-Disposition: inline). "
        "Конвертация выполняется через LibreOffice."
    ),
    responses=AUTH_AND_ERRORS,
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


@router.delete(
    "/{template_id}",
    status_code=204,
    summary="Удалить шаблон",
    description=(
        "Удаляет шаблон и все его версии. Бинарные файлы удаляются из хранилища. "
        "Задачи, ссылающиеся на версии этого шаблона, сохраняются "
        "(template_version_id обнуляется)."
    ),
    responses=AUTH_AND_ERRORS,
)
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
