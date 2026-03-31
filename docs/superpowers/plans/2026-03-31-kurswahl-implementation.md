# Kurswahl WebApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Docker-basierte WebApp, mit der ein Lehrer eine CSV-Datei mit Schülerpräferenzen hochlädt, daraus automatisch 8 Kurse (4 pro Halbjahr) auswählt und Schüler optimal zuteilt — mit manueller Nachkorrektur und CSV/Excel-Export.

**Architecture:** FastAPI-Backend (Python) mit PuLP-ILP-Optimierer und JSON-Session-State. React-Frontend (TypeScript + Vite + Tailwind) mit Drag-&-Drop-Kursauswahl. Docker Compose mit nginx-Proxy.

**Tech Stack:** Python 3.12, FastAPI, PuLP (CBC-Solver), openpyxl, pytest, React 18, TypeScript, Vite, Tailwind CSS, @dnd-kit/core, React Router v6

---

## Dateistruktur

```
kurswahl/
├── docker-compose.yml
├── .gitignore
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py           # FastAPI-App, CORS, Router-Registrierung
│       ├── models.py         # Pydantic-Modelle (Student, Course, Assignment)
│       ├── session.py        # JSON-basierter Session-State (/data/session.json)
│       ├── parser.py         # CSV-Parser & Validierung
│       ├── optimizer.py      # PuLP ILP: Kursauswahl + Schülerzuteilung
│       ├── exporter.py       # CSV- und Excel-Export
│       └── routers/
│           ├── upload.py     # POST /api/upload
│           ├── students.py   # GET /api/students, PATCH /api/students/{nr}
│           ├── courses.py    # GET /api/courses, PATCH /api/courses/{name}
│           ├── optimize.py   # POST /api/optimize, POST /api/optimize/assignments
│           ├── results.py    # GET /api/results
│           └── export.py     # GET /api/export/csv, GET /api/export/excel
├── tests/
│   ├── conftest.py
│   ├── test_parser.py
│   ├── test_optimizer.py
│   └── test_api.py
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── types.ts          # TypeScript-Interfaces
        ├── api.ts            # API-Client-Funktionen
        └── pages/
            ├── UploadPage.tsx
            ├── EditorPage.tsx
            ├── OptimizePage.tsx
            └── ResultsPage.tsx
```

---

## Task 1: Repo-Scaffold & Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `.gitignore`
- Create: `backend/Dockerfile`
- Create: `backend/requirements.txt`
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`

- [ ] **Step 1: Verzeichnisstruktur anlegen**

```bash
mkdir -p backend/app/routers frontend/src/pages tests
touch backend/app/__init__.py backend/app/routers/__init__.py
```

- [ ] **Step 2: `.gitignore` erstellen**

```
__pycache__/
*.pyc
.pytest_cache/
*.egg-info/
node_modules/
dist/
.env
/data/
```

- [ ] **Step 3: `backend/requirements.txt` erstellen**

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
python-multipart==0.0.9
pulp==2.8.0
openpyxl==3.1.2
pydantic==2.7.0
pytest==8.2.0
httpx==0.27.0
```

- [ ] **Step 4: `backend/Dockerfile` erstellen**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
RUN mkdir -p /data
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 5: `frontend/nginx.conf` erstellen**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8000/api/;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 6: `frontend/Dockerfile` erstellen**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

- [ ] **Step 7: `docker-compose.yml` erstellen**

```yaml
services:
  backend:
    build: ./backend
    volumes:
      - kurswahl_data:/data
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  kurswahl_data:
```

- [ ] **Step 8: Commit**

```bash
git init
git add .
git commit -m "feat: initial project scaffold with Docker Compose"
```

---

## Task 2: Backend-Datenmodelle & Session-State

**Files:**
- Create: `backend/app/models.py`
- Create: `backend/app/session.py`
- Create: `backend/app/main.py`

- [ ] **Step 1: `backend/app/models.py` erstellen**

```python
from pydantic import BaseModel
from typing import Optional


class Student(BaseModel):
    nr: int
    name: str = ""
    preferences: dict[str, int]  # {Kursname: Priorität 0–8}
    valid: bool
    errors: list[str]


class Course(BaseModel):
    name: str
    min_students: int = 15
    max_students: int = 22
    offered: bool = False
    semester: Optional[int] = None  # 1 oder 2


class CourseStats(BaseModel):
    name: str
    min_students: int
    max_students: int
    offered: bool
    semester: Optional[int]
    demand: dict[int, int]   # {Priorität: Anzahl SuS}
    total_interested: int    # Anzahl SuS mit Priorität > 0


class Assignment(BaseModel):
    student_nr: int
    student_name: str
    course_hj1: str
    course_hj2: str
    score_hj1: int
    score_hj2: int


class SessionData(BaseModel):
    students: list[Student] = []
    courses: list[Course] = []
    assignments: list[Assignment] = []


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    preferences: Optional[dict[str, int]] = None


class CourseUpdate(BaseModel):
    offered: Optional[bool] = None
    semester: Optional[int] = None
```

- [ ] **Step 2: `backend/app/session.py` erstellen**

```python
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
```

- [ ] **Step 3: `backend/app/main.py` erstellen**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Kurswahl API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 4: Health-Check testen**

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# In anderem Terminal:
curl http://localhost:8000/api/health
# Erwartet: {"status":"ok"}
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/session.py backend/app/main.py
git commit -m "feat: backend data models and session state"
```

---

## Task 3: CSV-Parser & Validierung (TDD)

**Files:**
- Create: `backend/app/parser.py`
- Create: `tests/conftest.py`
- Create: `tests/test_parser.py`

- [ ] **Step 1: `tests/conftest.py` erstellen**

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


VALID_CSV = """Nr.;Body Percussion;Debating;Kochen;Medien;Podcast;Psychologie;Rhetorik;Schach;Stricken;Theater;Wirtschaft;Häkeln;History Hunters;Improvisation;Just Relax;Move&Groove;Musik am Computer;Girls' Empowerment
5;0;6;2;0;0;1;7;8;0;0;4;0;3;0;0;0;5;0
6;0;6;1;0;8;7;4;0;0;5;0;0;0;2;0;0;3;0
"""

INVALID_CSV_DUPLICATE = """Nr.;Body Percussion;Debating;Kochen;Medien;Podcast;Psychologie;Rhetorik;Schach;Stricken;Theater;Wirtschaft;Häkeln;History Hunters;Improvisation;Just Relax;Move&Groove;Musik am Computer;Girls' Empowerment
8;8;2;7;1;4;2;3;5;0;0;1;6;3;4;5;8;6;0
"""

EMPTY_ROW_CSV = """Nr.;Body Percussion;Debating;Kochen;Medien;Podcast;Psychologie;Rhetorik;Schach;Stricken;Theater;Wirtschaft;Häkeln;History Hunters;Improvisation;Just Relax;Move&Groove;Musik am Computer;Girls' Empowerment
2;;;;;;;;;;;;;;;;;;
"""
```

