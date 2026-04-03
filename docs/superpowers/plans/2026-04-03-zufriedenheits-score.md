# Zufriedenheits-Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-level satisfaction scoring system (global, per-student, per-course) visible on the optimize page (live), results page, and in exports.

**Architecture:** Backend-computed scores (single source of truth). A new `scorer.py` module computes all scores from assignments + courses + students. The results and optimize endpoints return the score report alongside existing data. The exporter adds score columns and a summary sheet.

**Tech Stack:** Python (Pydantic models, PuLP score extraction), React/TypeScript (UI components), openpyxl (Excel export)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `backend/app/scorer.py` | Score computation logic |
| Modify | `backend/app/models.py` | New Pydantic models: `StudentScore`, `CourseScore`, `ScoreReport` |
| Modify | `backend/app/routers/results.py` | Return `ScoreReport` in response |
| Modify | `backend/app/routers/optimize.py` | Return `ScoreReport` from assignment endpoint |
| Modify | `backend/app/exporter.py` | Add score columns + summary sheet |
| Modify | `backend/app/routers/export.py` | Pass extra data to exporter |
| Modify | `frontend/src/types.ts` | TypeScript interfaces for score data |
| Modify | `frontend/src/api.ts` | Updated return types |
| Modify | `frontend/src/pages/ResultsPage.tsx` | Score header + enhanced tables |
| Modify | `frontend/src/pages/OptimizePage.tsx` | Live score display |
| Create | `tests/test_scorer.py` | Unit tests for scorer |

---

### Task 1: Pydantic Models

**Files:**
- Modify: `backend/app/models.py:31-37`

- [ ] **Step 1: Add score models to models.py**

Add after the existing `Assignment` class (line 37):

```python
class StudentScore(BaseModel):
    student_nr: int
    student_name: str
    score_total: int        # 0-16
    avg_priority: float     # average achieved priority (1.0-8.0)

class CourseScore(BaseModel):
    name: str
    semester: int
    avg_priority: float     # average priority of assigned students
    student_count: int
    max_students: int
    fill_rate: float        # 0.0-1.0

class ScoreReport(BaseModel):
    score_achieved: int
    score_maximum: int
    score_percent: float
    score_label: str        # "Exzellent", "Gut", "Akzeptabel", "Kritisch"
    score_description: str
    student_scores: list[StudentScore]
    course_scores: list[CourseScore]
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models.py
git commit -m "feat: add StudentScore, CourseScore, ScoreReport models"
```

---

### Task 2: Score Computation Module

**Files:**
- Create: `backend/app/scorer.py`
- Test: `tests/test_scorer.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_scorer.py`:

