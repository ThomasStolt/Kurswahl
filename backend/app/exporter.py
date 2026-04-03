import csv
import io
import openpyxl
from app.models import Assignment, Course
from app.scorer import compute_score_report

HEADERS = ["Nr.", "Name", "Kurs HJ1", "Prio HJ1", "Kurs HJ2", "Prio HJ2", "Gesamt-Score", "Oe Prioritaet"]


def _score_to_prio(score: int) -> str:
    if score <= 0:
        return "–"
    return str(9 - score)


def _summary_lines(report):
    return [
        [f"Zufriedenheit: {report.score_percent}% — {report.score_label}"],
        [report.score_description],
        [f"Score: {report.score_achieved}/{report.score_maximum}"],
        [],
    ]


def to_csv(assignments: list[Assignment], courses: list[Course]) -> bytes:
    report = compute_score_report(assignments, courses)
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    for row in _summary_lines(report):
        writer.writerow(row)
    writer.writerow(HEADERS)
    score_map = {s.student_nr: s for s in report.student_scores}
    for a in sorted(assignments, key=lambda x: x.student_nr):
        ss = score_map.get(a.student_nr)
        total = ss.score_total if ss else 0
        avg_p = ss.avg_priority if ss else 0.0
        writer.writerow([
            a.student_nr, a.student_name,
            a.course_hj1, _score_to_prio(a.score_hj1),
            a.course_hj2, _score_to_prio(a.score_hj2),
            total, avg_p,
        ])
    return buf.getvalue().encode("utf-8-sig")


def to_excel(assignments: list[Assignment], courses: list[Course]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Zuteilung"
    report = compute_score_report(assignments, courses)
    for row in _summary_lines(report):
        ws.append(row)
    ws.append(HEADERS)
    score_map = {s.student_nr: s for s in report.student_scores}
    for a in sorted(assignments, key=lambda x: x.student_nr):
        ss = score_map.get(a.student_nr)
        total = ss.score_total if ss else 0
        avg_p = ss.avg_priority if ss else 0.0
        ws.append([
            a.student_nr, a.student_name,
            a.course_hj1, _score_to_prio(a.score_hj1),
            a.course_hj2, _score_to_prio(a.score_hj2),
            total, avg_p,
        ])

    # Second sheet: course overview
    ws2 = wb.create_sheet("Kursuebersicht")
    ws2.append(["Kurs", "Halbjahr", "Schueler", "Max", "Auslastung", "Oe Prioritaet"])
    for cs in sorted(report.course_scores, key=lambda c: (c.semester, c.name)):
        ws2.append([
            cs.name,
            cs.semester,
            cs.student_count,
            cs.max_students,
            round(cs.fill_rate * 100, 1),
            cs.avg_priority,
        ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()