- [ ] **Step 2: Failing tests für den Parser schreiben (`tests/test_parser.py`)**

```python
from app.parser import parse_csv, validate_student
from app.models import Student


def test_parse_valid_csv(tmp_path):
    from tests.conftest import VALID_CSV
    f = tmp_path / "test.csv"
    f.write_text(VALID_CSV, encoding="utf-8")
    students, course_names = parse_csv(f.read_bytes())
    assert len(students) == 2
    assert all(s.valid for s in students)


def test_valid_student_has_exactly_8_priorities():
    prefs = {f"Kurs{i}": i for i in range(1, 9)}
    for i in range(9, 19):
        prefs[f"Kurs{i}"] = 0
    student = validate_student(nr=1, name="", raw_prefs=prefs)
    assert student.valid
    assert student.errors == []


def test_invalid_duplicate_priority():
    prefs = {"A": 1, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5, "G": 6, "H": 7, "I": 0}
    student = validate_student(nr=8, name="", raw_prefs=prefs)
    assert not student.valid
    assert any("Priorität 1" in e for e in student.errors)


def test_invalid_value_out_of_range():
    prefs = {"A": 9, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5, "G": 6, "H": 7, "I": 0}
    student = validate_student(nr=66, name="", raw_prefs=prefs)
    assert not student.valid
    assert any("ungültig" in e.lower() for e in student.errors)


def test_invalid_too_few_priorities():
    prefs = {"A": 1, "B": 2, "C": 0, "D": 0, "E": 0, "F": 0, "G": 0, "H": 0, "I": 0}
    student = validate_student(nr=80, name="", raw_prefs=prefs)
    assert not student.valid
    assert any("8 Prioritäten" in e for e in student.errors)


def test_empty_row_is_ignored():
    from tests.conftest import EMPTY_ROW_CSV
    students, _ = parse_csv(EMPTY_ROW_CSV.encode())
    assert len(students) == 0


def test_parse_returns_course_names():
    from tests.conftest import VALID_CSV
    _, course_names = parse_csv(VALID_CSV.encode())
    assert "Kochen" in course_names
    assert "Debating" in course_names
    assert len(course_names) == 18
```

- [ ] **Step 3: Tests ausführen — müssen fehlschlagen**

```bash
cd backend
pytest ../tests/test_parser.py -v
# Erwartet: ImportError oder FAILED (parser.py existiert noch nicht)
```

- [ ] **Step 4: `backend/app/parser.py` implementieren**

```python
import csv
import io
from app.models import Student


def validate_student(nr: int, name: str, raw_prefs: dict[str, int]) -> Student:
    errors = []
    prefs: dict[str, int] = {}

    for course, val in raw_prefs.items():
        if val < 0 or val > 8:
            errors.append(f"Ungültiger Wert {val} für Kurs '{course}' (erlaubt: 0–8)")
        prefs[course] = val

    non_zero = [v for v in prefs.values() if v != 0]
    if len(non_zero) != 8:
        errors.append(f"Genau 8 Prioritäten erwartet, {len(non_zero)} gefunden")

    seen: dict[int, list[str]] = {}
    for course, val in prefs.items():
        if val > 0:
            seen.setdefault(val, []).append(course)
    for prio, courses in seen.items():
        if len(courses) > 1:
            errors.append(f"Priorität {prio} mehrfach vergeben: {', '.join(courses)}")

    return Student(
        nr=nr,
        name=name,
        preferences=prefs,
        valid=len(errors) == 0,
        errors=errors,
    )


def parse_csv(content: bytes) -> tuple[list[Student], list[str]]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    course_names = [f for f in reader.fieldnames if f and f != "Nr."]
    students: list[Student] = []

    for row in reader:
        nr_raw = row.get("Nr.", "").strip()
        if not nr_raw:
            continue
        values = [row.get(c, "").strip() for c in course_names]
        if all(v == "" for v in values):
            continue  # Leere Zeile still ignorieren

        raw_prefs: dict[str, int] = {}
        for course in course_names:
            raw = row.get(course, "").strip()
            try:
                raw_prefs[course] = int(raw) if raw != "" else 0
            except ValueError:
                raw_prefs[course] = -1  # Wird als ungültig erkannt

        students.append(validate_student(nr=int(nr_raw), name="", raw_prefs=raw_prefs))

    return students, course_names
```

- [ ] **Step 5: Tests ausführen — müssen alle bestehen**

```bash
pytest ../tests/test_parser.py -v
# Erwartet: 7 passed
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/parser.py tests/conftest.py tests/test_parser.py
git commit -m "feat: CSV parser with validation (TDD)"
```

---

## Task 4: Upload-Endpoint

**Files:**
- Create: `backend/app/routers/upload.py`
- Modify: `backend/app/main.py`
- Create: `tests/test_api.py`

- [ ] **Step 1: Failing API-Test schreiben (`tests/test_api.py`)**

```python
import io
from tests.conftest import VALID_CSV, INVALID_CSV_DUPLICATE


def test_upload_valid_csv(client):
    response = client.post(
        "/api/upload",
        files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["valid_count"] == 2
    assert data["invalid_count"] == 0
    assert data["total"] == 2


def test_upload_csv_with_errors(client):
    response = client.post(
        "/api/upload",
        files={"file": ("test.csv", io.BytesIO(INVALID_CSV_DUPLICATE.encode()), "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["invalid_count"] == 1
    assert data["valid_count"] == 0


def test_upload_rejects_non_csv(client):
    response = client.post(
        "/api/upload",
        files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert response.status_code == 400
```

- [ ] **Step 2: Tests ausführen — müssen fehlschlagen**

```bash
pytest ../tests/test_api.py -v
# Erwartet: FAILED (404 Not Found)
```

- [ ] **Step 3: `backend/app/routers/upload.py` implementieren**

