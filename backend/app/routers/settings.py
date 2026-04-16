from fastapi import APIRouter, HTTPException
from app import session
from app.models import SessionSettings
from app.settings_util import apply_settings_to_courses

router = APIRouter(prefix="/api")


@router.get("/settings")
def get_settings():
    data = session.load()
    return {
        "settings": data.settings.model_dump(),
        "courses": [c.name for c in data.courses],
        "assignments_exist": len(data.assignments) > 0,
    }


@router.put("/settings")
def put_settings(payload: SessionSettings):
    # Pydantic has already coerced empty string to None via the validator.
    # Additional validation beyond Pydantic:
    errors = []
    if payload.hj1_count < 1:
        errors.append("hj1_count muss mindestens 1 sein.")
    if payload.hj2_count < 1:
        errors.append("hj2_count muss mindestens 1 sein.")
    if payload.default_min < 1:
        errors.append("default_min muss mindestens 1 sein.")
    if payload.default_max < 1:
        errors.append("default_max muss mindestens 1 sein.")
    if payload.special_min < 1:
        errors.append("special_min muss mindestens 1 sein.")
    if payload.special_max < 1:
        errors.append("special_max muss mindestens 1 sein.")
    if payload.default_min > payload.default_max:
        errors.append("default_min darf nicht größer als default_max sein.")
    if payload.special_min > payload.special_max:
        errors.append("special_min darf nicht größer als special_max sein.")

    data = session.load()
    course_names = {c.name for c in data.courses}
    if payload.special_course is not None and payload.special_course not in course_names:
        errors.append(
            f"Sonderkurs '{payload.special_course}' ist nicht in der Kursliste."
        )

    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors))

    changed = data.settings != payload
    data.settings = payload
    apply_settings_to_courses(data.courses, payload)

    assignments_cleared = False
    if changed and len(data.assignments) > 0:
        data.assignments = []
        for c in data.courses:
            c.offered = False
            c.semester = None
        assignments_cleared = True

    session.save(data)
    return {
        "settings": data.settings.model_dump(),
        "assignments_cleared": assignments_cleared,
    }
