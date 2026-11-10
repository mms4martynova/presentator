from pathlib import Path

from app.config import settings


def _path(key: str) -> Path:
    return Path(settings.storage_dir) / key


def save(key: str, data: bytes) -> str:
    path = _path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return key


def load(key: str) -> bytes:
    return _path(key).read_bytes()


def delete(key: str) -> None:
    _path(key).unlink(missing_ok=True)