```python
from fastapi import APIRouter, File, UploadFile, HTTPException
from app.models import Course
from app import session, parser

router = APIRouter(prefix="/api")

COURSE_CAPS: dict[str, int] = {"Kochen": 16}


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Nur CSV-Dateien erlaubt")

    content = await file.read()
    students, course_names = parser.parse_csv(content)

    courses = [
        Course(
            name=name,
            max_students=COURSE_CAPS.get(name, 22),
        )
        for name in course_names
    ]

    data = session.load()
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

- [ ] **Step 4: Router in `main.py` registrieren**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import upload

app = FastAPI(title="Kurswahl API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Tests ausführen — müssen bestehen**

```bash
pytest ../tests/test_api.py -v
# Erwartet: 3 passed
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/upload.py backend/app/main.py tests/test_api.py
git commit -m "feat: POST /api/upload endpoint"
```

---

## Task 5: Students & Courses Endpoints

**Files:**
- Create: `backend/app/routers/students.py`
- Create: `backend/app/routers/courses.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Failing Tests ergänzen (in `tests/test_api.py` anfügen)**

```python
def test_get_students_after_upload(client):
    client.post(
        "/api/upload",
        files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
    )
    response = client.get("/api/students")
    assert response.status_code == 200
    students = response.json()
    assert len(students) == 2
    assert students[0]["nr"] == 5


def test_patch_student_name(client):
    client.post(
        "/api/upload",
        files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
    )
    response = client.patch("/api/students/5", json={"name": "Max Mustermann"})
    assert response.status_code == 200
    assert response.json()["name"] == "Max Mustermann"


def test_get_courses_with_demand(client):
    client.post(
        "/api/upload",
        files={"file": ("test.csv", io.BytesIO(VALID_CSV.encode()), "text/csv")},
    )
    response = client.get("/api/courses")
    assert response.status_code == 200
    courses = response.json()
    assert len(courses) == 18
    kochen = next(c for c in courses if c["name"] == "Kochen")
    assert kochen["max_students"] == 16
    assert kochen["total_interested"] > 0
```

- [ ] **Step 2: Tests ausführen — müssen fehlschlagen**

```bash
pytest ../tests/test_api.py::test_get_students_after_upload -v
# Erwartet: FAILED (404)
```

- [ ] **Step 3: `backend/app/routers/students.py` implementieren**

```python
from fastapi import APIRouter, HTTPException
from app import session
from app.models import StudentUpdate

router = APIRouter(prefix="/api")


@router.get("/students")
def get_students():
    return session.load().students


@router.patch("/students/{nr}")
def update_student(nr: int, update: StudentUpdate):
    data = session.load()
    student = next((s for s in data.students if s.nr == nr), None)
    if not student:
        raise HTTPException(status_code=404, detail="Schüler nicht gefunden")

    if update.name is not None:
        student.name = update.name
    if update.preferences is not None:
        from app.parser import validate_student
        updated = validate_student(student.nr, student.name, update.preferences)
        student.preferences = updated.preferences
        student.valid = updated.valid
        student.errors = updated.errors

    session.save(data)
    return student
```

- [ ] **Step 4: `backend/app/routers/courses.py` implementieren**

```python
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
```

- [ ] **Step 5: Router in `main.py` registrieren**

```python
from app.routers import upload, students, courses

# ... (nach bisherigen includes)
app.include_router(students.router)
app.include_router(courses.router)
```

- [ ] **Step 6: Tests ausführen — müssen bestehen**

```bash
pytest ../tests/test_api.py -v
# Erwartet: alle bisherigen Tests grün
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/students.py backend/app/routers/courses.py backend/app/main.py tests/test_api.py
git commit -m "feat: students and courses API endpoints"
```

---

## Task 6: Optimierungsalgorithmus (PuLP ILP)

**Files:**
- Create: `backend/app/optimizer.py`
- Create: `tests/test_optimizer.py`

- [ ] **Step 1: Failing Tests schreiben (`tests/test_optimizer.py`)**

```python
from app.optimizer import run_full_optimization, run_assignment_optimization
from app.models import Student, Course, Assignment


def make_students(n: int, course_names: list[str]) -> list[Student]:
    """Erstellt n Schüler, jeder wählt die ersten 8 Kurse als Prio 1–8."""
    students = []
    for i in range(n):
        prefs = {c: 0 for c in course_names}
        for rank, course in enumerate(course_names[:8], start=1):
            prefs[course] = rank
        students.append(Student(
            nr=i + 1, name="", preferences=prefs, valid=True, errors=[]
        ))
    return students


def make_courses(names: list[str]) -> list[Course]:
    return [Course(name=n, max_students=16 if n == "Kochen" else 22) for n in names]


COURSE_NAMES = [
    "Body Percussion", "Debating", "Girls' Empowerment", "Häkeln",
    "History Hunters", "Improvisation", "Just Relax", "Kochen",
    "Medien", "Move&Groove", "Musik am Computer", "Podcast",
    "Psychologie", "Rhetorik", "Schach", "Stricken", "Theater", "Wirtschaft"
]


def test_full_optimization_selects_8_courses():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    updated_courses, assignments = run_full_optimization(students, courses)
    offered = [c for c in updated_courses if c.offered]
    assert len(offered) == 8


def test_full_optimization_4_per_semester():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    updated_courses, _ = run_full_optimization(students, courses)
    hj1 = [c for c in updated_courses if c.semester == 1]
    hj2 = [c for c in updated_courses if c.semester == 2]
    assert len(hj1) == 4
    assert len(hj2) == 4


def test_each_student_gets_one_course_per_semester():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    _, assignments = run_full_optimization(students, courses)
    assert len(assignments) == 60
    for a in assignments:
        assert a.course_hj1 != ""
        assert a.course_hj2 != ""


def test_course_capacity_respected():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    updated_courses, assignments = run_full_optimization(students, courses)
    for course in updated_courses:
        if not course.offered:
            continue
        count_hj1 = sum(1 for a in assignments if a.course_hj1 == course.name)
        count_hj2 = sum(1 for a in assignments if a.course_hj2 == course.name)
        total = count_hj1 + count_hj2
        if total > 0:
            assert total <= course.max_students
            assert total >= 15


def test_assignment_only_optimization():
    students = make_students(60, COURSE_NAMES)
    courses = make_courses(COURSE_NAMES)
    courses[0].offered = True; courses[0].semester = 1
    courses[1].offered = True; courses[1].semester = 1
    courses[2].offered = True; courses[2].semester = 1
    courses[3].offered = True; courses[3].semester = 1
    courses[4].offered = True; courses[4].semester = 2
    courses[5].offered = True; courses[5].semester = 2
    courses[6].offered = True; courses[6].semester = 2
    courses[7].offered = True; courses[7].semester = 2
    assignments = run_assignment_optimization(students, courses)
    assert len(assignments) == 60
```

