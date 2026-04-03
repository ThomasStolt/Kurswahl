from fastapi import APIRouter, HTTPException
from app import session
from app.optimizer import run_full_optimization, run_assignment_optimization
from app.scorer import compute_score_report

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
    offered = [c for c in data.courses if c.offered]
    if not offered:
        raise HTTPException(status_code=400, detail="Keine Kurse als 'angeboten' markiert")
    has_hj1 = any(c.semester == 1 for c in offered)
    has_hj2 = any(c.semester == 2 for c in offered)
    if not has_hj1 or not has_hj2:
        raise HTTPException(status_code=400, detail="Angebotene Kurse müssen beiden Halbjahren zugeordnet sein")
    try:
        assignments = run_assignment_optimization(data.students, data.courses)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    data.assignments = assignments
    session.save(data)
    report = compute_score_report(data.assignments, data.courses)
    return {"assignment_count": len(assignments), "score_report": report.model_dump()}
