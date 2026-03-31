# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-31

### Added

#### Backend
- FastAPI backend with six REST endpoints: upload, students, courses, optimize, results, export
- CSV parser with strict validation: integer student numbers, exactly 8 non-zero priorities, no duplicate courses
- PuLP/CBC integer linear programming optimizer that selects the 8 best courses from up to 18 candidates and assigns students to maximize preference satisfaction
- Separate `/optimize/assignments` endpoint to re-run student assignment without re-selecting courses (used after manual drag-and-drop reordering)
- Atomic JSON session state with temporary-file-and-rename pattern and corrupt-file recovery
- Pydantic v2 models for all request/response types: `Student`, `Course`, `CourseStats`, `Assignment`, `SessionData`
- Course demand statistics (`CourseStats`) with per-priority breakdown and total interested count
- CSV export with UTF-8-SIG encoding for Excel compatibility with German characters
- Excel export via openpyxl
- Non-root Docker user (`appuser`) for container security
- File size limit (5 MB) and filename validation on upload

#### Frontend
- React 18 + TypeScript + Vite + Tailwind CSS single-page application
- Four-step workflow: Upload → Editor → Optimierung → Ergebnisse
- Upload page with drag-and-drop, progress indicator, and validation result summary
- Editor page showing all students in a table with editable names and color-coded priority badges
- Optimize page using `@dnd-kit/core` and `@dnd-kit/sortable` for drag-and-drop course reordering between Halbjahr 1, Halbjahr 2, and "Nicht angeboten" columns
- Optimistic UI updates on drag-and-drop with automatic rollback on backend failure
- Results page with tab switcher (by course / by student), score badges, and semester grouping
- CSV and Excel export buttons on the results page
- Type-safe API client (`api.ts`) with centralised error handling
- React Router v6 navigation with active-link styling

#### Infrastructure
- Docker Compose setup with nginx reverse proxy routing `/api/` to the FastAPI backend and all other requests to the React frontend
- `.devcontainer` configuration for GitHub Codespaces

#### Tests
- pytest test suite with 18 tests covering parser, optimizer, and all API endpoints
- Session I/O mocked to support read-only filesystem environments
- `pytest.ini` with `pythonpath = backend .` for correct import resolution

[1.0.0]: https://github.com/ThomasStolt/Kurswahl/releases/tag/v1.0.0