- [ ] **Step 2: Tests ausführen — müssen fehlschlagen**

```bash
pytest ../tests/test_optimizer.py -v
# Erwartet: ImportError
```

- [ ] **Step 3: `backend/app/optimizer.py` implementieren**

```python
from pulp import (
    LpProblem, LpMaximize, LpVariable, lpSum, LpBinary, value, PULP_CBC_CMD
)
from app.models import Student, Course, Assignment


def _build_score(students: list[Student], course_names: list[str]) -> dict:
    """Berechnet den Zufriedenheitsscore pro Schüler-Kurs-Kombination."""
    score = {}
    for i, s in enumerate(students):
        for c in course_names:
            prio = s.preferences.get(c, 0)
            score[(i, c)] = (9 - prio) if prio > 0 else -5
    return score


def run_full_optimization(
    students: list[Student], courses: list[Course]
) -> tuple[list[Course], list[Assignment]]:
    """
    Volloptimierung: wählt 8 Kurse (4 pro HJ) und teilt Schüler zu.
    Gibt aktualisierte Kursliste und Zuteilungen zurück.
    """
    valid = [s for s in students if s.valid]
    course_names = [c.name for c in courses]
    max_cap = {c.name: c.max_students for c in courses}
    score = _build_score(valid, course_names)

    prob = LpProblem("Kurswahl_Full", LpMaximize)
    S = range(len(valid))

    offer  = {c: LpVariable(f"offer_{i}",  cat=LpBinary) for i, c in enumerate(course_names)}
    in_hj1 = {c: LpVariable(f"hj1_{i}",   cat=LpBinary) for i, c in enumerate(course_names)}
    in_hj2 = {c: LpVariable(f"hj2_{i}",   cat=LpBinary) for i, c in enumerate(course_names)}
    a1 = {(s, c): LpVariable(f"a1_{s}_{i}", cat=LpBinary)
          for s in S for i, c in enumerate(course_names)}
    a2 = {(s, c): LpVariable(f"a2_{s}_{i}", cat=LpBinary)
          for s in S for i, c in enumerate(course_names)}

    # Zielfunktion
    prob += lpSum(score[(s, c)] * (a1[(s, c)] + a2[(s, c)])
                  for s in S for c in course_names)

    # Kurs-Constraints
    prob += lpSum(offer[c] for c in course_names) == 8
    prob += lpSum(in_hj1[c] for c in course_names) == 4
    for c in course_names:
        prob += in_hj1[c] + in_hj2[c] == offer[c]

    # Kapazitäts-Constraints
    for c in course_names:
        n1 = lpSum(a1[(s, c)] for s in S)
        n2 = lpSum(a2[(s, c)] for s in S)
        prob += n1 <= max_cap[c] * in_hj1[c]
        prob += n1 >= 15 * in_hj1[c]
        prob += n2 <= max_cap[c] * in_hj2[c]
        prob += n2 >= 15 * in_hj2[c]

    # Schüler-Constraints
    for s in S:
        prob += lpSum(a1[(s, c)] for c in course_names) == 1
        prob += lpSum(a2[(s, c)] for c in course_names) == 1
        for c in course_names:
            prob += a1[(s, c)] <= in_hj1[c]
            prob += a2[(s, c)] <= in_hj2[c]

    prob.solve(PULP_CBC_CMD(msg=0))

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


def run_assignment_optimization(
    students: list[Student], courses: list[Course]
) -> list[Assignment]:
    """
    Nur Schülerzuteilung neu berechnen — Kurs/HJ-Konfiguration ist fix.
    """
    valid = [s for s in students if s.valid]
    hj1 = [c.name for c in courses if c.offered and c.semester == 1]
    hj2 = [c.name for c in courses if c.offered and c.semester == 2]
    max_cap = {c.name: c.max_students for c in courses}
    score = _build_score(valid, hj1 + hj2)

    prob = LpProblem("Kurswahl_Assign", LpMaximize)
    S = range(len(valid))

    a1 = {(s, c): LpVariable(f"a1_{s}_{c}", cat=LpBinary) for s in S for c in hj1}
    a2 = {(s, c): LpVariable(f"a2_{s}_{c}", cat=LpBinary) for s in S for c in hj2}

    prob += lpSum(score[(s, c)] * a1[(s, c)] for s in S for c in hj1) + \
           lpSum(score[(s, c)] * a2[(s, c)] for s in S for c in hj2)

    for c in hj1:
        n = lpSum(a1[(s, c)] for s in S)
        prob += n <= max_cap[c]
        prob += n >= 15
    for c in hj2:
        n = lpSum(a2[(s, c)] for s in S)
        prob += n <= max_cap[c]
        prob += n >= 15
    for s in S:
        prob += lpSum(a1[(s, c)] for c in hj1) == 1
        prob += lpSum(a2[(s, c)] for c in hj2) == 1

    prob.solve(PULP_CBC_CMD(msg=0))

    # Dummy-Variablen-Mapping für _build_assignments
    a1_all = {(s, c): a1[(s, c)] for s in S for c in hj1}
    a2_all = {(s, c): a2[(s, c)] for s in S for c in hj2}
    return _build_assignments(valid, courses, a1_all, a2_all, score)


def _build_assignments(
    students, courses, a1, a2, score
) -> list[Assignment]:
    hj1_names = {c.name for c in courses if c.offered and c.semester == 1}
    hj2_names = {c.name for c in courses if c.offered and c.semester == 2}

    assignments = []
    for s_idx, student in enumerate(students):
        c_hj1 = next(
            (c for c in hj1_names if (s_idx, c) in a1 and round(value(a1[(s_idx, c)])) == 1),
            ""
        )
        c_hj2 = next(
            (c for c in hj2_names if (s_idx, c) in a2 and round(value(a2[(s_idx, c)])) == 1),
            ""
        )
        assignments.append(Assignment(
            student_nr=student.nr,
            student_name=student.name,
            course_hj1=c_hj1,
            course_hj2=c_hj2,
            score_hj1=max(0, score.get((s_idx, c_hj1), 0)),
            score_hj2=max(0, score.get((s_idx, c_hj2), 0)),
        ))
    return assignments
```

