# Konfigurierbare Rahmenbedingungen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make course counts per semester (HJ1, HJ2), default course capacities, and a user-selectable special course's capacities configurable on page 1 (UploadPage) — replacing the current hard-coded values `offer == 8`, `hj1 == 4`, `max_students = 26`, `min_students = 15`, and `Kochen → 16`.

**Architecture:** Introduce a `SessionSettings` Pydantic model stored in `SessionData` and persisted via the existing `/data/session.json` flow. A helper `apply_settings_to_courses` keeps `Course.min_students` / `Course.max_students` in sync with settings. The solver receives `SessionSettings` explicitly. A new `/api/settings` router exposes GET + PUT; the frontend's UploadPage grows a settings form and replaces the auto-redirect with an explicit "Weiter zum Editor" button.

**Tech Stack:** Python 3, FastAPI, Pydantic, PuLP/CBC (backend); React 18 + TypeScript + Tailwind (frontend); pytest (backend tests). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-16-konfigurierbare-rahmenbedingungen-design.md`

---

## File Structure

**Backend (modify):**
- `backend/app/models.py` — add `SessionSettings`; add `settings` field to `SessionData`
- `backend/app/optimizer.py` — add `settings` parameter, pre-solve checks, swap hard-coded counts for settings
- `backend/app/main.py` — include new settings router
- `backend/app/routers/upload.py` — remove `COURSE_CAPS` dict, call `apply_settings_to_courses`, normalize `settings.special_course`
- `backend/app/routers/optimize.py` — pass settings into solver calls, generalize HJ-distribution invariant

**Backend (create):**
- `backend/app/settings_util.py` — the `apply_settings_to_courses` helper (not in `session.py` to avoid circular import risk and to keep `session.py` focused on I/O)
- `backend/app/routers/settings.py` — GET and PUT `/api/settings`

**Frontend (modify):**
- `frontend/src/types.ts` — `SessionSettings`, `SettingsResponse`
- `frontend/src/api.ts` — `getSettings`, `updateSettings`
- `frontend/src/pages/UploadPage.tsx` — rewrite to include settings form + explicit "Weiter" button
- `frontend/src/pages/ConstraintsPage.tsx` — text updates

**Tests (modify):**
- `tests/test_optimizer.py` — add configurable-HJ tests
- `tests/test_api.py` — add `/api/settings` tests, update affected existing tests
- `tests/conftest.py` — `make_courses` needs optional caps (no fixed `Kochen=16` hard-code if test uses settings path)

**Tests (create):**
- `tests/test_settings_util.py` — `apply_settings_to_courses` behavior

**Docs (modify):**
- `CHANGELOG.md` — breaking-change entry
- `README.md` — one-line note about configurable constraints

---

## Task 1: Add `SessionSettings` model and wire it into `SessionData`

**Files:**
- Modify: `backend/app/models.py`
- Create: `tests/test_settings_util.py`

- [ ] **Step 1.1: Write failing model test**

Create `tests/test_settings_util.py`:

```python
from app.models import SessionSettings, SessionData


def test_session_settings_defaults():
    s = SessionSettings()
    assert s.hj1_count == 4
    assert s.hj2_count == 4
    assert s.default_max == 22
    assert s.default_min == 1
    assert s.special_course is None
    assert s.special_max == 14
    assert s.special_min == 1


def test_session_data_has_default_settings():
    data = SessionData()
    assert isinstance(data.settings, SessionSettings)
    assert data.settings.hj1_count == 4


def test_session_data_accepts_json_without_settings_field():
    """Old session.json files (pre-feature) must still load."""
    data = SessionData.model_validate_json('{"students": [], "courses": [], "assignments": []}')
    assert data.settings.hj1_count == 4
    assert data.settings.default_max == 22


def test_session_settings_special_course_empty_string_normalized():
    """Empty string for special_course is normalized to None."""
    s = SessionSettings(special_course="")
    assert s.special_course is None
```

- [ ] **Step 1.2: Run test, verify it fails**

Run: `cd backend && pytest ../tests/test_settings_util.py -v`
Expected: FAIL with ImportError `cannot import name 'SessionSettings' from 'app.models'`

- [ ] **Step 1.3: Implement `SessionSettings` and extend `SessionData`**

Edit `backend/app/models.py`. Add after the `Course` class and before `CourseStats`:

```python
from pydantic import BaseModel, Field, field_validator
from typing import Optional


class SessionSettings(BaseModel):
    hj1_count: int = 4
    hj2_count: int = 4
    default_max: int = 22
    default_min: int = 1
    special_course: Optional[str] = None
    special_max: int = 14
    special_min: int = 1

    @field_validator("special_course", mode="before")
    @classmethod
    def _empty_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v
```

Then modify the existing `SessionData` class:

```python
class SessionData(BaseModel):
    students: list[Student] = []
    courses: list[Course] = []
    assignments: list[Assignment] = []
    settings: SessionSettings = Field(default_factory=SessionSettings)
```

Note: `Field` may already be imported; if not, add it. `Optional` likewise. Check the imports at top of `models.py` and add what's missing.

- [ ] **Step 1.4: Run test, verify it passes**

Run: `cd backend && pytest ../tests/test_settings_util.py -v`
Expected: 4 tests PASS.

- [ ] **Step 1.5: Verify no existing test regressed**

Run: `cd backend && pytest`
Expected: All pre-existing tests still PASS.

- [ ] **Step 1.6: Commit**

```bash
git add backend/app/models.py tests/test_settings_util.py
git commit -m "feat: add SessionSettings model to SessionData"
```

---

## Task 2: Add `apply_settings_to_courses` helper

**Files:**
- Create: `backend/app/settings_util.py`
- Modify: `tests/test_settings_util.py`

- [ ] **Step 2.1: Write failing helper tests**

Append to `tests/test_settings_util.py`:

```python
from app.models import Course
from app.settings_util import apply_settings_to_courses


def _courses(names):
    return [Course(name=n) for n in names]


def test_apply_no_special_course_all_defaults():
    s = SessionSettings(default_min=3, default_max=20)
    cs = _courses(["A", "B", "C"])
    apply_settings_to_courses(cs, s)
    for c in cs:
        assert c.min_students == 3
        assert c.max_students == 20


def test_apply_named_special_course():
    s = SessionSettings(
        default_min=5, default_max=25,
        special_course="Kochen", special_min=2, special_max=14,
    )
    cs = _courses(["A", "Kochen", "B"])
    apply_settings_to_courses(cs, s)
    assert cs[0].min_students == 5 and cs[0].max_students == 25
    assert cs[1].min_students == 2 and cs[1].max_students == 14
    assert cs[2].min_students == 5 and cs[2].max_students == 25


def test_apply_special_course_not_in_list_silently_ignored():
    """If special_course names a course not in the list, no exception, all defaults."""
    s = SessionSettings(special_course="Kochen", special_max=14)
    cs = _courses(["A", "B"])
    apply_settings_to_courses(cs, s)  # must not raise
    for c in cs:
        assert c.max_students == s.default_max


def test_apply_is_idempotent():
    s = SessionSettings(special_course="Kochen", special_max=14, default_max=22)
    cs = _courses(["A", "Kochen"])
    apply_settings_to_courses(cs, s)
    apply_settings_to_courses(cs, s)
    assert cs[0].max_students == 22
    assert cs[1].max_students == 14
