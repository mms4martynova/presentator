import os
import tempfile

_TMP = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["STORAGE_DIR"] = f"{_TMP}/storage"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import services  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_api_key  # noqa: E402

Base.metadata.create_all(engine)

OWNER_KEY = "owner-key"
OTHER_KEY = "other-key"


@pytest.fixture(scope="session", autouse=True)
def users():
    with SessionLocal() as db:
        db.add(User(name="owner", api_key_hash=hash_api_key(OWNER_KEY)))
        db.add(User(name="other", api_key_hash=hash_api_key(OTHER_KEY)))
        db.commit()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(services, "enqueue_generation", lambda task_id: None)
    with TestClient(app) as test_client:
        test_client.headers["X-API-Key"] = OWNER_KEY
        yield test_client


@pytest.fixture
def other_client():
    with TestClient(app) as test_client:
        test_client.headers["X-API-Key"] = OTHER_KEY
        yield test_client