- [ ] **Step 4: Tests ausführen — müssen bestehen**

```bash
pytest ../tests/test_optimizer.py -v
# Erwartet: 5 passed (kann 5–30 Sekunden dauern)
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/optimizer.py tests/test_optimizer.py
git commit -m "feat: PuLP ILP optimizer (full + assignment-only)"
```

---

## Task 7: Optimize, Results & Export Endpoints

**Files:**
- Create: `backend/app/routers/optimize.py`
- Create: `backend/app/routers/results.py`
- Create: `backend/app/routers/export.py`
- Create: `backend/app/exporter.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: `backend/app/routers/optimize.py` erstellen**

```python
from fastapi import APIRouter, HTTPException
from app import session
from app.optimizer import run_full_optimization, run_assignment_optimization

router = APIRouter(prefix="/api")


@router.post("/optimize")
def optimize_full():
    data = session.load()
    if not data.students:
        raise HTTPException(status_code=400, detail="Keine Schüler geladen")
    updated_courses, assignments = run_full_optimization(data.students, data.courses)
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
    if not any(c.offered for c in data.courses):
        raise HTTPException(status_code=400, detail="Keine Kurse als 'angeboten' markiert")
    assignments = run_assignment_optimization(data.students, data.courses)
    data.assignments = assignments
    session.save(data)
    return {"assignment_count": len(assignments)}
```

- [ ] **Step 2: `backend/app/routers/results.py` erstellen**

```python
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
```

- [ ] **Step 3: `backend/app/exporter.py` erstellen**

```python
import csv
import io
import openpyxl
from app.models import Assignment

HEADERS = ["Nr.", "Name", "Kurs HJ1", "Prio HJ1", "Kurs HJ2", "Prio HJ2"]


def _score_to_prio(score: int) -> str:
    if score <= 0:
        return "–"
    return str(9 - score)