```

- [ ] **Step 2.2: Run test, verify it fails**

Run: `cd backend && pytest ../tests/test_settings_util.py -v`
Expected: 4 new tests FAIL with `ImportError: cannot import name 'apply_settings_to_courses'`.

- [ ] **Step 2.3: Implement the helper**

Create `backend/app/settings_util.py`:

```python
from app.models import Course, SessionSettings


def apply_settings_to_courses(
    courses: list[Course], settings: SessionSettings
) -> None:
    """Set min_students/max_students on each course from the settings.

    The course whose name matches settings.special_course receives the
    special_min/special_max values; all others receive default_min/default_max.
    If settings.special_course is None or does not match any course in the list,
    every course receives the default values (silent no-op for unknown names).
    """
    for c in courses:
        if settings.special_course is not None and c.name == settings.special_course:
            c.min_students = settings.special_min
            c.max_students = settings.special_max
        else:
            c.min_students = settings.default_min
            c.max_students = settings.default_max
```

- [ ] **Step 2.4: Run test, verify it passes**

Run: `cd backend && pytest ../tests/test_settings_util.py -v`
Expected: 8 tests PASS total.

- [ ] **Step 2.5: Commit**

```bash
git add backend/app/settings_util.py tests/test_settings_util.py
git commit -m "feat: add apply_settings_to_courses helper"
```

---

## Task 3: Make `run_full_optimization` use configurable HJ counts

**Files:**
- Modify: `backend/app/optimizer.py`
- Modify: `tests/test_optimizer.py`
- Modify: `tests/conftest.py`

- [ ] **Step 3.1: Update test fixture to build settings-aware courses**

The existing `make_courses` in `tests/test_optimizer.py` hard-codes `max_students=16 if n == "Kochen" else 26`. Keep it as-is for backwards compatibility but add a new helper that builds settings-first:

Edit `tests/test_optimizer.py`. Add near the top after the existing helpers:

```python
from app.models import SessionSettings
from app.settings_util import apply_settings_to_courses


def make_courses_with_settings(names: list[str], settings: SessionSettings) -> list[Course]:
    cs = [Course(name=n) for n in names]
    apply_settings_to_courses(cs, settings)
    return cs
```

- [ ] **Step 3.2: Write failing tests for configurable counts**

Append to `tests/test_optimizer.py`:

```python
def test_full_optimization_configurable_3_plus_5():
    settings = SessionSettings(hj1_count=3, hj2_count=5, default_max=22, default_min=1)
    students = make_students(60, COURSE_NAMES)
    courses = make_courses_with_settings(COURSE_NAMES, settings)
    updated, _ = run_full_optimization(students, courses, settings)
    hj1 = [c for c in updated if c.semester == 1]
    hj2 = [c for c in updated if c.semester == 2]
    assert len(hj1) == 3
    assert len(hj2) == 5


def test_full_optimization_configurable_1_plus_1():
    settings = SessionSettings(hj1_count=1, hj2_count=1, default_max=80, default_min=1)
    students = make_students(60, COURSE_NAMES)
    courses = make_courses_with_settings(COURSE_NAMES, settings)
    updated, _ = run_full_optimization(students, courses, settings)
    offered = [c for c in updated if c.offered]
    assert len(offered) == 2
    assert sum(1 for c in offered if c.semester == 1) == 1
    assert sum(1 for c in offered if c.semester == 2) == 1


def test_full_optimization_special_course_gets_special_max():
    """When a special course is offered, its max_students reflects special_max."""
    settings = SessionSettings(
        hj1_count=4, hj2_count=4,
        default_max=30, default_min=1,
        special_course="Kochen", special_max=5, special_min=1,
    )
    students = make_students(60, COURSE_NAMES)
    courses = make_courses_with_settings(COURSE_NAMES, settings)
    updated, _ = run_full_optimization(students, courses, settings)
    kochen = next(c for c in updated if c.name == "Kochen")
    assert kochen.max_students == 5
```

- [ ] **Step 3.3: Update existing tests to pass settings**

The existing tests call `run_full_optimization(students, courses)` without settings. They need updating.

In `tests/test_optimizer.py`, find and update every call to `run_full_optimization(...)` and `run_assignment_optimization(...)`:

```python
# Before:
updated_courses, assignments = run_full_optimization(students, courses)
# After:
settings = SessionSettings()  # defaults
updated_courses, assignments = run_full_optimization(students, courses, settings)
```

Do the same for `run_assignment_optimization`. Existing tests validating "exactly 8 courses" / "4 per semester" remain valid under default settings — they test the default configuration.

- [ ] **Step 3.4: Run tests, verify new tests fail and existing ones may break on signature**

Run: `cd backend && pytest ../tests/test_optimizer.py -v`
Expected: The new tests and any existing tests you updated FAIL with `TypeError: run_full_optimization() takes 2 positional arguments but 3 were given` or similar signature mismatch.

- [ ] **Step 3.5: Update optimizer signatures and constraints**

Edit `backend/app/optimizer.py`.

Update imports (top of file):

```python
from app.models import Student, Course, Assignment, SessionSettings
```

Update `run_full_optimization`:

```python
def run_full_optimization(
    students: list[Student], courses: list[Course], settings: SessionSettings
) -> tuple[list[Course], list[Assignment]]:
    """
    Volloptimierung: wählt Kurse gemäß settings.hj{1,2}_count und teilt Schüler zu.
    """
    _log(f"run_full_optimization: {len(students)} students, {len(courses)} courses, "
         f"hj1={settings.hj1_count}, hj2={settings.hj2_count}")
    valid = [s for s in students if s.valid]
    course_names = [c.name for c in courses]
    max_cap = {c.name: c.max_students for c in courses}
    min_cap = {c.name: c.min_students for c in courses}
    _log(f"building score matrix ({len(valid)} valid x {len(course_names)} courses)")
    score = _build_score(valid, course_names)

    prob = LpProblem("Kurswahl_Full", LpMaximize)
    S = range(len(valid))

    _log("creating LP variables")
    offer  = {c: LpVariable(f"offer_{i}",  cat=LpBinary) for i, c in enumerate(course_names)}
    in_hj1 = {c: LpVariable(f"hj1_{i}",   cat=LpBinary) for i, c in enumerate(course_names)}
    in_hj2 = {c: LpVariable(f"hj2_{i}",   cat=LpBinary) for i, c in enumerate(course_names)}
    a1 = {(s, c): LpVariable(f"a1_{s}_{i}", cat=LpBinary)
          for s in S for i, c in enumerate(course_names)}
    a2 = {(s, c): LpVariable(f"a2_{s}_{i}", cat=LpBinary)
          for s in S for i, c in enumerate(course_names)}
    _log(f"variables created: {len(offer)+len(in_hj1)+len(in_hj2)+len(a1)+len(a2)} total")

    # Zielfunktion
    prob += lpSum(score[(s, c)] * (a1[(s, c)] + a2[(s, c)])
                  for s in S for c in course_names)

    # Kurs-Constraints (konfigurierbar)
    prob += lpSum(in_hj1[c] for c in course_names) == settings.hj1_count
    prob += lpSum(in_hj2[c] for c in course_names) == settings.hj2_count
    for c in course_names:
        prob += in_hj1[c] + in_hj2[c] == offer[c]

    # Kapazitäts-Constraints
    for c in course_names:
        n1 = lpSum(a1[(s, c)] for s in S)
        n2 = lpSum(a2[(s, c)] for s in S)
        prob += n1 <= max_cap[c] * in_hj1[c]
        prob += n1 >= min_cap[c] * in_hj1[c]
        prob += n2 <= max_cap[c] * in_hj2[c]
        prob += n2 >= min_cap[c] * in_hj2[c]

    # Schüler-Constraints
    for s in S:
        prob += lpSum(a1[(s, c)] for c in course_names) == 1
        prob += lpSum(a2[(s, c)] for c in course_names) == 1
        for c in course_names:
            prob += a1[(s, c)] <= in_hj1[c]
            prob += a2[(s, c)] <= in_hj2[c]

    _log(f"constraints built, calling CBC solver (timeLimit={SOLVER_TIME_LIMIT}s, threads={SOLVER_THREADS})")
    t0 = time.time()
    status = prob.solve(_build_solver())
    _log(f"CBC returned after {time.time() - t0:.2f}s: status={LpStatus[status]}")
    if LpStatus[status] != "Optimal":
        raise ValueError(f"Optimierung fehlgeschlagen: {LpStatus[status]} — zu wenige Schüler oder ungültige Kapazitäten")

    # Ergebnisse auslesen
    updated_courses = []
    for course in courses:
        c = course.model_copy()
        c.offered = bool(round(value(offer[c.name])))
        if c.offered:
            c.semester = 1 if round(value(in_hj1[c.name])) else 2
        else:
            c.semester = None
        updated_courses.append(c)

    assignments = _build_assignments(valid, updated_courses, a1, a2, score)
    return updated_courses, assignments
