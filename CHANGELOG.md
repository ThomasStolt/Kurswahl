# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-04-10

### Added

- **Neue Seite „Rahmenbedingungen"** (`/rahmenbedingungen`) — erreichbar über ein Info-Icon oben rechts neben dem Dark-Mode-Toggle. Führt alle aktiven Regeln des Optimierers in sechs Abschnitten auf (CSV-Import, Kurs-Kapazitäten, Volloptimierung, Drag-&-Drop, Zufriedenheits-Score, Solver/Infrastruktur) mit Erläuterungstext pro Punkt.

## [1.3.3] - 2026-04-10

### Changed

- **CBC-Solver nutzt jetzt 4 Threads** — `PULP_CBC_CMD` wird mit `threads=4` initialisiert (sowohl in `run_full_optimization` als auch `run_assignment_optimization`), was auf dem 4-Kern-Raspberry-Pi etwa 1.5–2.5x Speedup bringt. Zeitlimit und Thread-Anzahl sind per Env-Vars `KURSWAHL_SOLVER_TIME_LIMIT` (Default 240) und `KURSWAHL_SOLVER_THREADS` (Default 4) übersteuerbar, ohne Code-Änderung.

## [1.3.2] - 2026-04-10

### Changed

- **Kurs-Maximalkapazität von 22 auf 26 erhöht** — betrifft `Course.max_students`-Default in `backend/app/models.py` sowie den Fallback in `backend/app/routers/upload.py`; Kochen bleibt bei max 16. Die Änderung wirkt auf alle nach dem Update hochgeladenen CSVs; bereits gespeicherte Session-States behalten ihren alten Wert, bis erneut hochgeladen wird. Tests (`test_scorer.py`, `test_optimizer.py`), README und Design-Spec wurden entsprechend nachgezogen.

## [1.3.1] - 2026-04-10

### Fixed

- **Optimierung hängt scheinbar** — auf langsamer Hardware (z. B. Raspberry Pi) brauchte der CBC-Solver länger als den nginx-Default-Timeout von 60 s; der Request wurde mit 504 gekappt, das Frontend verschluckte den Fehler und der Button sprang ohne Rückmeldung auf „Optimierung starten" zurück
  - `proxy_read_timeout` / `proxy_send_timeout` in `nginx.conf` auf 300 s erhöht
  - CBC-Solver `timeLimit=240s` als harte Obergrenze (weiterhin innerhalb des nginx-Timeouts)
  - `OptimizePage` fängt jetzt Exceptions ab und zeigt eine rote Fehlermeldung, statt den Fehler stumm zu verschlucken

### Added

- Diagnose-Logs (`[OPTIMIZE]` / `[OPTIMIZER]`) rund um den Solver-Aufruf mit Laufzeitmessung, sichtbar in `docker compose logs -f backend`

## [1.3.0] - 2026-04-04

### Added

- **Algorithmus-Erklärung auf der Upload-Seite** — Infokarte mit verständlicher Zusammenfassung der Optimierung und aufklappbarem technischem Detail (ILP-Methode, Zielfunktion, Nebenbedingungen); zugänglich mit `aria-expanded`/`aria-controls`

## [1.2.0] - 2026-04-03

### Added

- **Zufriedenheits-Score** — mehrstufiges Zufriedenheits-Scoring-System mit globaler, schüler- und kursbezogener Bewertung
  - **Globaler Score**: Prozentwert der erreichten Gesamtzufriedenheit mit textueller Einordnung (Exzellent / Gut / Akzeptabel / Kritisch)
  - **Schüler-Score**: Gesamt-Score (0–16 Punkte) und durchschnittliche erreichte Priorität pro Schüler
  - **Kurs-Score**: Durchschnittliche Priorität der zugewiesenen Schüler und Auslastung (Schüler/Max mit Fortschrittsbalken)
- **Live-Score auf der Optimierungsseite** — nach jedem Drag & Drop wird der aktuelle Zufriedenheits-Score in Echtzeit angezeigt
- **Score-Header auf der Ergebnisseite** — großer Prozentwert mit Ampelfarbe und beschreibender Einordnung
- **Erweiterte Ergebnistabellen** — Schüler-Tab zeigt „Gesamt" und „Ø Prio" Spalten; Kurs-Tab zeigt Auslastungsbalken
- **Score im Export** — CSV und Excel enthalten Zusammenfassungszeilen (Zufriedenheit, Score, Bewertung) sowie Gesamt-Score und Ø Priorität pro Schüler; Excel erhält ein zusätzliches Sheet „Kursübersicht" mit Auslastung und Ø Priorität pro Kurs
- 10 neue Tests (7 Scorer-Unit-Tests, 3 API-Integrationstests), insgesamt 28 Tests

## [1.1.0] - 2026-04-01

### Added

- **Dark mode** — system preference respected on first visit, persisted in `localStorage`; toggled via sun/moon button in the navbar; no flash on load (inline script sets `.dark` before CSS)
- **Version badge** — current `package.json` version injected at build time via Vite `define` and displayed as a monospace badge next to the logo
- **Editable course preferences** — each student row in the Editor now has a "Wahlen" toggle that expands an inline sortable list of all courses; drag handles and up/down arrow buttons let the teacher reorder courses freely; position 1–8 maps directly to priority 1–8, everything below a "nicht gewählt" divider gets priority 0; no manual number entry or duplicate validation required

### Changed

- Complete UI redesign: CSS custom-property color tokens (`--c-*`) with Tailwind mapping, enabling single-source dark/light switching; typography switched to **Bricolage Grotesque** (headings) + **DM Sans** (body)
- Navbar replaced with a sticky glass header (backdrop-blur) containing a step-progress indicator (done / active / upcoming states with amber glow on active step)
- All pages use staggered entrance animations (`fade-up` with `animation-delay`)
- Buttons, cards, and inputs polished with micro-interactions: hover lift, amber glow shadow, `active:scale` press feedback
- Loading spinners unified across all pages
- Upload zone: animated drag-highlight, success/error states with icons, format hint card
- Results tab switcher changed from underline tabs to a segmented pill control

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

[1.4.0]: https://github.com/ThomasStolt/Kurswahl/compare/v1.3.3...v1.4.0
[1.3.3]: https://github.com/ThomasStolt/Kurswahl/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/ThomasStolt/Kurswahl/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/ThomasStolt/Kurswahl/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/ThomasStolt/Kurswahl/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ThomasStolt/Kurswahl/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ThomasStolt/Kurswahl/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ThomasStolt/Kurswahl/releases/tag/v1.0.0