def to_csv(assignments: list[Assignment]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(HEADERS)
    for a in sorted(assignments, key=lambda x: x.student_nr):
        writer.writerow([
            a.student_nr, a.student_name,
            a.course_hj1, _score_to_prio(a.score_hj1),
            a.course_hj2, _score_to_prio(a.score_hj2),
        ])
    return buf.getvalue().encode("utf-8-sig")


def to_excel(assignments: list[Assignment]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Zuteilung"
    ws.append(HEADERS)
    for a in sorted(assignments, key=lambda x: x.student_nr):
        ws.append([
            a.student_nr, a.student_name,
            a.course_hj1, _score_to_prio(a.score_hj1),
            a.course_hj2, _score_to_prio(a.score_hj2),
        ])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
```

- [ ] **Step 4: `backend/app/routers/export.py` erstellen**

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
    content = exporter.to_csv(data.assignments)
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
    content = exporter.to_excel(data.assignments)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=kurszuteilung.xlsx"},
    )
```

- [ ] **Step 5: Alle Router in `main.py` registrieren**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import upload, students, courses, optimize, results, export

app = FastAPI(title="Kurswahl API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(upload.router)
app.include_router(students.router)
app.include_router(courses.router)
app.include_router(optimize.router)
app.include_router(results.router)
app.include_router(export.router)

@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Alle Tests ausführen**

```bash
pytest ../tests/ -v
# Erwartet: alle Tests grün
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/optimize.py backend/app/routers/results.py \
        backend/app/routers/export.py backend/app/exporter.py backend/app/main.py
git commit -m "feat: optimize, results, and export API endpoints"
```

---

## Task 8: Frontend-Scaffold (Vite + React + TypeScript + Tailwind)

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`

- [ ] **Step 1: `frontend/package.json` erstellen**

```json
{
  "name": "kurswahl-frontend",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.5",
    "vite": "^5.2.11"
  }
}
```

- [ ] **Step 2: Tailwind und Vite konfigurieren**

`frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

`frontend/tailwind.config.js`:
```javascript
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

`frontend/postcss.config.js`:
```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

- [ ] **Step 3: `frontend/tsconfig.json` erstellen**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: `frontend/index.html` erstellen**

```html
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Kurswahl</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `frontend/src/main.tsx` erstellen**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

`frontend/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: `frontend/src/App.tsx` mit Routing erstellen**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import EditorPage from './pages/EditorPage'
import OptimizePage from './pages/OptimizePage'
import ResultsPage from './pages/ResultsPage'

function NavBar() {
  return (
    <nav className="bg-blue-700 text-white px-6 py-3 flex gap-6 items-center">
      <span className="font-bold text-lg">Kurswahl</span>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <NavBar />
        <main className="max-w-6xl mx-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/upload" replace />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/optimize" element={<OptimizePage />} />
            <Route path="/results" element={<ResultsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
```

- [ ] **Step 7: Stub-Pages erstellen (damit Build nicht fehlschlägt)**

Für jede der 4 Pages eine minimale Stub-Datei:

`frontend/src/pages/UploadPage.tsx`:
```tsx
export default function UploadPage() { return <div>Upload</div> }
```
`frontend/src/pages/EditorPage.tsx`:
```tsx
export default function EditorPage() { return <div>Editor</div> }
```
`frontend/src/pages/OptimizePage.tsx`:
```tsx
export default function OptimizePage() { return <div>Optimize</div> }
```
`frontend/src/pages/ResultsPage.tsx`:
```tsx
export default function ResultsPage() { return <div>Results</div> }
```

- [ ] **Step 8: Frontend starten und prüfen**

```bash
cd frontend
npm install
npm run dev
# Browser: http://localhost:5173 → leere Seiten ohne Fehler
```

- [ ] **Step 9: Commit**

```bash
git add frontend/
git commit -m "feat: React frontend scaffold with routing"
```

---

## Task 9: TypeScript-Types & API-Client

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/api.ts`

- [ ] **Step 1: `frontend/src/types.ts` erstellen**

```typescript
export interface Student {
  nr: number
  name: string
  preferences: Record<string, number>
  valid: boolean
  errors: string[]
}

export interface Course {
  name: string
  min_students: number
  max_students: number
  offered: boolean
  semester: number | null
}

export interface CourseStats extends Course {
  demand: Record<number, number>
  total_interested: number
}

export interface Assignment {
  student_nr: number
  student_name: string
  course_hj1: string
  course_hj2: string
  score_hj1: number
  score_hj2: number
}

export interface UploadResult {
  total: number
  valid_count: number
  invalid_count: number
  course_names: string[]
}

export interface ResultsData {
  by_course: {
    name: string
    semester: number
    students: { nr: number; name: string; score: number; semester: number }[]
    avg_score: number
    count: number
  }[]
  by_student: Assignment[]
}
```

- [ ] **Step 2: `frontend/src/api.ts` erstellen**

```typescript
import type { Student, CourseStats, UploadResult, ResultsData } from './types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'API-Fehler')
  }
  return res.json()
}

export const api = {
  uploadCsv: (file: File): Promise<UploadResult> => {
    const form = new FormData()
    form.append('file', file)
    return request('/upload', { method: 'POST', body: form })
  },

  getStudents: (): Promise<Student[]> => request('/students'),

  updateStudent: (nr: number, data: { name?: string; preferences?: Record<string, number> }): Promise<Student> =>
    request(`/students/${nr}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  getCourses: (): Promise<CourseStats[]> => request('/courses'),

  updateCourse: (name: string, data: { offered?: boolean; semester?: number | null }): Promise<void> =>
    request(`/courses/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  runFullOptimization: (): Promise<{ offered: object[]; assignment_count: number }> =>
    request('/optimize', { method: 'POST' }),

  runAssignmentOptimization: (): Promise<{ assignment_count: number }> =>
    request('/optimize/assignments', { method: 'POST' }),

  getResults: (): Promise<ResultsData> => request('/results'),

  exportCsv: () => window.open(`${BASE}/export/csv`, '_blank'),
  exportExcel: () => window.open(`${BASE}/export/excel`, '_blank'),
}
```

- [ ] **Step 3: TypeScript-Kompilierung prüfen**

```bash
cd frontend
npm run build
# Erwartet: erfolgreicher Build ohne TypeScript-Fehler
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat: TypeScript types and API client"
```

---

## Task 10: Upload-Page

**Files:**
- Modify: `frontend/src/pages/UploadPage.tsx`

- [ ] **Step 1: `frontend/src/pages/UploadPage.tsx` implementieren**

```tsx
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { UploadResult } from '../types'

export default function UploadPage() {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.uploadCsv(file)
      setResult(res)
      setTimeout(() => navigate('/editor'), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div className="max-w-lg mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">CSV hochladen</h1>

      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-16 cursor-pointer transition-colors
          ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 bg-white'}`}
      >
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {loading ? (
          <p className="text-blue-600 font-medium">Wird verarbeitet…</p>
        ) : (
          <>
            <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600">CSV-Datei hier ablegen oder klicken</p>
          </>
        )}
      </label>

      {result && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="font-medium text-green-800">
            ✓ {result.total} Schüler geladen — {result.valid_count} gültig, {result.invalid_count} mit Fehlern
          </p>
          <p className="text-sm text-green-600 mt-1">Weiterleitung zum Editor…</p>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Manuell testen**

```bash
# Backend läuft auf :8000, Frontend auf :5173
# 1. http://localhost:5173/upload öffnen
# 2. Wahlen_KI.csv hochladen
# 3. Prüfen: Ergebnisanzeige erscheint, Redirect zum /editor
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/UploadPage.tsx
git commit -m "feat: upload page with drag-and-drop"
```

---

## Task 11: Daten-Editor-Page

**Files:**
- Modify: `frontend/src/pages/EditorPage.tsx`

- [ ] **Step 1: `frontend/src/pages/EditorPage.tsx` implementieren**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Student } from '../types'

function PriorityBadge({ prio }: { prio: number }) {
  if (prio === 0) return <span className="text-gray-300">–</span>
  const colors = ['', 'bg-green-500', 'bg-green-400', 'bg-lime-400',
    'bg-yellow-300', 'bg-orange-300', 'bg-orange-400', 'bg-red-400', 'bg-red-500']
  return (
    <span className={`inline-block w-6 h-6 rounded text-white text-xs font-bold
      flex items-center justify-center ${colors[prio] ?? 'bg-gray-400'}`}>
      {prio}
    </span>
  )
}

export default function EditorPage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [editName, setEditName] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<number | null>(null)

  useEffect(() => {
    api.getStudents().then(setStudents).finally(() => setLoading(false))
  }, [])

  const saveStudent = async (student: Student) => {
    setSaving(student.nr)
    try {
      const updated = await api.updateStudent(student.nr, {
        name: editName[student.nr] ?? student.name,
      })
      setStudents(prev => prev.map(s => s.nr === updated.nr ? updated : s))
    } finally {
      setSaving(null)
    }
  }

  const validCount = students.filter(s => s.valid).length
  const invalidCount = students.filter(s => !s.valid).length

  if (loading) return <div className="text-gray-500 mt-8">Lade Daten…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Daten-Editor</h1>
          <p className="text-sm text-gray-500 mt-1">
            {validCount} gültig · {invalidCount} mit Fehlern
          </p>
        </div>
        <button
          onClick={() => navigate('/optimize')}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40"
          disabled={validCount === 0}
        >
          Weiter zur Optimierung →
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded-xl shadow">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-left">
              <th className="px-4 py-3 font-medium">Nr.</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Fehler / Prioritäten</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map(student => (
              <tr
                key={student.nr}
                className={student.valid ? '' : 'bg-red-50'}
              >
                <td className="px-4 py-2 font-mono text-gray-700">{student.nr}</td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    defaultValue={student.name}
                    placeholder="Name eingeben…"
                    onChange={e => setEditName(prev => ({ ...prev, [student.nr]: e.target.value }))}
                    className="border border-gray-200 rounded px-2 py-1 w-40 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                <td className="px-4 py-2">
                  {student.valid
                    ? <span className="text-green-600 font-medium">✓ Gültig</span>
                    : <span className="text-red-600 font-medium">⚠ Fehler</span>
                  }
                </td>
                <td className="px-4 py-2">
                  {student.valid ? (
                    <div className="flex gap-1 flex-wrap">
                      {Object.entries(student.preferences)
                        .filter(([, v]) => v > 0)
                        .sort(([, a], [, b]) => a - b)
                        .map(([course, prio]) => (
                          <span key={course} className="text-xs text-gray-600">
                            {course}: <PriorityBadge prio={prio} />
                          </span>
                        ))}
                    </div>
                  ) : (
                    <ul className="text-xs text-red-700 list-disc list-inside">
                      {student.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-2">
                  {editName[student.nr] !== undefined && editName[student.nr] !== student.name && (
                    <button
                      onClick={() => saveStudent(student)}
                      disabled={saving === student.nr}
                      className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                    >
                      {saving === student.nr ? '…' : 'Speichern'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Manuell testen**

```bash
# http://localhost:5173/editor
# Prüfen:
# - Fehlerhafte Schüler sind rot hinterlegt
# - Fehlermeldungen werden angezeigt
# - Name kann eingegeben und gespeichert werden
# - Button "Weiter" ist aktiv wenn valide Schüler vorhanden
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/EditorPage.tsx
git commit -m "feat: data editor page with error highlighting"
```

---

## Task 12: Optimize-Page mit Drag & Drop

**Files:**
- Modify: `frontend/src/pages/OptimizePage.tsx`

- [ ] **Step 1: `frontend/src/pages/OptimizePage.tsx` implementieren**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../api'
import type { CourseStats } from '../types'

function CourseCard({ course }: { course: CourseStats }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: course.name })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm cursor-grab active:cursor-grabbing select-none"
    >
      <span className="font-medium text-gray-800 text-sm">{course.name}</span>
      <span className="ml-2 text-xs text-gray-400">{course.total_interested} SuS</span>
    </div>
  )
}

const COLUMN_STYLES = {
  blue:   { wrap: 'bg-blue-50 border-blue-200',     heading: 'text-blue-700' },
  purple: { wrap: 'bg-purple-50 border-purple-200', heading: 'text-purple-700' },
  gray:   { wrap: 'bg-gray-100 border-gray-200',    heading: 'text-gray-600' },
} as const

function Column({
  title, courses, color
}: { title: string; courses: CourseStats[]; color: keyof typeof COLUMN_STYLES }) {
  const { wrap, heading } = COLUMN_STYLES[color]
  return (
    <div className={`${wrap} border rounded-xl p-4 min-h-48`}>
      <h3 className={`font-semibold ${heading} mb-3`}>{title}</h3>
      <SortableContext items={courses.map(c => c.name)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {courses.map(c => <CourseCard key={c.name} course={c} />)}
        </div>
      </SortableContext>
    </div>
  )
}

export default function OptimizePage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<CourseStats[]>([])
  const [loading, setLoading] = useState(true)
  const [optimizing, setOptimizing] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [optimized, setOptimized] = useState(false)

  useEffect(() => {
    api.getCourses().then(setCourses).finally(() => setLoading(false))
  }, [])

  const hj1 = courses.filter(c => c.offered && c.semester === 1)
  const hj2 = courses.filter(c => c.offered && c.semester === 2)
  const notOffered = courses.filter(c => !c.offered)

  const runOptimization = async () => {
    setOptimizing(true)
    try {
      await api.runFullOptimization()
      const updated = await api.getCourses()
      setCourses(updated)
      setOptimized(true)
    } finally {
      setOptimizing(false)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedName = active.id as string
    const targetName = over.id as string

    const dragged = courses.find(c => c.name === draggedName)
    const target = courses.find(c => c.name === targetName)
    if (!dragged || !target) return

    // Swap semester assignments
    const newCourses = courses.map(c => {
      if (c.name === draggedName) return { ...c, semester: target.semester, offered: target.offered }
      if (c.name === targetName) return { ...c, semester: dragged.semester, offered: dragged.offered }
      return c
    })
    setCourses(newCourses as CourseStats[])

    // Persist changes to backend
    await api.updateCourse(draggedName, { offered: target.offered ?? false, semester: target.semester ?? undefined })
    await api.updateCourse(targetName, { offered: dragged.offered, semester: dragged.semester ?? undefined })

    // Re-run assignment optimization
    setReassigning(true)
    try {
      await api.runAssignmentOptimization()
    } finally {
      setReassigning(false)
    }
  }

  if (loading) return <div className="text-gray-500 mt-8">Lade Kurse…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Optimierung & Kursauswahl</h1>
        {optimized && (
          <button
            onClick={() => navigate('/results')}
            className="bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700"
          >
            Ergebnisse ansehen →
          </button>
        )}
      </div>

      {!optimized ? (
        <div className="text-center py-16">
          <p className="text-gray-600 mb-6">Der Algorithmus wählt automatisch die 8 besten Kurse aus und teilt die Schüler optimal zu.</p>
          <button
            onClick={runOptimization}
            disabled={optimizing}
            className="bg-blue-600 text-white px-8 py-3 rounded-xl text-lg font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            {optimizing ? '⏳ Optimierung läuft…' : '▶ Optimierung starten'}
          </button>
        </div>
      ) : (
        <div>
          {reassigning && (
            <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">
              ⏳ Zuteilung wird neu berechnet…
            </div>
          )}
          <p className="text-sm text-gray-500 mb-4">
            Kurse per Drag & Drop zwischen den Halbjahren oder in „Nicht angeboten" verschieben.
          </p>
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-3 gap-4">
              <Column title="Halbjahr 1" courses={hj1} color="blue" />
              <Column title="Halbjahr 2" courses={hj2} color="purple" />
              <Column title="Nicht angeboten" courses={notOffered} color="gray" />
            </div>
          </DndContext>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Manuell testen**

```bash
# http://localhost:5173/optimize
# 1. "Optimierung starten" klicken → Karten erscheinen in HJ1/HJ2
# 2. Karte von HJ1 nach HJ2 ziehen → Backend neu rechnen
# 3. "Ergebnisse ansehen" Button erscheint
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/OptimizePage.tsx
git commit -m "feat: optimize page with drag-and-drop course assignment"
```

---

## Task 13: Results-Page & Export

**Files:**
- Modify: `frontend/src/pages/ResultsPage.tsx`

- [ ] **Step 1: `frontend/src/pages/ResultsPage.tsx` implementieren**

```tsx
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ResultsData } from '../types'

function ScoreBadge({ score }: { score: number }) {
  const prio = score > 0 ? 9 - score : null
  const color = !prio ? 'bg-gray-200 text-gray-500'
    : prio <= 2 ? 'bg-green-500 text-white'
    : prio <= 4 ? 'bg-yellow-400 text-white'
    : 'bg-red-400 text-white'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${color}`}>
      {prio ? `Prio ${prio}` : '–'}
    </span>
  )
}

export default function ResultsPage() {
  const [results, setResults] = useState<ResultsData | null>(null)
  const [tab, setTab] = useState<'course' | 'student'>('course')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getResults()
      .then(setResults)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-500 mt-8">Lade Ergebnisse…</div>
  if (error) return <div className="text-red-600 mt-8">{error}</div>
  if (!results) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Ergebnisse</h1>
        <div className="flex gap-2">
          <button
            onClick={api.exportCsv}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium"
          >
            ↓ CSV
          </button>
          <button
            onClick={api.exportExcel}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
          >
            ↓ Excel
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['course', 'student'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'course' ? 'Pro Kurs' : 'Pro Schüler'}
          </button>
        ))}
      </div>

      {tab === 'course' && (
        <div className="grid grid-cols-2 gap-4">
          {results.by_course.sort((a, b) => a.semester - b.semester).map(course => (
            <div key={course.name} className="bg-white rounded-xl shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-800">{course.name}</h3>
                <span className={`text-xs px-2 py-1 rounded font-medium
                  ${course.semester === 1 ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  HJ {course.semester}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                {course.count} Schüler · Ø Priorität: {course.avg_score > 0 ? (9 - course.avg_score).toFixed(1) : '–'}
              </p>
              <div className="flex flex-wrap gap-1">
                {course.students.map(s => (
                  <span key={s.nr} className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">
                    {s.name || `Nr. ${s.nr}`}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'student' && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th className="px-4 py-3 font-medium">Nr.</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">HJ1 Kurs</th>
                <th className="px-4 py-3 font-medium">HJ1 Prio</th>
                <th className="px-4 py-3 font-medium">HJ2 Kurs</th>
                <th className="px-4 py-3 font-medium">HJ2 Prio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.by_student.sort((a, b) => a.student_nr - b.student_nr).map(a => (
                <tr key={a.student_nr} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-gray-700">{a.student_nr}</td>
                  <td className="px-4 py-2 text-gray-600">{a.student_name || '–'}</td>
                  <td className="px-4 py-2">{a.course_hj1}</td>
                  <td className="px-4 py-2"><ScoreBadge score={a.score_hj1} /></td>
                  <td className="px-4 py-2">{a.course_hj2}</td>
                  <td className="px-4 py-2"><ScoreBadge score={a.score_hj2} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Manuell testen**

```bash
# http://localhost:5173/results
# Prüfen:
# - Kurs-Tab: 8 Karten (4 HJ1, 4 HJ2), Schüleranzahl stimmt
# - Schüler-Tab: alle Schüler mit Kurszuteilung und Priorität
# - CSV-Download startet Datei-Download
# - Excel-Download startet Datei-Download
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ResultsPage.tsx
git commit -m "feat: results page with course/student tabs and export"
```

---

## Task 14: Navigation vervollständigen & E2E-Smoke-Test

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: NavBar mit Steps aktualisieren in `App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import EditorPage from './pages/EditorPage'
import OptimizePage from './pages/OptimizePage'
import ResultsPage from './pages/ResultsPage'

const steps = [
  { path: '/upload', label: '1. Upload' },
  { path: '/editor', label: '2. Editor' },
  { path: '/optimize', label: '3. Optimierung' },
  { path: '/results', label: '4. Ergebnisse' },
]

function NavBar() {
  return (
    <nav className="bg-blue-700 text-white px-6 py-3 flex gap-6 items-center">
      <span className="font-bold text-lg mr-4">Kurswahl</span>
      {steps.map(s => (
        <NavLink
          key={s.path}
          to={s.path}
          className={({ isActive }) =>
            `text-sm ${isActive ? 'text-white font-semibold underline' : 'text-blue-200 hover:text-white'}`
          }
        >
          {s.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <NavBar />
        <main className="max-w-6xl mx-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/upload" replace />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/optimize" element={<OptimizePage />} />
            <Route path="/results" element={<ResultsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Vollständiger E2E-Smoke-Test (manuell)**

```
1. http://localhost:5173 öffnen → Redirect zu /upload
2. Wahlen_KI.csv hochladen → Meldung: ~70 Schüler, X mit Fehlern
3. /editor: Fehlerhafte Schüler rot → "Weiter" klicken
4. /optimize: "Optimierung starten" → 8 Karten erscheinen (4+4)
5. Karte von HJ1 nach HJ2 ziehen → Reassignment läuft
6. "Ergebnisse ansehen" → /results
7. Kurs-Tab: 8 Kurse mit Schülerlisten
8. Schüler-Tab: jeder Schüler hat HJ1 + HJ2
9. CSV-Export: Datei öffnen → korrekte Spalten
10. Excel-Export: Datei öffnen → korrekte Spalten
```

- [ ] **Step 3: Alle Backend-Tests nochmals ausführen**

```bash
cd backend && pytest ../tests/ -v
# Erwartet: alle Tests grün
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: complete navigation with step indicator"
```

---

## Task 15: Docker-Build & Deployment-Test

**Files:**
- No new files (alles bereits vorhanden)

- [ ] **Step 1: Frontend-Production-Build prüfen**

```bash
cd frontend
npm run build
# Erwartet: dist/ Ordner erstellt, keine TypeScript-Fehler
```

- [ ] **Step 2: Docker Compose bauen**

```bash
cd ..  # Projekt-Root
docker compose build
# Erwartet: beide Images gebaut ohne Fehler
```

- [ ] **Step 3: Docker Compose starten**

```bash
docker compose up -d
# Erwartet: backend und frontend Container laufen
docker compose logs backend | head -5
# Erwartet: "Uvicorn running on http://0.0.0.0:8000"
```

- [ ] **Step 4: Health-Check**

```bash
curl http://localhost/api/health
# Erwartet: {"status":"ok"}
```

- [ ] **Step 5: E2E-Smoke-Test über Port 80**

```
http://localhost öffnen → gleicher Workflow wie in Task 14 Step 2
Besonders prüfen: /api/* Anfragen werden korrekt von nginx an backend proxied
```

- [ ] **Step 6: Abschließender Commit & Tag**

```bash
docker compose down
git add .
git commit -m "feat: complete Kurswahl WebApp v1.0"
git tag v1.0.0
```
