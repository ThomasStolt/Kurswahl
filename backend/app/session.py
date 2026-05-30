import json
import logging
import os
from pathlib import Path
from app.models import SessionData

SESSION_FILE = Path("/data/session.json")
_log = logging.getLogger(__name__)


def load() -> SessionData:
    if SESSION_FILE.exists():
        try:
            return SessionData.model_validate_json(SESSION_FILE.read_text())
        except Exception as exc:
            _log.error("Corrupt session file, starting fresh: %s", exc)
            return SessionData()
    return SessionData()


def save(data: SessionData) -> None:
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = SESSION_FILE.with_suffix(".tmp")
    tmp.write_text(data.model_dump_json(indent=2))
    tmp.rename(SESSION_FILE)
