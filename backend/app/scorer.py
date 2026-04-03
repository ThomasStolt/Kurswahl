from app.models import Assignment, Course, StudentScore, CourseScore, ScoreReport


def _get_label(percent: float) -> tuple[str, str]:
    if percent >= 85.0:
        return ("Exzellent", "Fast alle Schueler in ihren Top-Wuenschen")
    if percent >= 70.0:
        return ("Gut", "Die meisten Schueler in ihren Top-3-Wuenschen")
    if percent >= 55.0:
        return ("Akzeptabel", "Einige Schueler mussten auf niedrigere Prioritaeten ausweichen")
    return ("Kritisch", "Viele Schueler haben ihre Wunschkurse nicht erhalten")


def _score_to_prio(score: int) -> float:
    """Convert internal score (1-8) to priority (8-1). Returns 0.0 for score <= 0."""
    return float(9 - score) if score > 0 else 0.0


def compute_score_report(
    assignments: list[Assignment],
    courses: list[Course],
) -> ScoreReport:
    score_achieved = sum(a.score_hj1 + a.score_hj2 for a in assignments)
    score_maximum = len(assignments) * 16  # 8 per semester * 2
    score_percent = round(score_achieved / score_maximum * 100, 1) if score_maximum > 0 else 0.0
    label, description = _get_label(score_percent)

    student_scores = []
    for a in assignments:
        total = a.score_hj1 + a.score_hj2
        prio1 = _score_to_prio(a.score_hj1)
        prio2 = _score_to_prio(a.score_hj2)
        avg_p = round((prio1 + prio2) / 2, 1) if (prio1 > 0 and prio2 > 0) else 0.0
        student_scores.append(StudentScore(
            student_nr=a.student_nr,
            student_name=a.student_name,
            score_total=total,
            avg_priority=avg_p,
        ))

    offered = {c.name: c for c in courses if c.offered and c.semester}
    course_data: dict[str, list[float]] = {name: [] for name in offered}
    for a in assignments:
        if a.course_hj1 in course_data:
            course_data[a.course_hj1].append(_score_to_prio(a.score_hj1))
        if a.course_hj2 in course_data:
            course_data[a.course_hj2].append(_score_to_prio(a.score_hj2))

    course_scores = []
    for name, prios in course_data.items():
        c = offered[name]
        count = len(prios)
        course_scores.append(CourseScore(
            name=name,
            semester=c.semester,
            avg_priority=round(sum(prios) / count, 1) if count > 0 else 0.0,
            student_count=count,
            max_students=c.max_students,
            fill_rate=round(count / c.max_students, 4) if c.max_students > 0 else 0.0,
        ))

    return ScoreReport(
        score_achieved=score_achieved,
        score_maximum=score_maximum,
        score_percent=score_percent,
        score_label=label,
        score_description=description,
        student_scores=student_scores,
        course_scores=course_scores,
    )
