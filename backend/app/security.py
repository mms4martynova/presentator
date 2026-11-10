import hashlib

from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, description="API-ключ пользователя")


def hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()


def get_current_user(
    x_api_key: str | None = Depends(api_key_header),
    db: Session = Depends(get_db),
) -> User:
    if not x_api_key:
        raise HTTPException(
            status_code=401, detail="Требуется API-ключ в заголовке X-API-Key"
        )
    user = db.scalar(select(User).where(User.api_key_hash == hash_api_key(x_api_key)))
    if user is None:
        raise HTTPException(status_code=401, detail="Неверный API-ключ")
    return user
