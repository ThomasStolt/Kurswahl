from fastapi import APIRouter, HTTPException
from app import session
from app.optimizer import run_full_optimization, run_assignment_optimization

router = APIRouter(prefix="/api")


@router.post("/optimize")
def optimize_full():
    data = session.load()
    if not data.students:
        raise HTTPException(status_code=400, detail="Keine Schüler geladen")
    try:
        updated_courses, assignments = run_full_optimization(data.students, data.courses)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    data.courses = updated_courses
    data.assignments = assignments
    session.save(data)
    return {
        "offered": [c.model_dump() for c in updated_courses if c.offered],
        "assignment_count": len(assignments),
    }


@router.post("/optimize/assignments")
def optimize_assignments_only():
    data = session.load()
    if not any(c.offered for c in data.courses):
        raise HTTPException(status_code=400, detail="Keine Kurse als 'angeboten' markiert")
    try:
        assignments = run_assignment_optimization(data.students, data.courses)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    data.assignments = assignments
    session.save(data)
    return {"assignment_count": len(assignments)}
