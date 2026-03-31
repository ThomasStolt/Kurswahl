import io
from unittest.mock import patch
from app.models import SessionData
from tests.conftest import VALID_CSV, INVALID_CSV_DUPLICATE


def _make_mock_session():
    """Return a (load_mock, save_mock) pair that share an in-memory SessionData."""
    state = SessionData()

    def fake_load():
        return state

    def fake_save(data):
        nonlocal state
        state = data

    return fake_load, fake_save


def test_upload_valid_csv(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save):
        response = client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["valid_count"] == 2
    assert data["invalid_count"] == 0
    assert data["total"] == 2


def test_upload_csv_with_errors(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save):
        response = client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(INVALID_CSV_DUPLICATE.encode()), "text/csv")},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["invalid_count"] == 1
    assert data["valid_count"] == 0


def test_upload_rejects_non_csv(client):
    response = client.post(
        "/api/upload",
        files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert response.status_code == 400
