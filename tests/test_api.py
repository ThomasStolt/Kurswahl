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


def test_get_students_after_upload(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save), \
         patch("app.routers.students.session.load", side_effect=fake_load):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
        response = client.get("/api/students")
    assert response.status_code == 200
    students = response.json()
    assert len(students) == 2
    assert students[0]["nr"] == 5


def test_patch_student_name(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save), \
         patch("app.routers.students.session.load", side_effect=fake_load), \
         patch("app.routers.students.session.save", side_effect=fake_save):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
        response = client.patch("/api/students/5", json={"name": "Max Mustermann"})
    assert response.status_code == 200
    assert response.json()["name"] == "Max Mustermann"


def test_get_courses_with_demand(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save), \
         patch("app.routers.courses.session.load", side_effect=fake_load):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
        response = client.get("/api/courses")
    assert response.status_code == 200
    courses = response.json()
    assert len(courses) == 18
    kochen = next(c for c in courses if c["name"] == "Kochen")
    assert kochen["max_students"] == 16
    assert kochen["total_interested"] > 0
