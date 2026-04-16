from app.optimizer import run_full_optimization, run_assignment_optimization
from app.models import Student, Course, Assignment, SessionSettings
from app.settings_util import apply_settings_to_courses


def make_students(n: int, course_names: list[str]) -> list[Student]:
    """Erstellt n Schüler, jeder wählt die ersten 8 Kurse als Prio 1–8."""
    students = []
    for i in range(n):
        prefs = {c: 0 for c in course_names}
        for rank, course in enumerate(course_names[:8], start=1):
            prefs[course] = rank
        students.append(Student(
            nr=i + 1, name="", preferences=prefs, valid=True, errors=[]
        ))
    return students


def make_courses(names: list[str]) -> list[Course]:
    return [Course(name=n, max_students=16 if n == "Kochen" else 26) for n in names]


def make_courses_with_settings(names: list[str], settings: SessionSettings) -> list[Course]:
    cs = [Course(name=n) for n in names]
    apply_settings_to_courses(cs, settings)
    return cs


COURSE_NAMES = [
    "Body Percussion", "Debating", "Girls' Empowerment", "Häkeln",
    "History Hunters", "Improvisation", "Just Relax", "Kochen",
    "Medien", "Move&Groove", "Musik am Computer", "Podcast",
    "Psychologie", "Rhetorik", "Schach", "Stricken", "Theater", "Wirtschaft"
]


def test_full_optimization_selects_8_courses():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    settings = SessionSettings()
    updated_courses, assignments = run_full_optimization(students, courses, settings)
    offered = [c for c in updated_courses if c.offered]
    assert len(offered) == 8


def test_full_optimization_4_per_semester():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    settings = SessionSettings()
    updated_courses, _ = run_full_optimization(students, courses, settings)
    hj1 = [c for c in updated_courses if c.semester == 1]
    hj2 = [c for c in updated_courses if c.semester == 2]
    assert len(hj1) == 4
    assert len(hj2) == 4


def test_each_student_gets_one_course_per_semester():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    settings = SessionSettings()
    _, assignments = run_full_optimization(students, courses, settings)
    assert len(assignments) == 60
    for a in assignments:
        assert a.course_hj1 != ""
        assert a.course_hj2 != ""


def test_course_capacity_respected():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    settings = SessionSettings()
    updated_courses, assignments = run_full_optimization(students, courses, settings)
    for course in updated_courses:
        if not course.offered:
            continue
        count_hj1 = sum(1 for a in assignments if a.course_hj1 == course.name)
        count_hj2 = sum(1 for a in assignments if a.course_hj2 == course.name)
        total = count_hj1 + count_hj2
        if total > 0:
            assert total <= course.max_students
            assert total >= course.min_students


def test_assignment_only_optimization():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    courses[0].offered = True; courses[0].semester = 1
    courses[1].offered = True; courses[1].semester = 1
    courses[2].offered = True; courses[2].semester = 1
    courses[3].offered = True; courses[3].semester = 1
    courses[4].offered = True; courses[4].semester = 2
    courses[5].offered = True; courses[5].semester = 2
    courses[6].offered = True; courses[6].semester = 2
    courses[7].offered = True; courses[7].semester = 2
    settings = SessionSettings()
    assignments = run_assignment_optimization(students, courses, settings)
    assert len(assignments) == 60


def test_full_optimization_configurable_3_plus_5():
    settings = SessionSettings(hj1_count=3, hj2_count=5, default_max=22, default_min=1)
    students = make_students(60, COURSE_NAMES)
    courses = make_courses_with_settings(COURSE_NAMES, settings)
    updated, _ = run_full_optimization(students, courses, settings)
    hj1 = [c for c in updated if c.semester == 1]
    hj2 = [c for c in updated if c.semester == 2]
    assert len(hj1) == 3
    assert len(hj2) == 5


def test_full_optimization_configurable_1_plus_1():
    settings = SessionSettings(hj1_count=1, hj2_count=1, default_max=80, default_min=1)
    students = make_students(60, COURSE_NAMES)
    courses = make_courses_with_settings(COURSE_NAMES, settings)
    updated, _ = run_full_optimization(students, courses, settings)
    offered = [c for c in updated if c.offered]
    assert len(offered) == 2
    assert sum(1 for c in offered if c.semester == 1) == 1
    assert sum(1 for c in offered if c.semester == 2) == 1


def test_full_optimization_special_course_gets_special_max():
    """When a special course is offered, its max_students reflects special_max."""
    settings = SessionSettings(
        hj1_count=4, hj2_count=4,
        default_max=30, default_min=1,
        special_course="Kochen", special_max=5, special_min=1,
    )
    students = make_students(60, COURSE_NAMES)
    courses = make_courses_with_settings(COURSE_NAMES, settings)
    updated, _ = run_full_optimization(students, courses, settings)
    kochen = next(c for c in updated if c.name == "Kochen")
    assert kochen.max_students == 5


import pytest


def test_full_optimization_raises_when_not_enough_courses():
    """hj1+hj2 > number of courses should raise a clear ValueError."""
    settings = SessionSettings(hj1_count=5, hj2_count=5)
    students = make_students(20, COURSE_NAMES[:4])
    courses = make_courses_with_settings(COURSE_NAMES[:4], settings)
    with pytest.raises(ValueError, match="Nicht genug Kurse"):
        run_full_optimization(students, courses, settings)


def test_full_optimization_raises_when_not_enough_capacity():
    """(hj1+hj2) * max(default_max, special_max) < n_students should raise."""
    settings = SessionSettings(
        hj1_count=2, hj2_count=2, default_max=5, default_min=1,
        special_course=None, special_max=5, special_min=1,
    )
    # 2+2 courses * 5 max = 20 seats; 30 students → infeasible
    students = make_students(30, COURSE_NAMES)
    courses = make_courses_with_settings(COURSE_NAMES, settings)
    with pytest.raises(ValueError, match="Nicht genug Plätze"):
        run_full_optimization(students, courses, settings)