```python
from app.scorer import compute_score_report
from app.models import Student, Course, Assignment


def _make_assignment(nr, name, c1, s1, c2, s2):
    return Assignment(
        student_nr=nr, student_name=name,
        course_hj1=c1, score_hj1=s1,
        course_hj2=c2, score_hj2=s2,
    )


def _make_courses():
    return [
        Course(name="Bio", max_students=22, offered=True, semester=1),
        Course(name="Chemie", max_students=22, offered=True, semester=1),
        Course(name="Physik", max_students=22, offered=True, semester=1),
        Course(name="Mathe", max_students=22, offered=True, semester=1),
        Course(name="Kunst", max_students=22, offered=True, semester=2),
        Course(name="Musik", max_students=22, offered=True, semester=2),
        Course(name="Sport", max_students=22, offered=True, semester=2),
        Course(name="Theater", max_students=22, offered=True, semester=2),
        Course(name="Kochen", max_students=16, offered=False),
    ]


def test_perfect_score():
    """All students get priority 1 in both semesters -> 100%."""
    assignments = [
        _make_assignment(1, "Anna", "Bio", 8, "Kunst", 8),
        _make_assignment(2, "Ben", "Bio", 8, "Kunst", 8),
    ]
    courses = _make_courses()
    report = compute_score_report(assignments, courses)
    assert report.score_achieved == 32
    assert report.score_maximum == 32
    assert report.score_percent == 100.0
    assert report.score_label == "Exzellent"


def test_mixed_scores():
    """Students with varied scores."""
    assignments = [
        _make_assignment(1, "Anna", "Bio", 8, "Kunst", 6),  # prio 1 + prio 3
        _make_assignment(2, "Ben", "Chemie", 4, "Musik", 2),  # prio 5 + prio 7
    ]
    courses = _make_courses()
    report = compute_score_report(assignments, courses)
    assert report.score_achieved == 20  # 8+6+4+2
    assert report.score_maximum == 32
    assert report.score_percent == 62.5
    assert report.score_label == "Akzeptabel"


def test_student_scores():
    """Each student gets correct total and avg_priority."""
    assignments = [
        _make_assignment(1, "Anna", "Bio", 8, "Kunst", 6),  # prio 1 + 3 -> avg 2.0
        _make_assignment(2, "Ben", "Chemie", 4, "Musik", 2),  # prio 5 + 7 -> avg 6.0
    ]
    courses = _make_courses()
    report = compute_score_report(assignments, courses)
    anna = next(s for s in report.student_scores if s.student_nr == 1)
    ben = next(s for s in report.student_scores if s.student_nr == 2)
    assert anna.score_total == 14
    assert anna.avg_priority == 2.0
    assert ben.score_total == 6
    assert ben.avg_priority == 6.0


def test_course_scores():
    """Course scores include avg_priority and fill_rate."""
    assignments = [
        _make_assignment(1, "Anna", "Bio", 8, "Kunst", 6),
        _make_assignment(2, "Ben", "Bio", 6, "Kunst", 8),
    ]
    courses = _make_courses()
    report = compute_score_report(assignments, courses)
    bio = next(c for c in report.course_scores if c.name == "Bio")
    assert bio.student_count == 2
    assert bio.max_students == 22
    assert bio.fill_rate == round(2 / 22, 4)
    assert bio.avg_priority == 2.0  # (prio1 + prio3) / 2


def test_non_offered_courses_excluded():
    """Non-offered courses don't appear in course_scores."""
    assignments = [
        _make_assignment(1, "Anna", "Bio", 8, "Kunst", 8),
    ]
    courses = _make_courses()
    report = compute_score_report(assignments, courses)
    names = [c.name for c in report.course_scores]
    assert "Kochen" not in names


def test_empty_assignments():
    """No assignments -> zero scores."""
    courses = _make_courses()
    report = compute_score_report([], courses)
    assert report.score_achieved == 0
    assert report.score_maximum == 0
    assert report.score_percent == 0.0
    assert report.score_label == "Kritisch"


def test_score_labels():
    """Verify all label thresholds."""
    from app.scorer import _get_label
    assert _get_label(100.0) == ("Exzellent", "Fast alle Schueler in ihren Top-Wuenschen")
    assert _get_label(85.0) == ("Exzellent", "Fast alle Schueler in ihren Top-Wuenschen")
    assert _get_label(84.9) == ("Gut", "Die meisten Schueler in ihren Top-3-Wuenschen")
    assert _get_label(70.0) == ("Gut", "Die meisten Schueler in ihren Top-3-Wuenschen")
    assert _get_label(69.9) == ("Akzeptabel", "Einige Schueler mussten auf niedrigere Prioritaeten ausweichen")
    assert _get_label(55.0) == ("Akzeptabel", "Einige Schueler mussten auf niedrigere Prioritaeten ausweichen")
    assert _get_label(54.9) == ("Kritisch", "Viele Schueler haben ihre Wunschkurse nicht erhalten")
    assert _get_label(0.0) == ("Kritisch", "Viele Schueler haben ihre Wunschkurse nicht erhalten")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest ../tests/test_scorer.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.scorer'`

- [ ] **Step 3: Implement scorer.py**

Create `backend/app/scorer.py`:

```python
from app.models import Assignment, Course, StudentScore, CourseScore, ScoreReport


def _get_label(percent: float) -> tuple[str, str]:
    if percent >= 85.0:
        return ("Exzellent", "Fast alle Schueler in ihren Top-Wuenschen")
    if percent >= 70.0:
        return ("Gut", "Die meisten Schueler in ihren Top-3-Wuenschen")
    if percent >= 55.0:
        return ("Akzeptabel", "Einige Schueler mussten auf niedrigere Prioritaeten ausweichen")
    return ("Kritisch", "Viele Schueler haben ihre Wunschkurse nicht erhalten")


def _score_to_prio(score: int) -> float:
    """Convert internal score (1-8) to priority (8-1). Returns 0.0 for score <= 0."""
    return float(9 - score) if score > 0 else 0.0


def compute_score_report(
    assignments: list[Assignment],
    courses: list[Course],
) -> ScoreReport:
    score_achieved = sum(a.score_hj1 + a.score_hj2 for a in assignments)
    score_maximum = len(assignments) * 16  # 8 per semester * 2
    score_percent = round(score_achieved / score_maximum * 100, 1) if score_maximum > 0 else 0.0
    label, description = _get_label(score_percent)

    student_scores = []
    for a in assignments:
        total = a.score_hj1 + a.score_hj2
        prio1 = _score_to_prio(a.score_hj1)
        prio2 = _score_to_prio(a.score_hj2)
        avg_p = round((prio1 + prio2) / 2, 1) if (prio1 > 0 and prio2 > 0) else 0.0
        student_scores.append(StudentScore(
            student_nr=a.student_nr,
            student_name=a.student_name,
            score_total=total,
            avg_priority=avg_p,
        ))

    offered = {c.name: c for c in courses if c.offered and c.semester}
    course_data: dict[str, list[float]] = {name: [] for name in offered}
    for a in assignments:
        if a.course_hj1 in course_data:
            course_data[a.course_hj1].append(_score_to_prio(a.score_hj1))
        if a.course_hj2 in course_data:
            course_data[a.course_hj2].append(_score_to_prio(a.score_hj2))

    course_scores = []
    for name, prios in course_data.items():
        c = offered[name]
        count = len(prios)
        course_scores.append(CourseScore(
            name=name,
            semester=c.semester,
            avg_priority=round(sum(prios) / count, 1) if count > 0 else 0.0,
            student_count=count,
            max_students=c.max_students,
            fill_rate=round(count / c.max_students, 4) if c.max_students > 0 else 0.0,
        ))

    return ScoreReport(
        score_achieved=score_achieved,
        score_maximum=score_maximum,
        score_percent=score_percent,
        score_label=label,
        score_description=description,
        student_scores=student_scores,
        course_scores=course_scores,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest ../tests/test_scorer.py -v`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/scorer.py tests/test_scorer.py
