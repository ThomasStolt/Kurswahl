import csv
import io
from app.models import Student


def validate_student(nr: int, name: str, raw_prefs: dict[str, int]) -> Student:
    errors = []
    prefs: dict[str, int] = {}

    for course, val in raw_prefs.items():
        if val < 0 or val > 8:
            errors.append(f"Ungültiger Wert {val} für Kurs '{course}' (erlaubt: 0–8)")
        prefs[course] = val

    non_zero = [v for v in prefs.values() if v != 0]
    if len(non_zero) != 8:
        errors.append(f"Genau 8 Prioritäten erwartet, {len(non_zero)} gefunden")

    seen: dict[int, list[str]] = {}
    for course, val in prefs.items():
        if val > 0:
            seen.setdefault(val, []).append(course)
    for prio, courses in seen.items():
        if len(courses) > 1:
            errors.append(f"Priorität {prio} mehrfach vergeben: {', '.join(courses)}")

    return Student(
        nr=nr,
        name=name,
        preferences=prefs,
        valid=len(errors) == 0,
        errors=errors,
    )


def parse_csv(content: bytes) -> tuple[list[Student], list[str]]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    course_names = [f for f in reader.fieldnames if f and f != "Nr."]
    students: list[Student] = []

    for row in reader:
        nr_raw = row.get("Nr.", "").strip()
        if not nr_raw:
            continue
        values = [row.get(c, "").strip() for c in course_names]
        if all(v == "" for v in values):
            continue  # Leere Zeile still ignorieren

        raw_prefs: dict[str, int] = {}
        for course in course_names:
            raw = row.get(course, "").strip()
            try:
                raw_prefs[course] = int(raw) if raw != "" else 0
            except ValueError:
                raw_prefs[course] = -1  # Wird als ungültig erkannt

        try:
            nr = int(nr_raw)
        except ValueError:
            continue
        students.append(validate_student(nr=nr, name="", raw_prefs=raw_prefs))

    return students, course_names
