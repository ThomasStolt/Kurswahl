import sys
import traceback
from fastapi import APIRouter, HTTPException
from app import session
from app.optimizer import run_full_optimization, run_assignment_optimization
from app.scorer import compute_score_report

router = APIRouter(prefix="/api")


def _log(msg: str) -> None:
    print(f"[OPTIMIZE] {msg}", file=sys.stderr, flush=True)


@router.post("/optimize")
def optimize_full():
    _log("POST /api/optimize received")
    data = session.load()
    _log(f"session loaded: {len(data.students)} students, {len(data.courses)} courses")
    valid = [s for s in data.students if s.valid]
    _log(f"valid students: {len(valid)}")
    if not data.students:
        _log("ERROR: no students loaded")
        raise HTTPException(status_code=400, detail="Keine Schüler geladen")
    try:
        _log("calling run_full_optimization...")
        updated_courses, assignments = run_full_optimization(
            data.students, data.courses, data.settings
        )
        _log(f"optimization returned: {sum(1 for c in updated_courses if c.offered)} offered courses, {len(assignments)} assignments")
    except ValueError as exc:
        _log(f"ValueError from optimizer: {exc}")
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        _log(f"UNEXPECTED EXCEPTION: {type(exc).__name__}: {exc}")
        _log(traceback.format_exc())
        raise
    data.courses = updated_courses
    data.assignments = assignments
    session.save(data)
    _log("session saved, returning success")
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
    hj1_count = sum(1 for c in offered if c.semester == 1)
    hj2_count = sum(1 for c in offered if c.semester == 2)
    if hj1_count != data.settings.hj1_count or hj2_count != data.settings.hj2_count:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Halbjahr-Verteilung stimmt nicht mit Einstellungen überein: "
                f"aktuell {hj1_count}+{hj2_count}, erwartet "
                f"{data.settings.hj1_count}+{data.settings.hj2_count}"
            ),
        )
    try:
        assignments = run_assignment_optimization(data.students, data.courses, data.settings)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    data.assignments = assignments
    session.save(data)
    report = compute_score_report(data.assignments, data.courses)
    return {"assignment_count": len(assignments), "score_report": report.model_dump()}