git commit -m "feat: add scorer module with satisfaction score computation"
```

---

### Task 3: Results Endpoint — Return ScoreReport

**Files:**
- Modify: `backend/app/routers/results.py:1-44`

- [ ] **Step 1: Write failing test**

Add to `tests/test_api.py`:

```python
def test_results_include_score_report(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save), \
         patch("app.routers.optimize.session.load", side_effect=fake_load), \
         patch("app.routers.optimize.session.save", side_effect=fake_save), \
         patch("app.routers.results.session.load", side_effect=fake_load):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
        client.post("/api/optimize")
        response = client.get("/api/results")
    assert response.status_code == 200
    data = response.json()
    assert "score_report" in data
    report = data["score_report"]
    assert "score_achieved" in report
    assert "score_maximum" in report
    assert "score_percent" in report
    assert "score_label" in report
    assert "score_description" in report
    assert "student_scores" in report
    assert "course_scores" in report
    assert report["score_percent"] >= 0
    assert len(report["student_scores"]) == 2
    assert len(report["course_scores"]) == 8
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest ../tests/test_api.py::test_results_include_score_report -v`
Expected: FAIL with `KeyError: 'score_report'`

- [ ] **Step 3: Update results.py**

Replace the full content of `backend/app/routers/results.py`:

```python
from fastapi import APIRouter, HTTPException
from app import session
from app.scorer import compute_score_report

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

    report = compute_score_report(data.assignments, data.courses)

    return {
        "by_course": list(by_course.values()),
        "by_student": [a.model_dump() for a in data.assignments],
        "score_report": report.model_dump(),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest ../tests/test_api.py::test_results_include_score_report -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/results.py tests/test_api.py
git commit -m "feat: return ScoreReport from /api/results endpoint"
```

---

### Task 4: Optimize Assignments Endpoint — Return ScoreReport

**Files:**
- Modify: `backend/app/routers/optimize.py:26-42`

- [ ] **Step 1: Write failing test**

Add to `tests/test_api.py`:

```python
def test_optimize_assignments_returns_score_report(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save), \
         patch("app.routers.optimize.session.load", side_effect=fake_load), \
         patch("app.routers.optimize.session.save", side_effect=fake_save):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
        client.post("/api/optimize")
        response = client.post("/api/optimize/assignments")
    assert response.status_code == 200
    data = response.json()
    assert "score_report" in data
    assert data["score_report"]["score_percent"] >= 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest ../tests/test_api.py::test_optimize_assignments_returns_score_report -v`
Expected: FAIL with `KeyError: 'score_report'`

- [ ] **Step 3: Update optimize.py**

In `backend/app/routers/optimize.py`, add the import at line 3:

```python
from app.scorer import compute_score_report
```

Replace the return statement of `optimize_assignments_only` (line 42) with:

```python
    report = compute_score_report(data.assignments, data.courses)
    return {"assignment_count": len(assignments), "score_report": report.model_dump()}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest ../tests/test_api.py::test_optimize_assignments_returns_score_report -v`
Expected: PASS

- [ ] **Step 5: Run all tests to check nothing broke**

Run: `cd backend && pytest ../tests/ -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/optimize.py tests/test_api.py
git commit -m "feat: return ScoreReport from /api/optimize/assignments endpoint"
```

---

### Task 5: Export — Add Score Columns and Summary

**Files:**
- Modify: `backend/app/exporter.py:1-43`
- Modify: `backend/app/routers/export.py:1-31`

- [ ] **Step 1: Write failing test**

Add to `tests/test_api.py`:

```python
def test_export_csv_includes_scores(client):
    fake_load, fake_save = _make_mock_session()
    with patch("app.routers.upload.session.load", side_effect=fake_load), \
         patch("app.routers.upload.session.save", side_effect=fake_save), \
         patch("app.routers.optimize.session.load", side_effect=fake_load), \
         patch("app.routers.optimize.session.save", side_effect=fake_save), \
         patch("app.routers.export.session.load", side_effect=fake_load):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
        )
        client.post("/api/optimize")
        response = client.get("/api/export/csv")
    assert response.status_code == 200
    content = response.content.decode("utf-8-sig")
    lines = content.strip().split("\n")
    # First lines should be summary
    assert "Zufriedenheit" in lines[0]
    # Header row should include score columns
    header_line = next(l for l in lines if l.startswith("Nr."))
    assert "Gesamt-Score" in header_line
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest ../tests/test_api.py::test_export_csv_includes_scores -v`
Expected: FAIL

- [ ] **Step 3: Update exporter.py**

Replace the full content of `backend/app/exporter.py`:

```python
import csv
import io
import openpyxl
from app.models import Assignment, Course
from app.scorer import compute_score_report

