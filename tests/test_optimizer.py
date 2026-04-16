from app.optimizer import run_full_optimization, run_assignment_optimization
from app.models import Student, Course, Assignment


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


COURSE_NAMES = [
    "Body Percussion", "Debating", "Girls' Empowerment", "Häkeln",
    "History Hunters", "Improvisation", "Just Relax", "Kochen",
    "Medien", "Move&Groove", "Musik am Computer", "Podcast",
    "Psychologie", "Rhetorik", "Schach", "Stricken", "Theater", "Wirtschaft"
]


def test_full_optimization_selects_8_courses():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    updated_courses, assignments = run_full_optimization(students, courses)
    offered = [c for c in updated_courses if c.offered]
    assert len(offered) == 8


def test_full_optimization_4_per_semester():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    updated_courses, _ = run_full_optimization(students, courses)
    hj1 = [c for c in updated_courses if c.semester == 1]
    hj2 = [c for c in updated_courses if c.semester == 2]
    assert len(hj1) == 4
    assert len(hj2) == 4


def test_each_student_gets_one_course_per_semester():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    _, assignments = run_full_optimization(students, courses)
    assert len(assignments) == 60
    for a in assignments:
        assert a.course_hj1 != ""
        assert a.course_hj2 != ""


def test_course_capacity_respected():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    updated_courses, assignments = run_full_optimization(students, courses)
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
    assignments = run_assignment_optimization(students, courses)
    assert len(assignments) == 60