```

Update `run_assignment_optimization` to accept (but not yet use) settings:

```python
def run_assignment_optimization(
    students: list[Student], courses: list[Course], settings: SessionSettings
) -> list[Assignment]:
    """
    Nur Schülerzuteilung neu berechnen — Kurs/HJ-Konfiguration ist fix.
    settings wird aktuell nur für API-Konsistenz übergeben.
    """
    # body unchanged
    valid = [s for s in students if s.valid]
    hj1 = [c.name for c in courses if c.offered and c.semester == 1]
    hj2 = [c.name for c in courses if c.offered and c.semester == 2]
    # ... rest unchanged ...
```

- [ ] **Step 3.6: Run tests, verify pass**

Run: `cd backend && pytest ../tests/test_optimizer.py -v`
Expected: all tests PASS, including 3 new configurable tests.

- [ ] **Step 3.7: Commit**

```bash
git add backend/app/optimizer.py tests/test_optimizer.py
git commit -m "feat: make solver HJ counts configurable via SessionSettings"
```

---

## Task 4: Add pre-solve feasibility checks to `run_full_optimization`

**Files:**
- Modify: `backend/app/optimizer.py`
- Modify: `tests/test_optimizer.py`

- [ ] **Step 4.1: Write failing tests**

Append to `tests/test_optimizer.py`:

```python
import pytest


def test_full_optimization_raises_when_not_enough_courses():
    """hj1+hj2 > number of courses should raise a clear ValueError."""
    settings = SessionSettings(hj1_count=5, hj2_count=5)
    students = make_students(20, COURSE_NAMES[:4])
    courses = make_courses_with_settings(COURSE_NAMES[:4], settings)
    with pytest.raises(ValueError, match="Nicht genug Kurse"):
        run_full_optimization(students, courses, settings)


def test_full_optimization_raises_when_not_enough_capacity():
    """(hj1+hj2) * max(default_max, special_max) < n_students should raise."""
    settings = SessionSettings(
        hj1_count=2, hj2_count=2, default_max=5, default_min=1,
        special_course=None, special_max=5, special_min=1,
    )
    # 2+2 courses * 5 max = 20 seats; 30 students → infeasible
    students = make_students(30, COURSE_NAMES)
    courses = make_courses_with_settings(COURSE_NAMES, settings)
    with pytest.raises(ValueError, match="Nicht genug Plätze"):
        run_full_optimization(students, courses, settings)
```

- [ ] **Step 4.2: Run tests, verify they fail**

Run: `cd backend && pytest ../tests/test_optimizer.py::test_full_optimization_raises_when_not_enough_courses ../tests/test_optimizer.py::test_full_optimization_raises_when_not_enough_capacity -v`

Expected: FAIL — either with a different error message (CBC infeasibility) or with a different exception.

- [ ] **Step 4.3: Add pre-solve checks**

Edit `backend/app/optimizer.py`. At the start of `run_full_optimization`, after the `valid` / `course_names` setup but before building the LP problem, insert:

```python
    # Pre-solve feasibility checks with clear error messages
    total_courses_needed = settings.hj1_count + settings.hj2_count
    if total_courses_needed > len(course_names):
        raise ValueError(
            f"Nicht genug Kurse: Die CSV enthält {len(course_names)} Kurse, "
            f"aber {settings.hj1_count}+{settings.hj2_count}={total_courses_needed} sollen angeboten werden."
        )
    max_cap_any = max(settings.default_max, settings.special_max)
    max_capacity = total_courses_needed * max_cap_any
    if max_capacity < len(valid):
        raise ValueError(
            f"Nicht genug Plätze: maximal {max_capacity} Plätze für {len(valid)} Schüler."
        )
```

- [ ] **Step 4.4: Run tests, verify pass**

Run: `cd backend && pytest ../tests/test_optimizer.py -v`
Expected: all tests PASS, including the two new raise-tests.

- [ ] **Step 4.5: Commit**

```bash
git add backend/app/optimizer.py tests/test_optimizer.py
git commit -m "feat: add pre-solve feasibility checks with clear error messages"
```

---

## Task 5: Add `GET /api/settings` endpoint

**Files:**
- Create: `backend/app/routers/settings.py`
- Modify: `backend/app/main.py`
- Modify: `tests/test_api.py`

- [ ] **Step 5.1: Write failing tests**

Append to `tests/test_api.py`:

```python
def test_get_settings_empty_session_returns_defaults(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.settings.session.load", side_effect=fake_load), \
         patch("app.routers.settings.session.save", side_effect=fake_save):
        response = client.get("/api/settings")
    assert response.status_code == 200
    body = response.json()
    assert body["settings"]["hj1_count"] == 4
    assert body["settings"]["hj2_count"] == 4
    assert body["settings"]["default_max"] == 22
    assert body["settings"]["default_min"] == 1
    assert body["settings"]["special_course"] is None
    assert body["settings"]["special_max"] == 14
    assert body["settings"]["special_min"] == 1
    assert body["courses"] == []
    assert body["assignments_exist"] is False


def test_get_settings_after_upload_returns_course_list(client):
    """After uploading a CSV, the courses list is populated."""
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save), \
         patch("app.routers.settings.session.load", side_effect=fake_load), \
         patch("app.routers.settings.session.save", side_effect=fake_save):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
        response = client.get("/api/settings")
    assert response.status_code == 200
    body = response.json()
    assert len(body["courses"]) > 0
    assert "Kochen" in body["courses"]
    assert body["assignments_exist"] is False
