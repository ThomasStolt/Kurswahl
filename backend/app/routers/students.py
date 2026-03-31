from fastapi import APIRouter, HTTPException
from app import session
from app.models import StudentUpdate

router = APIRouter(prefix="/api")


@router.get("/students")
def get_students():
    return session.load().students


@router.patch("/students/{nr}")
def update_student(nr: int, update: StudentUpdate):
    data = session.load()
    student = next((s for s in data.students if s.nr == nr), None)
    if not student:
        raise HTTPException(status_code=404, detail="Schüler nicht gefunden")

    if update.name is not None:
        student.name = update.name
    if update.preferences is not None:
        from app.parser import validate_student
        updated = validate_student(student.nr, student.name, update.preferences)
        student.preferences = updated.preferences
        student.valid = updated.valid
        student.errors = updated.errors

    session.save(data)
    return student
