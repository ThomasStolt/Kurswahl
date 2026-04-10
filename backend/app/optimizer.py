import os
import sys
import time
from pulp import (
    LpProblem, LpMaximize, LpVariable, lpSum, LpBinary, LpStatus, value, PULP_CBC_CMD
)
from app.models import Student, Course, Assignment

SOLVER_TIME_LIMIT = int(os.environ.get("KURSWAHL_SOLVER_TIME_LIMIT", "240"))
SOLVER_THREADS = int(os.environ.get("KURSWAHL_SOLVER_THREADS", "4"))


def _log(msg: str) -> None:
    print(f"[OPTIMIZER] {msg}", file=sys.stderr, flush=True)


def _build_solver() -> PULP_CBC_CMD:
    return PULP_CBC_CMD(msg=0, timeLimit=SOLVER_TIME_LIMIT, threads=SOLVER_THREADS)


def _build_score(students: list[Student], course_names: list[str]) -> dict:
    """Berechnet den Zufriedenheitsscore pro Schüler-Kurs-Kombination."""
    score = {}
    for i, s in enumerate(students):
        for c in course_names:
            prio = s.preferences.get(c, 0)
            score[(i, c)] = (9 - prio) if prio > 0 else -5
    return score


def run_full_optimization(
    students: list[Student], courses: list[Course]
) -> tuple[list[Course], list[Assignment]]:
    """
    Volloptimierung: wählt 8 Kurse (4 pro HJ) und teilt Schüler zu.
    Gibt aktualisierte Kursliste und Zuteilungen zurück.
    """
    _log(f"run_full_optimization: {len(students)} students, {len(courses)} courses")
    valid = [s for s in students if s.valid]
    course_names = [c.name for c in courses]
    max_cap = {c.name: c.max_students for c in courses}
    min_cap = {c.name: c.min_students for c in courses}
    _log(f"building score matrix ({len(valid)} valid x {len(course_names)} courses)")
    score = _build_score(valid, course_names)

    prob = LpProblem("Kurswahl_Full", LpMaximize)
    S = range(len(valid))

    _log("creating LP variables")
    offer  = {c: LpVariable(f"offer_{i}",  cat=LpBinary) for i, c in enumerate(course_names)}
    in_hj1 = {c: LpVariable(f"hj1_{i}",   cat=LpBinary) for i, c in enumerate(course_names)}
    in_hj2 = {c: LpVariable(f"hj2_{i}",   cat=LpBinary) for i, c in enumerate(course_names)}
    a1 = {(s, c): LpVariable(f"a1_{s}_{i}", cat=LpBinary)
          for s in S for i, c in enumerate(course_names)}
    a2 = {(s, c): LpVariable(f"a2_{s}_{i}", cat=LpBinary)
          for s in S for i, c in enumerate(course_names)}
    _log(f"variables created: {len(offer)+len(in_hj1)+len(in_hj2)+len(a1)+len(a2)} total")

    # Zielfunktion
    prob += lpSum(score[(s, c)] * (a1[(s, c)] + a2[(s, c)])
                  for s in S for c in course_names)

    # Kurs-Constraints
    prob += lpSum(offer[c] for c in course_names) == 8
    prob += lpSum(in_hj1[c] for c in course_names) == 4
    for c in course_names:
        prob += in_hj1[c] + in_hj2[c] == offer[c]

    # Kapazitäts-Constraints
    for c in course_names:
        n1 = lpSum(a1[(s, c)] for s in S)
        n2 = lpSum(a2[(s, c)] for s in S)
        prob += n1 <= max_cap[c] * in_hj1[c]
        prob += n1 >= min_cap[c] * in_hj1[c]
        prob += n2 <= max_cap[c] * in_hj2[c]
        prob += n2 >= min_cap[c] * in_hj2[c]

    # Schüler-Constraints
    for s in S:
        prob += lpSum(a1[(s, c)] for c in course_names) == 1
        prob += lpSum(a2[(s, c)] for c in course_names) == 1
        for c in course_names:
            prob += a1[(s, c)] <= in_hj1[c]
            prob += a2[(s, c)] <= in_hj2[c]

    _log(f"constraints built, calling CBC solver (timeLimit={SOLVER_TIME_LIMIT}s, threads={SOLVER_THREADS})")
    t0 = time.time()
    status = prob.solve(_build_solver())
    _log(f"CBC returned after {time.time() - t0:.2f}s: status={LpStatus[status]}")
    if LpStatus[status] != "Optimal":
        raise ValueError(f"Optimierung fehlgeschlagen: {LpStatus[status]} — zu wenige Schüler oder ungültige Kapazitäten")

    # Ergebnisse auslesen
    updated_courses = []
    for course in courses:
        c = course.model_copy()
        c.offered = bool(round(value(offer[c.name])))
        if c.offered:
            c.semester = 1 if round(value(in_hj1[c.name])) else 2
        else:
            c.semester = None
        updated_courses.append(c)

    assignments = _build_assignments(valid, updated_courses, a1, a2, score)
    return updated_courses, assignments


