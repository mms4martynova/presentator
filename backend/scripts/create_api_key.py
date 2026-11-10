import secrets


from app.db import SessionLocal
from app.models import User
from app.security import hash_api_key


def main(name: str) -> None:
    api_key = secrets.token_urlsafe(32)
    with SessionLocal() as db:
        db.add(User(name=name, api_key_hash=hash_api_key(api_key)))
        db.commit()
    print(
        f"Пользователь «{name}» создан. API-ключ (сохраните его, повторно он не показывается):"
    )
    print(api_key)


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        raise SystemExit("Использование: python -m scripts.create_api_key ИМЯ")
    main(sys.argv[1])