```

- [ ] **Step 5.2: Run tests, verify they fail**

Run: `cd backend && pytest ../tests/test_api.py::test_get_settings_empty_session_returns_defaults -v`
Expected: FAIL with 404 (endpoint does not exist) — test will return `response.status_code == 404`.

- [ ] **Step 5.3: Create the settings router**

Create `backend/app/routers/settings.py`:

```python
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
```

- [ ] **Step 5.4: Register the router**

Edit `backend/app/main.py`. Add `settings` to the import and include the router:

```python
from app.routers import upload, students, courses, optimize, results, export, settings

# ...
app.include_router(settings.router)
```

Place the `include_router(settings.router)` line after the existing `include_router` calls.

- [ ] **Step 5.5: Run tests, verify pass**

Run: `cd backend && pytest ../tests/test_api.py -v -k settings`
Expected: both settings tests PASS.

- [ ] **Step 5.6: Commit**

```bash
git add backend/app/routers/settings.py backend/app/main.py tests/test_api.py
git commit -m "feat: add GET /api/settings endpoint"
```

---

## Task 6: Add `PUT /api/settings` endpoint with validation and reset logic

**Files:**
- Modify: `backend/app/routers/settings.py`
- Modify: `tests/test_api.py`

- [ ] **Step 6.1: Write failing tests**

Append to `tests/test_api.py`:

```python
def test_put_settings_accepts_valid(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.settings.session.load", side_effect=fake_load), \
         patch("app.routers.settings.session.save", side_effect=fake_save):
        response = client.put("/api/settings", json={
            "hj1_count": 3, "hj2_count": 5,
            "default_max": 20, "default_min": 2,
            "special_course": None, "special_max": 10, "special_min": 1,
        })
    assert response.status_code == 200
    body = response.json()
    assert body["settings"]["hj1_count"] == 3
    assert body["settings"]["hj2_count"] == 5
    assert body["assignments_cleared"] is False


def test_put_settings_rejects_value_below_one(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.settings.session.load", side_effect=fake_load), \
         patch("app.routers.settings.session.save", side_effect=fake_save):
        response = client.put("/api/settings", json={
            "hj1_count": 0, "hj2_count": 4,
            "default_max": 20, "default_min": 1,
            "special_course": None, "special_max": 10, "special_min": 1,
        })
    assert response.status_code == 422


def test_put_settings_rejects_min_greater_than_max(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.settings.session.load", side_effect=fake_load), \
         patch("app.routers.settings.session.save", side_effect=fake_save):
        response = client.put("/api/settings", json={
            "hj1_count": 4, "hj2_count": 4,
            "default_max": 5, "default_min": 10,
            "special_course": None, "special_max": 14, "special_min": 1,
        })
    assert response.status_code == 422


def test_put_settings_rejects_unknown_special_course(client):
    """special_course must be present in courses list if not None."""
    fake_load, fake_save = _make_mock_session()
    # session has no courses
    with patch("app.routers.settings.session.load", side_effect=fake_load), \
         patch("app.routers.settings.session.save", side_effect=fake_save):
        response = client.put("/api/settings", json={
            "hj1_count": 4, "hj2_count": 4,
            "default_max": 22, "default_min": 1,
            "special_course": "Kochen", "special_max": 14, "special_min": 1,
        })
    assert response.status_code == 422


def test_put_settings_noop_preserves_assignments(client):
    """An identical PUT does not clear existing assignments."""
    from app.models import SessionData, Student, Course, Assignment, SessionSettings
    state = SessionData(
        students=[Student(nr=1, name="A", preferences={}, valid=True, errors=[])],
        courses=[Course(name="X", offered=True, semester=1)],
        assignments=[Assignment(student_nr=1, student_name="A", course_hj1="X", course_hj2="X", score_hj1=8, score_hj2=8)],
        settings=SessionSettings(),
    )

    def fake_load():
        return state

    def fake_save(data):
        nonlocal state
        state = data

    with patch("app.routers.settings.session.load", side_effect=fake_load), \
         patch("app.routers.settings.session.save", side_effect=fake_save):
        response = client.put("/api/settings", json=state.settings.model_dump())
    assert response.status_code == 200
    assert response.json()["assignments_cleared"] is False
    assert len(state.assignments) == 1


def test_put_settings_change_clears_assignments(client):
    """A changed PUT clears assignments and resets offered/semester on courses."""
    from app.models import SessionData, Student, Course, Assignment, SessionSettings
    state = SessionData(
        students=[Student(nr=1, name="A", preferences={}, valid=True, errors=[])],
        courses=[Course(name="X", offered=True, semester=1, max_students=26)],
        assignments=[Assignment(student_nr=1, student_name="A", course_hj1="X", course_hj2="X", score_hj1=8, score_hj2=8)],
        settings=SessionSettings(),
    )

    def fake_load():
        return state

    def fake_save(data):
        nonlocal state
        state = data

    with patch("app.routers.settings.session.load", side_effect=fake_load), \
         patch("app.routers.settings.session.save", side_effect=fake_save):
        response = client.put("/api/settings", json={
            "hj1_count": 3, "hj2_count": 5,  # changed
            "default_max": 22, "default_min": 1,
            "special_course": None, "special_max": 14, "special_min": 1,
        })
    assert response.status_code == 200
    assert response.json()["assignments_cleared"] is True
    assert state.assignments == []
    assert state.courses[0].offered is False
    assert state.courses[0].semester is None
    # Course min/max refreshed from new settings:
    assert state.courses[0].max_students == 22
```

- [ ] **Step 6.2: Run tests, verify they fail**

Run: `cd backend && pytest ../tests/test_api.py -v -k put_settings`
Expected: all FAIL with 405 Method Not Allowed (only GET exists).

- [ ] **Step 6.3: Implement PUT with validation and reset logic**

Edit `backend/app/routers/settings.py`. Full replacement:

```python
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
```

- [ ] **Step 6.4: Run tests, verify pass**

Run: `cd backend && pytest ../tests/test_api.py -v -k settings`
Expected: all settings tests PASS.

- [ ] **Step 6.5: Commit**

```bash
git add backend/app/routers/settings.py tests/test_api.py
git commit -m "feat: add PUT /api/settings with validation and assignment reset"
```

---

## Task 7: Update `POST /api/upload` to use settings and drop COURSE_CAPS

**Files:**
- Modify: `backend/app/routers/upload.py`
- Modify: `tests/test_api.py`

- [ ] **Step 7.1: Write failing tests**

Append to `tests/test_api.py`:

```python
def test_upload_applies_settings_to_new_courses(client):
    """Uploaded courses should have min/max from current settings, not hardcoded 26/16."""
    from app.models import SessionData, SessionSettings
    state = SessionData(settings=SessionSettings(default_max=30, default_min=3, special_course=None))

    def fake_load():
        return state

    def fake_save(data):
        nonlocal state
        state = data

    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save):
        response = client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
    assert response.status_code == 200
    assert all(c.max_students == 30 for c in state.courses)
    assert all(c.min_students == 3 for c in state.courses)


def test_upload_clears_special_course_if_not_in_new_csv(client):
    """If settings.special_course isn't in the uploaded CSV, reset to None."""
    from app.models import SessionData, SessionSettings
    state = SessionData(settings=SessionSettings(special_course="NichtVorhanden"))

    def fake_load():
        return state

    def fake_save(data):
        nonlocal state
        state = data

    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
    assert state.settings.special_course is None


def test_upload_keeps_special_course_if_still_present(client):
    """If settings.special_course IS in the new CSV, keep it."""
    from app.models import SessionData, SessionSettings
    state = SessionData(settings=SessionSettings(special_course="Kochen", special_max=14))

    def fake_load():
        return state

    def fake_save(data):
        nonlocal state
        state = data

    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
    assert state.settings.special_course == "Kochen"
    kochen = next(c for c in state.courses if c.name == "Kochen")
    assert kochen.max_students == 14
```

- [ ] **Step 7.2: Run tests, verify they fail**

Run: `cd backend && pytest ../tests/test_api.py -v -k upload_applies_settings`
Expected: FAIL because the current upload code uses `COURSE_CAPS` hardcoded.

- [ ] **Step 7.3: Rewrite `upload.py`**

Replace `backend/app/routers/upload.py` entirely:

```python
from fastapi import APIRouter, File, UploadFile, HTTPException
from app.models import Course
from app import session, parser
from app.settings_util import apply_settings_to_courses

router = APIRouter(prefix="/api")


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Nur CSV-Dateien erlaubt")

    MAX_BYTES = 5 * 1024 * 1024  # 5 MB
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Datei zu groß (max 5 MB)")

    try:
        students, course_names = parser.parse_csv(content)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"CSV konnte nicht verarbeitet werden: {exc}")

    courses = [Course(name=name) for name in course_names]

    data = session.load()
    # Reset special_course if it no longer appears in the CSV
    if data.settings.special_course is not None and data.settings.special_course not in course_names:
        data.settings.special_course = None
    # Apply current settings to the fresh course list (sets min/max per course)
    apply_settings_to_courses(courses, data.settings)

    data.students = students
    data.courses = courses
    data.assignments = []
    session.save(data)

    valid = [s for s in students if s.valid]
    invalid = [s for s in students if not s.valid]
    return {
        "total": len(students),
        "valid_count": len(valid),
        "invalid_count": len(invalid),
        "course_names": course_names,
    }
```

Key changes from the old file:
- `COURSE_CAPS` dict removed.
- `Course(name=name, max_students=COURSE_CAPS.get(name, 26))` → `Course(name=name)` (defaults from model, overridden by `apply_settings_to_courses`).
- New reset-if-missing logic for `special_course`.
- `apply_settings_to_courses(courses, data.settings)` call.

- [ ] **Step 7.4: Run all tests, verify pass**

Run: `cd backend && pytest`
Expected: all tests PASS.

- [ ] **Step 7.5: Commit**

```bash
git add backend/app/routers/upload.py tests/test_api.py
git commit -m "feat: upload applies current settings to new courses"
```

---

## Task 8: Update `/api/optimize` and `/api/optimize/assignments` to use settings

**Files:**
- Modify: `backend/app/routers/optimize.py`
- Modify: `tests/test_api.py`

- [ ] **Step 8.1: Write failing tests**

Append to `tests/test_api.py`:

```python
def test_optimize_full_uses_configured_hj_counts(client):
    """Full optimization respects settings.hj1_count / hj2_count."""
    from app.models import SessionData, Student, Course, SessionSettings
    from app.settings_util import apply_settings_to_courses

    course_names = [f"K{i}" for i in range(10)]
    # 40 independent students, each preferring K0..K7 as priorities 1..8
    def _prefs():
        return {c: (i + 1 if i < 8 else 0) for i, c in enumerate(course_names)}
    students = [
        Student(nr=i + 1, name=f"S{i}", preferences=_prefs(), valid=True, errors=[])
        for i in range(40)
    ]
    settings = SessionSettings(hj1_count=3, hj2_count=3, default_max=20, default_min=1)
    courses = [Course(name=n) for n in course_names]
    apply_settings_to_courses(courses, settings)
    state = SessionData(students=students, courses=courses, settings=settings)

    def fake_load():
        return state

    def fake_save(data):
        nonlocal state
        state = data

    with patch("app.routers.optimize.session.load", side_effect=fake_load), \
         patch("app.routers.optimize.session.save", side_effect=fake_save):
        response = client.post("/api/optimize")
    assert response.status_code == 200
    hj1 = [c for c in state.courses if c.offered and c.semester == 1]
    hj2 = [c for c in state.courses if c.offered and c.semester == 2]
    assert len(hj1) == 3
    assert len(hj2) == 3


def test_optimize_assignments_rejects_count_mismatch(client):
    """If the current offered distribution != settings.hj1/2_count, return 400."""
    from app.models import SessionData, Student, Course, SessionSettings
    state = SessionData(
        students=[Student(nr=1, name="A", preferences={"X": 1, "Y": 2}, valid=True, errors=[])],
        courses=[
            Course(name="X", offered=True, semester=1, max_students=5, min_students=1),
            Course(name="Y", offered=True, semester=2, max_students=5, min_students=1),
        ],
        settings=SessionSettings(hj1_count=2, hj2_count=2),  # requires 2+2, has 1+1
    )

    def fake_load():
        return state

    def fake_save(data):
        nonlocal state
        state = data

    with patch("app.routers.optimize.session.load", side_effect=fake_load), \
         patch("app.routers.optimize.session.save", side_effect=fake_save):
        response = client.post("/api/optimize/assignments")
    assert response.status_code == 400
    assert "Halbjahr" in response.json()["detail"] or "hj" in response.json()["detail"].lower()
```

- [ ] **Step 8.2: Run tests, verify they fail**

Run: `cd backend && pytest ../tests/test_api.py -v -k "optimize_full_uses_configured or optimize_assignments_rejects_count"`
Expected: the signature-mismatch test fails with 500 (TypeError), the second fails with 200 (wrong status).

- [ ] **Step 8.3: Update `optimize.py`**

Replace `backend/app/routers/optimize.py` entirely:

```python
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
```

Key changes from the old file:
- `run_full_optimization(data.students, data.courses, data.settings)` (third argument added)
- `run_assignment_optimization(data.students, data.courses, data.settings)` (third argument added)
- The old `has_hj1 / has_hj2` check is replaced with strict equality against `data.settings.hj1_count` / `hj2_count`.

- [ ] **Step 8.4: Run all tests, verify pass**

Run: `cd backend && pytest`
Expected: all tests PASS.

- [ ] **Step 8.5: Commit**

```bash
git add backend/app/routers/optimize.py tests/test_api.py
git commit -m "feat: optimize endpoints use SessionSettings and enforce HJ counts"
```

---

## Task 9: Frontend — API types and client methods

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`

- [ ] **Step 9.1: Add types**

Edit `frontend/src/types.ts`. Append at the end:

```typescript
export interface SessionSettings {
  hj1_count: number
  hj2_count: number
  default_max: number
  default_min: number
  special_course: string | null
  special_max: number
  special_min: number
}

export interface SettingsResponse {
  settings: SessionSettings
  courses: string[]
  assignments_exist: boolean
}

export interface SettingsUpdateResponse {
  settings: SessionSettings
  assignments_cleared: boolean
}
```

- [ ] **Step 9.2: Add API methods**

Edit `frontend/src/api.ts`. Update imports at top:

```typescript
import type {
  Student, Course, CourseStats, UploadResult, ResultsData, ScoreReport,
  SessionSettings, SettingsResponse, SettingsUpdateResponse,
} from './types'
```

Add two new methods inside the `api` export object (before the closing `}`):

```typescript
  getSettings: (): Promise<SettingsResponse> => request('/settings'),

  updateSettings: (settings: SessionSettings): Promise<SettingsUpdateResponse> =>
    request('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
```

- [ ] **Step 9.3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9.4: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat: frontend types and API client for SessionSettings"
```

---

## Task 10: Frontend — Rewrite UploadPage with settings form

**Files:**
- Modify: `frontend/src/pages/UploadPage.tsx`

This is the largest frontend change. Work in three steps: (1) structure, (2) state, (3) validation/UX.

- [ ] **Step 10.1: Replace the file with the new structure**

Replace `frontend/src/pages/UploadPage.tsx` entirely:

```typescript
import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { UploadResult, SessionSettings, SettingsResponse } from '../types'

const DEFAULT_SETTINGS: SessionSettings = {
  hj1_count: 4,
  hj2_count: 4,
  default_max: 22,
  default_min: 1,
  special_course: null,
  special_max: 14,
  special_min: 1,
}

function settingsEqual(a: SessionSettings, b: SessionSettings): boolean {
  return (
    a.hj1_count === b.hj1_count &&
    a.hj2_count === b.hj2_count &&
    a.default_max === b.default_max &&
    a.default_min === b.default_min &&
    a.special_course === b.special_course &&
    a.special_max === b.special_max &&
    a.special_min === b.special_min
  )
}

interface ValidationErrors {
  hj1_count?: string
  hj2_count?: string
  default_max?: string
  default_min?: string
  special_max?: string
  special_min?: string
  hj_overflow?: string
}

function validate(s: SessionSettings, courseCount: number): ValidationErrors {
  const errs: ValidationErrors = {}
  if (s.hj1_count < 1) errs.hj1_count = 'Mindestens 1'
  if (s.hj2_count < 1) errs.hj2_count = 'Mindestens 1'
  if (s.default_max < 1) errs.default_max = 'Mindestens 1'
  if (s.default_min < 1) errs.default_min = 'Mindestens 1'
  if (s.special_max < 1) errs.special_max = 'Mindestens 1'
  if (s.special_min < 1) errs.special_min = 'Mindestens 1'
  if (s.default_min > s.default_max) {
    errs.default_min = 'Min > Max'
    errs.default_max = 'Min > Max'
  }
  if (s.special_min > s.special_max) {
    errs.special_min = 'Min > Max'
    errs.special_max = 'Min > Max'
  }
  if (courseCount > 0 && s.hj1_count + s.hj2_count > courseCount) {
    errs.hj_overflow = `Nur ${courseCount} Kurse in der CSV — Optimierung wird scheitern.`
  }
  return errs
}

function hasBlockingErrors(errs: ValidationErrors): boolean {
  // hj_overflow is a warning, not a blocker
  const { hj_overflow, ...blocking } = errs
  return Object.keys(blocking).length > 0
}

export default function UploadPage() {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [algoOpen, setAlgoOpen] = useState(false)
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS)
  const [savedSettings, setSavedSettings] = useState<SessionSettings>(DEFAULT_SETTINGS)
  const [courses, setCourses] = useState<string[]>([])
  const [assignmentsExist, setAssignmentsExist] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load settings + courses on mount
  useEffect(() => {
    api.getSettings().then((res: SettingsResponse) => {
      setSettings(res.settings)
      setSavedSettings(res.settings)
      setCourses(res.courses)
      setAssignmentsExist(res.assignments_exist)
    }).catch(e => setError(e instanceof Error ? e.message : 'Fehler beim Laden der Einstellungen'))
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleFile = useCallback(async (file: File) => {
    if (loading) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Bitte eine CSV-Datei hochladen.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await api.uploadCsv(file)
      setUploadResult(res)
      // Refetch settings to get new course list + possibly-cleared special_course
      const fresh = await api.getSettings()
      setSettings(fresh.settings)
      setSavedSettings(fresh.settings)
      setCourses(fresh.courses)
      setAssignmentsExist(fresh.assignments_exist)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [loading])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const errors = validate(settings, courses.length)
  const blocked = hasBlockingErrors(errors)
  const canContinue = courses.length > 0 && !blocked
  const changed = !settingsEqual(settings, savedSettings)

  const doSave = async () => {
    try {
      await api.updateSettings(settings)
      setSavedSettings(settings)
      navigate('/editor')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen')
    }
  }

  const onContinue = () => {
    if (!canContinue) return
    if (assignmentsExist && changed) {
      setConfirmOpen(true)
    } else {
      doSave()
    }
  }

  return (
    <div className="max-w-2xl mx-auto mt-10 stagger-1">
      <div className="mb-8 stagger-1">
        <h1 className="font-display text-3xl font-bold text-t1 mb-1.5">CSV hochladen</h1>
        <p className="text-t2 text-sm">Schülerpräferenzen importieren und Rahmenbedingungen einstellen</p>
      </div>

      {/* Upload area */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={onDrop}
        className={`stagger-2 relative flex flex-col items-center justify-center rounded-2xl p-10 cursor-pointer
          transition-all duration-300 border-2
          ${uploadResult
            ? 'border-ok/50 bg-ok/[0.04]'
            : dragging
            ? 'border-accent bg-accent/[0.05] scale-[1.02]'
            : loading
            ? 'border-border bg-elevated'
            : 'border-border hover:border-accent/50 hover:bg-accent/[0.025] bg-surface'}`}
      >
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) handleFile(file)
          }}
        />
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-accent/25 border-t-accent animate-spin-slow" />
            <p className="text-t2 text-sm font-medium">Wird verarbeitet…</p>
          </div>
        ) : uploadResult ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-10 h-10 rounded-full bg-ok/10 border border-ok/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-ok" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <p className="font-display font-semibold text-t1">{uploadResult.total} Schüler importiert</p>
            <p className="text-sm text-t2">
              <span className="text-ok">{uploadResult.valid_count} gültig</span>
              {uploadResult.invalid_count > 0 && (
                <> · <span className="text-err">{uploadResult.invalid_count} mit Fehlern</span></>
              )}
            </p>
            <p className="text-xs text-t3 mt-1">Neue Datei droppen zum Ersetzen</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300
              ${dragging ? 'border-accent text-accent scale-110' : 'border-border text-t3'}`}>
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className={`font-medium transition-colors duration-200 ${dragging ? 'text-accent' : 'text-t1'}`}>
                {dragging ? 'Loslassen zum Hochladen' : 'CSV-Datei hier ablegen'}
              </p>
              <p className="text-xs text-t3 mt-1">oder klicken zum Auswählen · max. 5 MB</p>
            </div>
          </div>
        )}
      </label>

      {error && (
        <div className="stagger-3 mt-4 p-4 bg-err/[0.05] border border-err/20 rounded-xl flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-err/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-err text-xs font-bold">!</span>
          </div>
          <p className="text-err text-sm leading-relaxed">{error}</p>
        </div>
      )}

      {/* Settings card */}
      <section className="stagger-3 mt-6 bg-surface border border-border rounded-2xl p-6 shadow-card">
        <h2 className="font-display text-lg font-semibold text-t1 mb-1">Rahmenbedingungen</h2>
        <p className="text-sm text-t2 mb-5">Diese Werte steuern, wie der Solver Kurse auswählt und Schüler zuteilt.</p>

        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Kurse HJ1" value={settings.hj1_count}
            onChange={v => setSettings(s => ({ ...s, hj1_count: v }))}
            error={errors.hj1_count} />
          <NumberField label="Kurse HJ2" value={settings.hj2_count}
            onChange={v => setSettings(s => ({ ...s, hj2_count: v }))}
            error={errors.hj2_count} />
          <NumberField label="Max Schüler / Kurs" value={settings.default_max}
            onChange={v => setSettings(s => ({ ...s, default_max: v }))}
            error={errors.default_max} />
          <NumberField label="Min Schüler / Kurs" value={settings.default_min}
            onChange={v => setSettings(s => ({ ...s, default_min: v }))}
            error={errors.default_min} />
          <NumberField label="Max Schüler Sonderkurs" value={settings.special_max}
            onChange={v => setSettings(s => ({ ...s, special_max: v }))}
            error={errors.special_max} />
          <NumberField label="Min Schüler Sonderkurs" value={settings.special_min}
            onChange={v => setSettings(s => ({ ...s, special_min: v }))}
            error={errors.special_min} />
        </div>

        {errors.hj_overflow && (
          <p className="mt-2 text-xs text-yellow-700 dark:text-yellow-400">{errors.hj_overflow}</p>
        )}

        <div className="mt-5">
          <label className="block text-sm font-medium text-t1 mb-1">Sonderkurs</label>
          <select
            value={settings.special_course ?? ''}
            disabled={courses.length === 0}
            onChange={e => setSettings(s => ({
              ...s,
              special_course: e.target.value === '' ? null : e.target.value,
            }))}
            className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-t1
              disabled:text-t3 disabled:cursor-not-allowed"
          >
            {courses.length === 0 ? (
              <option value="">Erst CSV hochladen…</option>
            ) : (
              <>
                <option value="">– kein Sonderkurs –</option>
                {courses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </>
            )}
          </select>
        </div>
      </section>

      {/* Continue button */}
      <div className="stagger-3 mt-6 flex justify-end">
        <button
          type="button"
          disabled={!canContinue}
          onClick={onContinue}
          className="px-6 py-2.5 rounded-lg bg-accent text-white font-medium shadow-card
            hover:bg-accent/90 disabled:bg-elevated disabled:text-t3 disabled:cursor-not-allowed
            disabled:shadow-none transition-colors"
        >
          Weiter zum Editor
        </button>
      </div>

      {/* Help boxes */}
      <div className="stagger-4 mt-6 p-4 bg-elevated border border-border rounded-xl">
        <p className="text-xs font-semibold text-t2 mb-2 uppercase tracking-wider">Erwartetes Format</p>
        <code className="text-xs text-t3 font-mono block">Nr.;Name;Kurs1;Kurs2;…;Kurs8</code>
        <p className="text-xs text-t3 mt-1.5">Genau 8 Wunschkurse · Priorität 1–8 · keine Duplikate</p>
      </div>

      <div className="stagger-4 mt-4 p-4 bg-elevated border border-border rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-3 h-3 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </div>
          <p className="text-xs font-semibold text-t2 uppercase tracking-wider">So funktioniert die Optimierung</p>
        </div>
        <p className="text-xs text-t3 leading-relaxed">
          Dieses Tool verteilt Schüler anhand ihrer Wunschlisten optimal auf Kurse.
          Der Algorithmus wählt Kurse gemäß den oben eingestellten Anzahlen pro Halbjahr
          und teilt jeden Schüler so zu, dass möglichst viele ihre Top-Wünsche erhalten.
        </p>
        <button
          type="button"
          aria-expanded={algoOpen}
          aria-controls="algo-detail"
          onClick={() => setAlgoOpen(o => !o)}
          className="mt-3 flex items-center gap-1.5 text-xs text-accent hover:underline cursor-pointer"
        >
          <svg viewBox="0 0 24 24"
            className={`w-3 h-3 transition-transform duration-200 ${algoOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
          Wie funktioniert's im Detail?
        </button>
        {algoOpen && (
          <div id="algo-detail" className="border-t border-border mt-3 pt-3 space-y-1.5">
            <p className="text-xs text-t3"><span className="text-t2 font-medium">Methode:</span> Ganzzahlige lineare Optimierung (ILP) via PuLP/CBC-Solver</p>
            <p className="text-xs text-t3"><span className="text-t2 font-medium">Zielfunktion:</span> Maximiert die Gesamtzufriedenheit — Priorität 1 gibt 8 Punkte, Priorität 2 gibt 7, usw.</p>
            <p className="text-xs text-t3"><span className="text-t2 font-medium">Nebenbedingungen:</span> HJ-Anzahlen gemäß Einstellungen, jeder Schüler bekommt genau 1 Kurs pro HJ, Kurskapazitäten (min/max) werden eingehalten</p>
            <p className="text-xs text-t3"><span className="text-t2 font-medium">Ergebnis:</span> Mathematisch optimale Zuteilung — keine bessere Verteilung ist möglich</p>
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setConfirmOpen(false)}>
          <div className="bg-surface rounded-2xl p-6 max-w-md mx-4 shadow-card border border-border" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold text-t1 mb-2">Zuteilungen verwerfen?</h3>
            <p className="text-sm text-t2 mb-5">
              Die bestehenden Zuteilungen werden durch die geänderten Rahmenbedingungen ungültig und verworfen.
              Du musst die Optimierung danach neu starten.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-lg bg-elevated text-t1 hover:bg-elevated/70 text-sm"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => { setConfirmOpen(false); doSave() }}
                className="px-4 py-2 rounded-lg bg-err text-white hover:bg-err/90 text-sm"
              >
                Zuteilungen verwerfen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  onChange: (v: number) => void
  error?: string
}

function NumberField({ label, value, onChange, error }: NumberFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-t2 mb-1">{label}</label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={e => {
          const n = parseInt(e.target.value, 10)
          onChange(Number.isNaN(n) ? 0 : n)
        }}
        className={`w-full bg-elevated border rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-t1
          ${error ? 'border-err' : 'border-border'}`}
      />
      {error && <p className="text-xs text-err mt-0.5">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 10.2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10.3: Verify the build succeeds**

Run: `cd frontend && npm run build`
Expected: build succeeds without errors.

- [ ] **Step 10.4: Manual smoke test**

If the dev stack is runnable locally (via `docker-compose up` or similar):

1. Start backend and frontend.
2. Navigate to Seite 1 on a fresh session → see settings form with defaults (4, 4, 22, 1, 14, 1), dropdown disabled with placeholder "Erst CSV hochladen…", "Weiter zum Editor" button disabled.
3. Upload a CSV containing "Kochen" → "N Schüler importiert" stays; dropdown populates with all courses and "Kochen" selected; button enabled.
4. Change `hj1_count` to 3 and `hj2_count` to 5 → click "Weiter zum Editor" → editor opens (no modal because no assignments yet).
5. Run optimization → 3 courses in HJ1, 5 in HJ2.
6. Navigate back to Seite 1 → settings reflect 3/5; change default_max to 25 → click "Weiter" → confirm modal appears → confirm → editor opens, assignments gone.
7. Upload a CSV without "Kochen" → dropdown switches to "– kein Sonderkurs –".
8. Enter `default_min=10, default_max=5` → red outlines, button disabled.

If the dev stack isn't runnable, skip the manual test and document that. The subagent code-review will catch obvious regressions.

- [ ] **Step 10.5: Commit**

```bash
git add frontend/src/pages/UploadPage.tsx
git commit -m "feat: UploadPage shows Rahmenbedingungen settings form"
```

---

## Task 11: Frontend — Update ConstraintsPage reference

**Files:**
- Modify: `frontend/src/pages/ConstraintsPage.tsx`

- [ ] **Step 11.1: Update "Kurs-Kapazitäten" section**

Edit `frontend/src/pages/ConstraintsPage.tsx`. Replace the `Section` with title `"Kurs-Kapazitäten"` (currently at lines ~59-74) with:

```typescript
        <div className="stagger-2">
          <Section
            title="Kurs-Kapazitäten"
            intro="Jeder Kurs hat eine Unter- und Obergrenze für die Anzahl zugeteilter Schüler. Die Werte werden auf Seite 1 eingestellt — hier die aktuellen Defaults beim ersten Start."
            rows={[
              { label: 'Minimum pro Kurs (Default)', value: '1 Schüler', note: 'Auf Seite 1 konfigurierbar. Das Minimum greift nur, wenn der Kurs angeboten wird.' },
              { label: 'Maximum pro Kurs (Default)', value: '22 Schüler', note: 'Auf Seite 1 konfigurierbar.' },
              { label: 'Sonderkurs-Auswahl', value: 'frei wählbar', note: 'Auf Seite 1 ein beliebiger Kurs aus der CSV auswählbar (Default: Kochen, falls vorhanden).' },
              { label: 'Maximum Sonderkurs (Default)', value: '14 Schüler', note: 'Auf Seite 1 konfigurierbar.' },
            ]}
            footer={
              <>
                <strong className="text-t2">Beispiel:</strong> Mit den Defaults und 4 Kursen pro Halbjahr liegt die Gesamtkapazität eines Halbjahres zwischen 4 (4 × 1) und 88 (4 × 22). Wird einer der Kurse pro Halbjahr der Sonderkurs, sinkt die Obergrenze auf 80 (3 × 22 + 14).
              </>
            }
          />
        </div>
```

- [ ] **Step 11.2: Update "Volloptimierung" section**

Replace the `Section` with title starting `'Volloptimierung (Button „Optimierung starten")'` with:

```typescript
        <div className="stagger-3">
          <Section
            title={'Volloptimierung (Button „Optimierung starten")'}
            intro="Der Solver wählt automatisch, welche Kurse aus den Kandidaten angeboten werden und teilt jedem Schüler je einen Kurs pro Halbjahr zu."
            rows={[
              { label: 'Anzahl angebotener Kurse', value: 'HJ1 + HJ2', note: 'Die Gesamtsumme entspricht den auf Seite 1 eingestellten Werten für „Kurse HJ1" und „Kurse HJ2".' },
              { label: 'Verteilung pro Halbjahr', value: 'gemäß Einstellung', note: 'Auf Seite 1 für HJ1 und HJ2 unabhängig einstellbar (min. 1 pro Halbjahr, Default 4+4).' },
              { label: 'Kurse in beiden Halbjahren', value: 'nicht möglich', note: 'Ein Kurs gehört entweder zu HJ1, zu HJ2 oder wird nicht angeboten.' },
              { label: 'Zuteilungen pro Schüler', value: '1 Kurs pro HJ', note: 'Jeder gültige Schüler bekommt genau einen Kurs pro Halbjahr — keine Mehrfachbelegung, keine Lücken.' },
              { label: 'Nur angebotene Kurse zuteilbar', value: 'garantiert', note: 'Ein Schüler kann nie einem Kurs zugeteilt werden, der nicht ausgewählt wurde.' },
            ]}
          />
        </div>
```

- [ ] **Step 11.3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11.4: Commit**

```bash
git add frontend/src/pages/ConstraintsPage.tsx
git commit -m "docs: update ConstraintsPage to reflect configurable Rahmenbedingungen"
```

---

## Task 12: Update CHANGELOG and README

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 12.1: Add CHANGELOG entry**

Edit `CHANGELOG.md`. Prepend a new entry under the top heading (read the file first to match existing format):

```markdown
## 2026-04-16

### Breaking changes

- **Rahmenbedingungen sind konfigurierbar.** Anzahl Kurse pro Halbjahr, Standard- und Sonderkurs-Kapazitäten werden jetzt auf Seite 1 eingestellt statt hart kodiert zu sein. Die Defaults sind: HJ1 = 4, HJ2 = 4, default_max = 22, default_min = 1, Sonderkurs = frei wählbar (Default „Kochen" falls vorhanden), special_max = 14, special_min = 1. Bestehende Sessions werden beim ersten Öffnen von Seite 1 auf die neuen Defaults zurückgesetzt — Assignments gehen dabei verloren und müssen neu optimiert werden.

### Features

- Neuer Endpoint `GET /api/settings` und `PUT /api/settings`.
- UploadPage zeigt ein Formular für die Rahmenbedingungen. Der Auto-Redirect nach Upload entfällt; ein expliziter „Weiter zum Editor"-Button ersetzt ihn.
- Sonderkurs-Dropdown mit Default „Kochen" (falls in CSV vorhanden) und „– kein Sonderkurs –"-Option.
- Pre-Solve-Feasibility-Checks mit klaren Fehlermeldungen bei zu wenigen Kursen oder zu wenig Kapazität.
```

- [ ] **Step 12.2: Add README note**

Edit `README.md`. Find a relevant section (near a "Features" or "Getting Started" heading) and insert:

```markdown
Die Rahmenbedingungen (Anzahl Kurse pro Halbjahr, Kurskapazitäten, Sonderkurs)
werden auf Seite 1 eingestellt und gelten für alle nachfolgenden Optimierungen.
```

If no obvious section fits, add a short "Configuration" subsection under an existing overview heading.

- [ ] **Step 12.3: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: document configurable Rahmenbedingungen"
```

---

## Final Verification

- [ ] **Step F.1: Run all backend tests**

Run: `cd backend && pytest`
Expected: all tests PASS.

- [ ] **Step F.2: Run frontend type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step F.3: Run frontend build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step F.4: Manual smoke test (if environment allows)**

Walk through the 8 scenarios listed in Task 10.4. Document any issues in the PR/commit message.

- [ ] **Step F.5: Final commit summary**

Confirm all commits are clean and reflect logical groupings. No commit should mix feature work with unrelated changes (the repo already had many unrelated pre-existing modifications; those stay uncommitted by design).
