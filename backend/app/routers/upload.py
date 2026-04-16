from fastapi import APIRouter, File, UploadFile, HTTPException
from app.models import Course
from app import session, parser
from app.settings_util import apply_settings_to_courses

router = APIRouter(prefix="/api")


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Nur CSV-Dateien erlaubt")

    MAX_BYTES = 5 * 1024 * 1024  # 5 MB
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Datei zu groß (max 5 MB)")

    try:
        students, course_names = parser.parse_csv(content)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"CSV konnte nicht verarbeitet werden: {exc}")

    courses = [Course(name=name) for name in course_names]

    data = session.load()
    # Reset special_course if it no longer appears in the CSV
    if data.settings.special_course is not None and data.settings.special_course not in course_names:
        data.settings.special_course = None
    # Apply current settings to the fresh course list (sets min/max per course)
    apply_settings_to_courses(courses, data.settings)

    data.students = students
    data.courses = courses
    data.assignments = []
    session.save(data)

    valid = [s for s in students if s.valid]
    invalid = [s for s in students if not s.valid]
    return {
        "total": len(students),
        "valid_count": len(valid),
        "invalid_count": len(invalid),
        "course_names": course_names,
    }
