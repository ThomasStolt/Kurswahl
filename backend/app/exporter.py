import csv
import io
import openpyxl
from app.models import Assignment

HEADERS = ["Nr.", "Name", "Kurs HJ1", "Prio HJ1", "Kurs HJ2", "Prio HJ2"]


def _score_to_prio(score: int) -> str:
    if score <= 0:
        return "–"
    return str(9 - score)


def to_csv(assignments: list[Assignment]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(HEADERS)
    for a in sorted(assignments, key=lambda x: x.student_nr):
        writer.writerow([
            a.student_nr, a.student_name,
            a.course_hj1, _score_to_prio(a.score_hj1),
            a.course_hj2, _score_to_prio(a.score_hj2),
        ])
    return buf.getvalue().encode("utf-8-sig")


def to_excel(assignments: list[Assignment]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Zuteilung"
    ws.append(HEADERS)
    for a in sorted(assignments, key=lambda x: x.student_nr):
        ws.append([
            a.student_nr, a.student_name,
            a.course_hj1, _score_to_prio(a.score_hj1),
            a.course_hj2, _score_to_prio(a.score_hj2),
        ])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()