def run_assignment_optimization(
    students: list[Student], courses: list[Course]
) -> list[Assignment]:
    """
    Nur Schülerzuteilung neu berechnen — Kurs/HJ-Konfiguration ist fix.
    """
    valid = [s for s in students if s.valid]
    hj1 = [c.name for c in courses if c.offered and c.semester == 1]
    hj2 = [c.name for c in courses if c.offered and c.semester == 2]
    max_cap = {c.name: c.max_students for c in courses}
    min_cap = {c.name: c.min_students for c in courses}
    score = _build_score(valid, hj1 + hj2)

    prob = LpProblem("Kurswahl_Assign", LpMaximize)
    S = range(len(valid))

    a1 = {(s, c): LpVariable(f"a1_{s}_{c}", cat=LpBinary) for s in S for c in hj1}
    a2 = {(s, c): LpVariable(f"a2_{s}_{c}", cat=LpBinary) for s in S for c in hj2}

    prob += lpSum(score[(s, c)] * a1[(s, c)] for s in S for c in hj1) + \
           lpSum(score[(s, c)] * a2[(s, c)] for s in S for c in hj2)

    for c in hj1:
        n = lpSum(a1[(s, c)] for s in S)
        prob += n <= max_cap[c]
        prob += n >= min_cap[c]
    for c in hj2:
        n = lpSum(a2[(s, c)] for s in S)
        prob += n <= max_cap[c]
        prob += n >= min_cap[c]
    for s in S:
        prob += lpSum(a1[(s, c)] for c in hj1) == 1
        prob += lpSum(a2[(s, c)] for c in hj2) == 1

    status = prob.solve(_build_solver())
    if LpStatus[status] != "Optimal":
        raise ValueError(f"Zuteilung fehlgeschlagen: {LpStatus[status]} — Kurskapazitäten überprüfen")

    # Dummy-Variablen-Mapping für _build_assignments
    a1_all = {(s, c): a1[(s, c)] for s in S for c in hj1}
    a2_all = {(s, c): a2[(s, c)] for s in S for c in hj2}
    return _build_assignments(valid, courses, a1_all, a2_all, score)


def _build_assignments(
    students, courses, a1, a2, score
) -> list[Assignment]:
    hj1_names = {c.name for c in courses if c.offered and c.semester == 1}
    hj2_names = {c.name for c in courses if c.offered and c.semester == 2}

    assignments = []
    for s_idx, student in enumerate(students):
        c_hj1 = next(
            (c for c in hj1_names if (s_idx, c) in a1 and round(value(a1[(s_idx, c)])) == 1),
            ""
        )
        c_hj2 = next(
            (c for c in hj2_names if (s_idx, c) in a2 and round(value(a2[(s_idx, c)])) == 1),
            ""
        )
        assignments.append(Assignment(
            student_nr=student.nr,
            student_name=student.name,
            course_hj1=c_hj1,
            course_hj2=c_hj2,
            score_hj1=max(0, score.get((s_idx, c_hj1), 0)),
            score_hj2=max(0, score.get((s_idx, c_hj2), 0)),
        ))
    return assignments
