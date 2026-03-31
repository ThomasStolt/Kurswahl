from app.parser import parse_csv, validate_student
from app.models import Student


def test_parse_valid_csv(tmp_path):
    from tests.conftest import VALID_CSV
    f = tmp_path / "test.csv"
    f.write_text(VALID_CSV, encoding="utf-8")
    students, course_names = parse_csv(f.read_bytes())
    assert len(students) == 2
    assert all(s.valid for s in students)


def test_valid_student_has_exactly_8_priorities():
    prefs = {f"Kurs{i}": i for i in range(1, 9)}
    for i in range(9, 19):
        prefs[f"Kurs{i}"] = 0
    student = validate_student(nr=1, name="", raw_prefs=prefs)
    assert student.valid
    assert student.errors == []


def test_invalid_duplicate_priority():
    prefs = {"A": 1, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5, "G": 6, "H": 7, "I": 0}
    student = validate_student(nr=8, name="", raw_prefs=prefs)
    assert not student.valid
    assert any("Priorität 1" in e for e in student.errors)


def test_invalid_value_out_of_range():
    prefs = {"A": 9, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5, "G": 6, "H": 7, "I": 0}
    student = validate_student(nr=66, name="", raw_prefs=prefs)
    assert not student.valid
    assert any("ungültig" in e.lower() for e in student.errors)


def test_invalid_too_few_priorities():
    prefs = {"A": 1, "B": 2, "C": 0, "D": 0, "E": 0, "F": 0, "G": 0, "H": 0, "I": 0}
    student = validate_student(nr=80, name="", raw_prefs=prefs)
    assert not student.valid
    assert any("8 Prioritäten" in e for e in student.errors)


def test_empty_row_is_ignored():
    from tests.conftest import EMPTY_ROW_CSV
    students, _ = parse_csv(EMPTY_ROW_CSV.encode())
    assert len(students) == 0


def test_parse_returns_course_names():
    from tests.conftest import VALID_CSV
    _, course_names = parse_csv(VALID_CSV.encode())
    assert "Kochen" in course_names
    assert "Debating" in course_names
    assert len(course_names) == 18
