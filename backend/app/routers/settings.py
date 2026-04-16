from fastapi import APIRouter
from app import session

router = APIRouter(prefix="/api")


@router.get("/settings")
def get_settings():
    data = session.load()
    return {
        "settings": data.settings.model_dump(),
        "courses": [c.name for c in data.courses],
        "assignments_exist": len(data.assignments) > 0,
    }
