from fastapi import APIRouter, HTTPException
from app import session
from app.models import CourseStats, CourseUpdate

router = APIRouter(prefix="/api")


@router.get("/courses", response_model=list[CourseStats])
def get_courses():
    data = session.load()
    result = []
    for course in data.courses:
        demand: dict[int, int] = {}
        total_interested = 0
        for student in data.students:
            prio = student.preferences.get(course.name, 0)
            if prio > 0:
                demand[prio] = demand.get(prio, 0) + 1
                total_interested += 1
        result.append(CourseStats(
            **course.model_dump(),
            demand=demand,
            total_interested=total_interested,
        ))
    return result


@router.patch("/courses/{name}")
def update_course(name: str, update: CourseUpdate):
    data = session.load()
    course = next((c for c in data.courses if c.name == name), None)
    if not course:
        raise HTTPException(status_code=404, detail="Kurs nicht gefunden")
    if update.offered is not None:
        course.offered = update.offered
    if update.semester is not None:
        course.semester = update.semester
    session.save(data)
    return course