HEADERS = ["Nr.", "Name", "Kurs HJ1", "Prio HJ1", "Kurs HJ2", "Prio HJ2", "Gesamt-Score", "Oe Prioritaet"]


def _score_to_prio(score: int) -> str:
    if score <= 0:
        return "–"
    return str(9 - score)


def _summary_lines(assignments: list[Assignment], courses: list[Course]) -> list[list[str]]:
    report = compute_score_report(assignments, courses)
    return [
        [f"Zufriedenheit: {report.score_percent}% — {report.score_label}"],
        [report.score_description],
        [f"Score: {report.score_achieved}/{report.score_maximum}"],
        [],
    ]


def to_csv(assignments: list[Assignment], courses: list[Course]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    for line in _summary_lines(assignments, courses):
        writer.writerow(line)
    writer.writerow(HEADERS)
    report = compute_score_report(assignments, courses)
    score_map = {s.student_nr: s for s in report.student_scores}
    for a in sorted(assignments, key=lambda x: x.student_nr):
        ss = score_map.get(a.student_nr)
        writer.writerow([
            a.student_nr, a.student_name,
            a.course_hj1, _score_to_prio(a.score_hj1),
            a.course_hj2, _score_to_prio(a.score_hj2),
            f"{ss.score_total}/16" if ss else "–",
            f"{ss.avg_priority:.1f}" if ss else "–",
        ])
    return buf.getvalue().encode("utf-8-sig")


def to_excel(assignments: list[Assignment], courses: list[Course]) -> bytes:
    report = compute_score_report(assignments, courses)
    score_map = {s.student_nr: s for s in report.student_scores}

    wb = openpyxl.Workbook()

    # Sheet 1: Zuteilung
    ws = wb.active
    ws.title = "Zuteilung"
    for line in _summary_lines(assignments, courses):
        ws.append(line)
    ws.append(HEADERS)
    for a in sorted(assignments, key=lambda x: x.student_nr):
        ss = score_map.get(a.student_nr)
        ws.append([
            a.student_nr, a.student_name,
            a.course_hj1, _score_to_prio(a.score_hj1),
            a.course_hj2, _score_to_prio(a.score_hj2),
            f"{ss.score_total}/16" if ss else "–",
            f"{ss.avg_priority:.1f}" if ss else "–",
        ])

    # Sheet 2: Kursuebersicht
    ws2 = wb.create_sheet("Kursuebersicht")
    ws2.append(["Kurs", "Halbjahr", "Schueler", "Max", "Auslastung", "Oe Prioritaet"])
    for cs in sorted(report.course_scores, key=lambda x: (x.semester, x.name)):
        ws2.append([
            cs.name,
            cs.semester,
            cs.student_count,
            cs.max_students,
            f"{cs.fill_rate * 100:.0f}%",
            f"{cs.avg_priority:.1f}",
        ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()
```

- [ ] **Step 4: Update export.py to pass courses**

Replace the full content of `backend/app/routers/export.py`:

```python
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from app import session, exporter

router = APIRouter(prefix="/api")


@router.get("/export/csv")
def export_csv():
    data = session.load()
    if not data.assignments:
        raise HTTPException(status_code=404, detail="Keine Ergebnisse vorhanden")
    content = exporter.to_csv(data.assignments, data.courses)
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=kurszuteilung.csv"},
    )


@router.get("/export/excel")
def export_excel():
    data = session.load()
    if not data.assignments:
        raise HTTPException(status_code=404, detail="Keine Ergebnisse vorhanden")
    content = exporter.to_excel(data.assignments, data.courses)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=kurszuteilung.xlsx"},
    )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest ../tests/test_api.py::test_export_csv_includes_scores -v`
Expected: PASS

- [ ] **Step 6: Run all backend tests**

Run: `cd backend && pytest ../tests/ -v`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/exporter.py backend/app/routers/export.py tests/test_api.py
git commit -m "feat: add score columns and summary to CSV/Excel exports"
```

---

### Task 6: Frontend Types and API Client

**Files:**
- Modify: `frontend/src/types.ts:38-47`
- Modify: `frontend/src/api.ts:39-45`

- [ ] **Step 1: Add TypeScript interfaces**

Add to `frontend/src/types.ts` after the `Assignment` interface (line 29):

```typescript
export interface StudentScore {
  student_nr: number
  student_name: string
  score_total: number
  avg_priority: number
}

export interface CourseScore {
  name: string
  semester: number
  avg_priority: number
  student_count: number
  max_students: number
  fill_rate: number
}

export interface ScoreReport {
  score_achieved: number
  score_maximum: number
  score_percent: number
  score_label: string
  score_description: string
  student_scores: StudentScore[]
  course_scores: CourseScore[]
}
```

Update the `ResultsData` interface to include `score_report`:

```typescript
export interface ResultsData {
  by_course: {
    name: string
    semester: number | null
    students: { nr: number; name: string; score: number; semester: number }[]
    avg_score: number
    count: number
  }[]
  by_student: Assignment[]
  score_report: ScoreReport
}
```

- [ ] **Step 2: Update api.ts return type for runAssignmentOptimization**

In `frontend/src/api.ts`, update the import (line 1) to include `ScoreReport`:

```typescript
import type { Student, Course, CourseStats, UploadResult, ResultsData, ScoreReport } from './types'
```

Update line 42-43:

```typescript
  runAssignmentOptimization: (): Promise<{ assignment_count: number; score_report: ScoreReport }> =>
    request('/optimize/assignments', { method: 'POST' }),
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat: add ScoreReport types and update API client"
```

---

### Task 7: ResultsPage — Score Header and Enhanced Tables

**Files:**
- Modify: `frontend/src/pages/ResultsPage.tsx:1-162`

- [ ] **Step 1: Add ScoreHeader and update tables**

Replace the full content of `frontend/src/pages/ResultsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ResultsData } from '../types'

function ScoreBadge({ score }: { score: number }) {
  const prio = score > 0 ? 9 - score : null
  if (!prio) return <span className="text-t3 text-xs">–</span>
  const style =
    prio <= 2 ? 'bg-ok/10 text-ok'
    : prio <= 4 ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
    : 'bg-err/10 text-err'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${style}`}>
      {prio}
    </span>
  )
}

