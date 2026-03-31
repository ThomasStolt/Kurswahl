import json
import os
from pathlib import Path
from app.models import SessionData

SESSION_FILE = Path("/data/session.json")


def load() -> SessionData:
    if SESSION_FILE.exists():
        try:
            return SessionData.model_validate_json(SESSION_FILE.read_text())
        except Exception:
            return SessionData()
    return SessionData()


def save(data: SessionData) -> None:
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = SESSION_FILE.with_suffix(".tmp")
    tmp.write_text(data.model_dump_json(indent=2))
    tmp.rename(SESSION_FILE)
