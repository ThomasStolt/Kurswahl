from fastapi import APIRouter, HTTPException
from app import session

router = APIRouter(prefix="/api")


@router.get("/results")
def get_results():
    data = session.load()
    if not data.assignments:
        raise HTTPException(status_code=404, detail="Keine Ergebnisse vorhanden")

    by_course: dict[str, dict] = {}
    for course in data.courses:
        if not course.offered:
            continue
        by_course[course.name] = {
            "name": course.name,
            "semester": course.semester,
            "students": [],
            "avg_score": 0.0,
        }

    for a in data.assignments:
        if a.course_hj1 in by_course:
            by_course[a.course_hj1]["students"].append({
                "nr": a.student_nr, "name": a.student_name,
                "score": a.score_hj1, "semester": 1
            })
        if a.course_hj2 in by_course:
            by_course[a.course_hj2]["students"].append({
                "nr": a.student_nr, "name": a.student_name,
                "score": a.score_hj2, "semester": 2
            })

    for c in by_course.values():
        scores = [s["score"] for s in c["students"]]
        c["avg_score"] = round(sum(scores) / len(scores), 2) if scores else 0.0
        c["count"] = len(c["students"])

    return {
        "by_course": list(by_course.values()),
        "by_student": [a.model_dump() for a in data.assignments],
    }
