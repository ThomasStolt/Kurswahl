import json
from pathlib import Path
from app.models import SessionData

SESSION_FILE = Path("/data/session.json")


def load() -> SessionData:
    if SESSION_FILE.exists():
        return SessionData.model_validate_json(SESSION_FILE.read_text())
    return SessionData()


def save(data: SessionData) -> None:
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    SESSION_FILE.write_text(data.model_dump_json(indent=2))
