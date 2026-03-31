from fastapi import APIRouter, File, UploadFile, HTTPException
from app.models import Course
from app import session, parser

router = APIRouter(prefix="/api")

COURSE_CAPS: dict[str, int] = {"Kochen": 16}


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Nur CSV-Dateien erlaubt")

    content = await file.read()
    students, course_names = parser.parse_csv(content)

    courses = [
        Course(
            name=name,
            max_students=COURSE_CAPS.get(name, 22),
        )
        for name in course_names
    ]

    data = session.load()
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
