from app.scorer import compute_score_report
from app.models import Student, Course, Assignment


def _make_assignment(nr, name, c1, s1, c2, s2):
    return Assignment(
        student_nr=nr, student_name=name,
        course_hj1=c1, score_hj1=s1,
        course_hj2=c2, score_hj2=s2,
    )


def _make_courses():
    return [
        Course(name="Bio", max_students=26, offered=True, semester=1),
        Course(name="Chemie", max_students=26, offered=True, semester=1),
        Course(name="Physik", max_students=26, offered=True, semester=1),
        Course(name="Mathe", max_students=26, offered=True, semester=1),
        Course(name="Kunst", max_students=26, offered=True, semester=2),
        Course(name="Musik", max_students=26, offered=True, semester=2),
        Course(name="Sport", max_students=26, offered=True, semester=2),
        Course(name="Theater", max_students=26, offered=True, semester=2),
        Course(name="Kochen", max_students=16, offered=False),
    ]


def test_perfect_score():
    """All students get priority 1 in both semesters -> 100%."""
    assignments = [
        _make_assignment(1, "Anna", "Bio", 8, "Kunst", 8),
        _make_assignment(2, "Ben", "Bio", 8, "Kunst", 8),
    ]
    courses = _make_courses()
    report = compute_score_report(assignments, courses)
    assert report.score_achieved == 32
    assert report.score_maximum == 32
    assert report.score_percent == 100.0
    assert report.score_label == "Exzellent"


def test_mixed_scores():
    """Students with varied scores."""
    assignments = [
        _make_assignment(1, "Anna", "Bio", 8, "Kunst", 6),  # prio 1 + prio 3
        _make_assignment(2, "Ben", "Chemie", 4, "Musik", 2),  # prio 5 + prio 7
    ]
    courses = _make_courses()
    report = compute_score_report(assignments, courses)
    assert report.score_achieved == 20  # 8+6+4+2
    assert report.score_maximum == 32
    assert report.score_percent == 62.5
    assert report.score_label == "Akzeptabel"


def test_student_scores():
    """Each student gets correct total and avg_priority."""
    assignments = [
        _make_assignment(1, "Anna", "Bio", 8, "Kunst", 6),  # prio 1 + 3 -> avg 2.0
        _make_assignment(2, "Ben", "Chemie", 4, "Musik", 2),  # prio 5 + 7 -> avg 6.0
    ]
    courses = _make_courses()
    report = compute_score_report(assignments, courses)
    anna = next(s for s in report.student_scores if s.student_nr == 1)
    ben = next(s for s in report.student_scores if s.student_nr == 2)
    assert anna.score_total == 14
    assert anna.avg_priority == 2.0
    assert ben.score_total == 6
    assert ben.avg_priority == 6.0


def test_course_scores():
    """Course scores include avg_priority and fill_rate."""
    assignments = [
        _make_assignment(1, "Anna", "Bio", 8, "Kunst", 6),
        _make_assignment(2, "Ben", "Bio", 6, "Kunst", 8),
    ]
    courses = _make_courses()
    report = compute_score_report(assignments, courses)
    bio = next(c for c in report.course_scores if c.name == "Bio")
    assert bio.student_count == 2
    assert bio.max_students == 26
    assert bio.fill_rate == round(2 / 26, 4)
    assert bio.avg_priority == 2.0  # (prio1 + prio3) / 2


def test_non_offered_courses_excluded():
    """Non-offered courses don't appear in course_scores."""
    assignments = [
        _make_assignment(1, "Anna", "Bio", 8, "Kunst", 8),
    ]
    courses = _make_courses()
    report = compute_score_report(assignments, courses)
    names = [c.name for c in report.course_scores]
    assert "Kochen" not in names


def test_empty_assignments():
    """No assignments -> zero scores."""
    courses = _make_courses()
    report = compute_score_report([], courses)
    assert report.score_achieved == 0
    assert report.score_maximum == 0
    assert report.score_percent == 0.0
    assert report.score_label == "Kritisch"


def test_score_labels():
    """Verify all label thresholds."""
    from app.scorer import _get_label
    assert _get_label(100.0) == ("Exzellent", "Fast alle Schueler in ihren Top-Wuenschen")
    assert _get_label(85.0) == ("Exzellent", "Fast alle Schueler in ihren Top-Wuenschen")
    assert _get_label(84.9) == ("Gut", "Die meisten Schueler in ihren Top-3-Wuenschen")
    assert _get_label(70.0) == ("Gut", "Die meisten Schueler in ihren Top-3-Wuenschen")
    assert _get_label(69.9) == ("Akzeptabel", "Einige Schueler mussten auf niedrigere Prioritaeten ausweichen")
    assert _get_label(55.0) == ("Akzeptabel", "Einige Schueler mussten auf niedrigere Prioritaeten ausweichen")
    assert _get_label(54.9) == ("Kritisch", "Viele Schueler haben ihre Wunschkurse nicht erhalten")
    assert _get_label(0.0) == ("Kritisch", "Viele Schueler haben ihre Wunschkurse nicht erhalten")