function labelColor(label: string) {
  switch (label) {
    case 'Exzellent': return 'text-ok'
    case 'Gut': return 'text-yellow-600 dark:text-yellow-400'
    case 'Akzeptabel': return 'text-orange-600 dark:text-orange-400'
    default: return 'text-err'
  }
}

function labelBg(label: string) {
  switch (label) {
    case 'Exzellent': return 'bg-ok/10 border-ok/20'
    case 'Gut': return 'bg-yellow-500/10 border-yellow-500/20'
    case 'Akzeptabel': return 'bg-orange-500/10 border-orange-500/20'
    default: return 'bg-err/10 border-err/20'
  }
}

export default function ResultsPage() {
  const [results, setResults] = useState<ResultsData | null>(null)
  const [tab, setTab]         = useState<'course' | 'student'>('course')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    api.getResults()
      .then(setResults)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center gap-3 mt-16 justify-center text-t2">
      <div className="w-5 h-5 rounded-full border-2 border-border border-t-accent animate-spin-slow" />
      <span className="text-sm">Lade Ergebnisse…</span>
    </div>
  )
  if (error) return (
    <div className="mt-8 p-4 bg-err/[0.05] border border-err/20 rounded-xl text-err text-sm">{error}</div>
  )
  if (!results) return null

  const r = results.score_report

  return (
    <div>
      <div className="flex items-start justify-between mb-6 stagger-1">
        <div>
          <h1 className="font-display text-3xl font-bold text-t1 mb-1">Ergebnisse</h1>
          <p className="text-sm text-t2">Kurs- und Schuelerzuteilungen im Ueberblick</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={api.exportCsv}
            className="flex items-center gap-2 bg-elevated border border-border text-t1 px-4 py-2.5 rounded-xl text-sm
              font-medium hover:border-accent/40 hover:text-accent transition-all duration-200"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v9M4 7l4 4 4-4M2 13h12" />
            </svg>
            CSV
          </button>
          <button
            onClick={api.exportExcel}
            className="flex items-center gap-2 bg-ok text-surface px-4 py-2.5 rounded-xl text-sm
              font-semibold hover:bg-ok/90 transition-all duration-200 hover:shadow-glow active:scale-[0.97]"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v9M4 7l4 4 4-4M2 13h12" />
            </svg>
            Excel
          </button>
        </div>
      </div>

      {/* Score Header */}
      <div className={`stagger-2 mb-6 p-5 rounded-2xl border ${labelBg(r.score_label)}`}>
        <div className="flex items-center gap-4">
          <span className={`font-display text-4xl font-bold ${labelColor(r.score_label)}`}>
            {r.score_percent.toFixed(1)}%
          </span>
          <div>
            <span className={`font-semibold text-sm ${labelColor(r.score_label)}`}>{r.score_label}</span>
            <p className="text-xs text-t2 mt-0.5">{r.score_description}</p>
          </div>
        </div>
        <p className="text-xs text-t3 mt-2">
          Score: {r.score_achieved}/{r.score_maximum} Punkte
        </p>
      </div>

      {/* Tab switcher */}
      <div className="stagger-3 flex gap-1 p-1 bg-elevated border border-border rounded-xl w-fit mb-6">
        {(['course', 'student'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${tab === t
                ? 'bg-surface text-t1 shadow-card'
                : 'text-t2 hover:text-t1'}`}
          >
            {t === 'course' ? 'Pro Kurs' : 'Pro Schueler'}
          </button>
        ))}
      </div>

      {tab === 'course' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger-4">
          {results.by_course
            .sort((a, b) => (a.semester ?? 0) - (b.semester ?? 0))
            .map(course => {
              const cs = r.course_scores.find(c => c.name === course.name)
              return (
                <div
                  key={course.name}
                  className="bg-surface border border-border rounded-2xl p-5
                    hover:border-accent/20 hover:shadow-card-md transition-all duration-200"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-display font-semibold text-t1">{course.name}</h3>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ml-2
                        ${course.semester === 1
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : 'bg-violet-500/10 text-violet-600 dark:text-violet-400'}`}
                    >
                      HJ {course.semester}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-t2 mb-2">
                    <span className="font-medium">{course.count} Schueler</span>
                    <span className="w-1 h-1 rounded-full bg-border" />
                    <span>Oe Prioritaet {course.avg_score > 0 ? (9 - course.avg_score).toFixed(1) : '–'}</span>
                  </div>
                  {cs && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-xs text-t3 mb-1">
                        <span>Auslastung</span>
                        <span>{cs.student_count}/{cs.max_students} ({(cs.fill_rate * 100).toFixed(0)}%)</span>
                      </div>
                      <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(cs.fill_rate * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {course.students.map(s => (
                      <span
                        key={s.nr}
                        className="bg-elevated border border-border text-t2 text-xs px-2 py-0.5 rounded-full"
                      >
                        {s.name || `Nr. ${s.nr}`}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {tab === 'student' && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-card stagger-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated">
                {['Nr.', 'Name', 'HJ1 Kurs', 'Prio', 'HJ2 Kurs', 'Prio', 'Gesamt', 'Oe Prio'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-t2 text-xs font-semibold uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.by_student
                .sort((a, b) => a.student_nr - b.student_nr)
                .map(a => {
                  const ss = r.student_scores.find(s => s.student_nr === a.student_nr)
                  return (
                    <tr key={a.student_nr} className="hover:bg-elevated transition-colors duration-100">
                      <td className="px-4 py-2.5 font-mono text-t3 text-xs">{a.student_nr}</td>
                      <td className="px-4 py-2.5 font-medium text-t1">{a.student_name || '–'}</td>
                      <td className="px-4 py-2.5 text-t2 text-xs">{a.course_hj1}</td>
                      <td className="px-4 py-2.5"><ScoreBadge score={a.score_hj1} /></td>
                      <td className="px-4 py-2.5 text-t2 text-xs">{a.course_hj2}</td>
                      <td className="px-4 py-2.5"><ScoreBadge score={a.score_hj2} /></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-t1 font-semibold">
                        {ss ? `${ss.score_total}/16` : '–'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-t2">
                        {ss ? `Oe ${ss.avg_priority.toFixed(1)}` : '–'}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/ResultsPage.tsx
git commit -m "feat: add score header and enhanced tables to ResultsPage"
```

---

### Task 8: OptimizePage — Live Score Display

**Files:**
- Modify: `frontend/src/pages/OptimizePage.tsx:90-235`

- [ ] **Step 1: Add live score state and display**

Replace the full content of `frontend/src/pages/OptimizePage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../api'
import type { CourseStats, ScoreReport } from '../types'

function CourseCard({ course }: { course: CourseStats }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: course.name })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-surface border rounded-xl px-3.5 py-2.5 cursor-grab active:cursor-grabbing select-none
        transition-all duration-150
        ${isDragging
          ? 'border-accent/40 opacity-40 scale-95 shadow-glow'
          : 'border-border hover:border-accent/30 hover:shadow-card-md'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-t1 text-sm truncate">{course.name}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-t3 bg-elevated px-2 py-0.5 rounded-full font-medium">
            {course.total_interested}
          </span>
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-t3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 5h12M2 8h12M2 11h12" />
          </svg>
        </div>
      </div>
    </div>
  )
}

const COLUMNS = [
  {
    title:  'Halbjahr 1',
    border: 'border-blue-500/20 dark:border-blue-500/15',
    header: 'bg-blue-500/[0.06]',
    badge:  'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot:    'bg-blue-500',
  },
  {
    title:  'Halbjahr 2',
    border: 'border-violet-500/20 dark:border-violet-500/15',
    header: 'bg-violet-500/[0.06]',
    badge:  'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    dot:    'bg-violet-500',
  },
  {
    title:  'Nicht angeboten',
    border: 'border-border',
    header: 'bg-elevated',
    badge:  'bg-elevated text-t2',
    dot:    'bg-t3',
  },
] as const

function Column({ col, courses }: { col: typeof COLUMNS[number]; courses: CourseStats[] }) {
  return (
    <div className={`bg-surface border rounded-2xl overflow-hidden shadow-card ${col.border}`}>
      <div className={`${col.header} px-4 pt-4 pb-3 border-b border-border`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${col.dot}`} />
            <h3 className="font-display font-semibold text-t1 text-sm">{col.title}</h3>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${col.badge}`}>
            {courses.length}
          </span>
        </div>
      </div>
      <div className="p-3">
        <SortableContext items={courses.map(c => c.name)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 min-h-14">
            {courses.map(c => <CourseCard key={c.name} course={c} />)}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

function scoreLabelColor(label: string) {
  switch (label) {
    case 'Exzellent': return 'text-ok'
    case 'Gut': return 'text-yellow-600 dark:text-yellow-400'
    case 'Akzeptabel': return 'text-orange-600 dark:text-orange-400'
    default: return 'text-err'
  }
}

function scoreLabelBg(label: string) {
  switch (label) {
    case 'Exzellent': return 'bg-ok/10 border-ok/20'
    case 'Gut': return 'bg-yellow-500/10 border-yellow-500/20'
    case 'Akzeptabel': return 'bg-orange-500/10 border-orange-500/20'
    default: return 'bg-err/10 border-err/20'
  }
}

export default function OptimizePage() {
  const navigate = useNavigate()
  const [courses, setCourses]     = useState<CourseStats[]>([])
  const [loading, setLoading]     = useState(true)
  const [optimizing, setOptimizing] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [optimized, setOptimized] = useState(false)
  const [scoreReport, setScoreReport] = useState<ScoreReport | null>(null)

  useEffect(() => {
    api.getCourses().then(setCourses).finally(() => setLoading(false))
  }, [])

  const hj1        = courses.filter(c =>  c.offered && c.semester === 1)
  const hj2        = courses.filter(c =>  c.offered && c.semester === 2)
  const notOffered = courses.filter(c => !c.offered)

  const runOptimization = async () => {
    setOptimizing(true)
    try {
      await api.runFullOptimization()
      const updated = await api.getCourses()
      setCourses(updated)
      // Fetch initial score via results endpoint
      try {
        const results = await api.getResults()
        setScoreReport(results.score_report)
      } catch { /* score display is optional here */ }
      setOptimized(true)
    } finally {
      setOptimizing(false)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedName = active.id as string
    const targetName  = over.id  as string
    const dragged = courses.find(c => c.name === draggedName)
    const target  = courses.find(c => c.name === targetName)
    if (!dragged || !target) return

    const previousCourses = courses
    const previousScore = scoreReport
    const newCourses = courses.map(c => {
      if (c.name === draggedName) return { ...c, semester: target.semester,  offered: target.offered }
      if (c.name === targetName)  return { ...c, semester: dragged.semester, offered: dragged.offered }
      return c
    })
    setCourses(newCourses as CourseStats[])

    setReassigning(true)
    try {
      await api.updateCourse(draggedName, { offered: target.offered  ?? false, semester: target.semester  ?? undefined })
      await api.updateCourse(targetName,  { offered: dragged.offered,          semester: dragged.semester ?? undefined })
      const result = await api.runAssignmentOptimization()
      setScoreReport(result.score_report)
    } catch {
      setCourses(previousCourses)
      setScoreReport(previousScore)
    } finally {
      setReassigning(false)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-3 mt-16 justify-center text-t2">
      <div className="w-5 h-5 rounded-full border-2 border-border border-t-accent animate-spin-slow" />
      <span className="text-sm">Lade Kurse…</span>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6 stagger-1">
        <div>
          <h1 className="font-display text-3xl font-bold text-t1 mb-1">Optimierung</h1>
          <p className="text-sm text-t2">ILP-Algorithmus fuer maximale Schuelerzufriedenheit</p>
        </div>
        {optimized && (
          <button
            onClick={() => navigate('/results')}
            className="flex items-center gap-2 bg-ok text-surface px-5 py-2.5 rounded-xl font-semibold text-sm
              hover:bg-ok/90 transition-all duration-200 hover:shadow-glow active:scale-[0.97]"
          >
            Ergebnisse ansehen
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </button>
        )}
      </div>

      {!optimized ? (
        <div className="flex flex-col items-center justify-center py-20 stagger-2">
          <div className="w-20 h-20 rounded-3xl bg-accent/[0.08] border border-accent/15 flex items-center justify-center mb-8">
            <svg viewBox="0 0 32 32" className="w-10 h-10 text-accent" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="16" cy="16" r="12" />
              <path d="M16 8v8l5 3" />
              <path d="M8 4l2 3M24 4l-2 3M4 24l3-2M28 24l-3-2" />
            </svg>
          </div>
          <p className="text-t2 text-center max-w-sm mb-8 leading-relaxed text-sm">
            Der Algorithmus waehlt automatisch die{' '}
            <strong className="text-t1 font-semibold">8 besten Kurse</strong>{' '}
            aus und teilt die Schueler optimal zu — maximale Zufriedenheit durch{' '}
            <em className="not-italic text-accent">Integer Linear Programming</em>.
          </p>
          <button
            onClick={runOptimization}
            disabled={optimizing}
            className="flex items-center gap-3 bg-accent text-surface px-10 py-4 rounded-2xl font-bold
              hover:bg-accent/90 disabled:opacity-50 transition-all duration-200
              hover:shadow-glow active:scale-[0.97] text-sm tracking-wide"
          >
            {optimizing ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin-slow" />
                Optimierung laeuft…
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
                  <polygon points="5,2 14,8 5,14" />
                </svg>
                Optimierung starten
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="stagger-2">
          {/* Live Score Display */}
          {scoreReport && (
            <div className={`mb-4 p-4 rounded-xl border transition-all duration-300 ${scoreLabelBg(scoreReport.score_label)}`}>
              <div className="flex items-center gap-3">
                <span className={`font-display text-2xl font-bold tabular-nums ${scoreLabelColor(scoreReport.score_label)}`}>
                  {scoreReport.score_percent.toFixed(1)}%
                </span>
                <span className={`text-sm font-medium ${scoreLabelColor(scoreReport.score_label)}`}>
                  {scoreReport.score_label}
                </span>
                <span className="text-xs text-t3">— {scoreReport.score_description}</span>
              </div>
            </div>
          )}
          {reassigning && (
            <div className="mb-4 px-4 py-3 bg-accent/[0.06] border border-accent/15 rounded-xl flex items-center gap-3">
              <div className="w-4 h-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin-slow flex-shrink-0" />
              <span className="text-sm text-accent font-medium">Zuteilung wird neu berechnet…</span>
            </div>
          )}
          <p className="text-xs text-t3 mb-4">
            Kurse per Drag & Drop zwischen den Halbjahren oder in „Nicht angeboten" verschieben.
          </p>
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-3 gap-4">
              <Column col={COLUMNS[0]} courses={hj1} />
              <Column col={COLUMNS[1]} courses={hj2} />
              <Column col={COLUMNS[2]} courses={notOffered} />
            </div>
          </DndContext>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/OptimizePage.tsx
git commit -m "feat: add live score display to OptimizePage"
```

---

### Task 9: Final Integration Test

**Files:**
- Test: `tests/test_api.py`

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && pytest ../tests/ -v`
Expected: All tests PASS (including new score tests)

- [ ] **Step 2: Run frontend build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No TypeScript errors

- [ ] **Step 3: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "feat: complete Zufriedenheits-Score feature integration"
```
