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


def _make_fake_optimization_result(students, courses):
    """Return fake (updated_courses, assignments) for the optimizer mock."""
    from app.models import Course, Assignment
    course_names = [
        "Debating", "Kochen", "Psychologie", "Rhetorik",
        "Podcast", "Theater", "Musik am Computer", "Schach",
    ]
    updated_courses = []
    for i, c in enumerate(courses):
        updated = c.model_copy()
        if c.name in course_names:
            updated.offered = True
            updated.semester = 1 if course_names.index(c.name) < 4 else 2
        else:
            updated.offered = False
            updated.semester = None
        updated_courses.append(updated)
    valid = [s for s in students if s.valid]
    assignments = [
        Assignment(
            student_nr=valid[0].nr,
            student_name=valid[0].name,
            course_hj1="Debating",
            course_hj2="Podcast",
            score_hj1=7,
            score_hj2=6,
        ),
        Assignment(
            student_nr=valid[1].nr,
            student_name=valid[1].name,
            course_hj1="Kochen",
            course_hj2="Theater",
            score_hj1=8,
            score_hj2=5,
        ),
    ]
    return updated_courses, assignments


def test_results_include_score_report(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save), \
         patch("app.routers.optimize.session.load", side_effect=fake_load), \
         patch("app.routers.optimize.session.save", side_effect=fake_save), \
         patch("app.routers.results.session.load", side_effect=fake_load), \
         patch("app.routers.optimize.run_full_optimization", side_effect=_make_fake_optimization_result):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
        client.post("/api/optimize")
        response = client.get("/api/results")
    assert response.status_code == 200
    data = response.json()
    assert "score_report" in data
    report = data["score_report"]
    assert "score_achieved" in report
    assert "score_maximum" in report
    assert "score_percent" in report
    assert "score_label" in report
    assert "score_description" in report
    assert "student_scores" in report
    assert "course_scores" in report
    assert report["score_percent"] >= 0
    assert len(report["student_scores"]) == 2
    assert len(report["course_scores"]) == 8


def test_export_csv_includes_scores(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save), \
         patch("app.routers.optimize.session.load", side_effect=fake_load), \
         patch("app.routers.optimize.session.save", side_effect=fake_save), \
         patch("app.routers.export.session.load", side_effect=fake_load), \
         patch("app.routers.optimize.run_full_optimization", side_effect=_make_fake_optimization_result):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
        client.post("/api/optimize")
        response = client.get("/api/export/csv")
    assert response.status_code == 200
    content = response.content.decode("utf-8-sig")
    lines = content.strip().split("\n")
    # First lines should be summary
    assert "Zufriedenheit" in lines[0]
    # Header row should include score columns
    header_line = next(l for l in lines if l.startswith("Nr."))
    assert "Gesamt-Score" in header_line


def test_optimize_assignments_returns_score_report(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save), \
         patch("app.routers.optimize.session.load", side_effect=fake_load), \
         patch("app.routers.optimize.session.save", side_effect=fake_save), \
         patch("app.routers.optimize.run_full_optimization", side_effect=_make_fake_optimization_result), \
         patch("app.routers.optimize.run_assignment_optimization", side_effect=lambda students, courses: _make_fake_optimization_result(students, courses)[1]):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
        client.post("/api/optimize")
        response = client.post("/api/optimize/assignments")
    assert response.status_code == 200
    data = response.json()
    assert "score_report" in data
    assert data["score_report"]["score_percent"] >= 0


def test_get_settings_empty_session_returns_defaults(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.settings.session.load", side_effect=fake_load), \
         patch("app.routers.settings.session.save", side_effect=fake_save):
        response = client.get("/api/settings")
    assert response.status_code == 200
    body = response.json()
    assert body["settings"]["hj1_count"] == 4
    assert body["settings"]["hj2_count"] == 4
    assert body["settings"]["default_max"] == 22
    assert body["settings"]["default_min"] == 1
    assert body["settings"]["special_course"] is None
    assert body["settings"]["special_max"] == 14
    assert body["settings"]["special_min"] == 1
    assert body["courses"] == []
    assert body["assignments_exist"] is False


def test_get_settings_after_upload_returns_course_list(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save), \
         patch("app.routers.settings.session.load", side_effect=fake_load), \
         patch("app.routers.settings.session.save", side_effect=fake_save):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
        response = client.get("/api/settings")
    assert response.status_code == 200
    body = response.json()
    assert len(body["courses"]) > 0
    assert "Kochen" in body["courses"]
    assert body["assignments_exist"] is False
