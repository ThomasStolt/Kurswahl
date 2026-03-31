# Kurswahl WebApp — Design Spec

**Datum:** 2026-03-31  
**Status:** Bereit zur Implementierung

---

## Überblick

Eine Web-App für Lehrkräfte zur Verwaltung der Kurswahl. Der Admin lädt eine CSV-Datei mit Schülerpräferenzen hoch. Ein Optimierungsalgorithmus wählt automatisch 8 Kurse (aus 18 Kandidaten) aus, verteilt sie auf zwei Halbjahre und teilt jeden Schüler einem Kurs pro Halbjahr zu — unter maximaler Berücksichtigung der Wünsche. Ergebnis ist per CSV/Excel exportierbar.

---

## Rahmenbedingungen

- **Kurse:** 18 Kandidaten, davon werden 8 angeboten (4 pro Halbjahr)
- **Schüler:** ~70–130 (je nach Beteiligung)
- **Kapazität:** Min. 15 / Max. 22 SuS pro Kurs; Kochen max. 16
- **Präferenzen:** Prioritäten 1–8 (1 = höchster Wunsch); 0 = kein Interesse
- **Nutzerrolle:** Nur ein Admin / Lehrkraft (kein Login erforderlich)

---

## Architektur

### Services (Docker Compose)

| Service | Technologie | Zweck |
|---------|-------------|-------|
| `frontend` | React (TypeScript) + Vite, served via nginx:alpine | UI |
| `backend` | Python 3.12 + FastAPI | Algorithmus, CSV-Parsing, Export |

Frontend kommuniziert mit dem Backend ausschließlich über eine REST-API (JSON / multipart). Kein externer Datenbankserver — der Backend-Container hält den Session-State in einer SQLite-Datei.

---

## Datenmodell

### Student
```
nr: int               # Schülernummer aus CSV
name: str             # Optional, leer wenn aus Datenschutzgründen nicht vorhanden
preferences: dict     # {Kursname: Priorität (0–8)}
valid: bool           # False wenn Validierungsfehler vorliegen
errors: list[str]     # Beschreibung der Fehler (z.B. "Priorität 1 dreifach vergeben")
```

### Course
```
name: str
min_students: int     # Default: 15
max_students: int     # Default: 22 (Kochen: 16)
offered: bool         # Wird dieser Kurs angeboten?
semester: int | None  # 1 oder 2 (null = nicht angeboten)
```

### Assignment
```
student_nr: int
student_name: str     # Leer wenn nicht vorhanden
course_hj1: str       # Kursname Halbjahr 1
course_hj2: str       # Kursname Halbjahr 2
score_hj1: int        # Zufriedenheitspunkte HJ1 (Prio1=8, Prio8=1, kein Wunsch=0)
score_hj2: int        # Zufriedenheitspunkte HJ2
```

---

## Optimierungsalgorithmus (PuLP ILP)

### Entscheidungsvariablen
- `offer[c]` ∈ {0, 1} — wird Kurs c angeboten?
- `sem[c]` ∈ {1, 2} — in welchem Halbjahr findet Kurs c statt?
- `assign[s][c]` ∈ {0, 1} — wird Schüler s dem Kurs c zugeteilt?

### Zielfunktion
Maximiere: Σ `score[s][c]` × `assign[s][c]`

Wobei `score[s][c]`:
- Priorität 1 → 8 Punkte
- Priorität 2 → 7 Punkte
- ...
- Priorität 8 → 1 Punkt
- Kein Wunsch (0) → −5 Punkte (Strafe, wird vermieden)

### Constraints
1. Genau 8 Kurse werden angeboten (`Σ offer[c] = 8`)
2. Genau 4 Kurse pro Halbjahr
3. Jeder Schüler wird genau 1 Kurs in HJ1 und 1 Kurs in HJ2 zugewiesen
4. Zuteilung nur zu angebotenen Kursen (`assign[s][c] ≤ offer[c]`)
5. Min./Max.-Kapazität pro Kurs einhalten
6. Nur valide Schülereinträge fließen in die Optimierung ein

**Laufzeit:** < 2 Sekunden für ~70 valide SuS mit CBC-Solver (in PuLP enthalten).

### Manueller Eingriff
Nach dem ersten Optimierungslauf kann der Admin:
- Andere Kurse aus-/einwählen
- Kurse zwischen HJ1 und HJ2 verschieben (Drag & Drop)

Danach wird **nur die Schülerzuteilung** neu berechnet (Kurse/Halbjahre sind dann fix).

---

## REST API (FastAPI)

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| `POST` | `/upload` | CSV hochladen, validieren, Session initialisieren |
| `GET` | `/students` | Alle Schüler inkl. Validierungsstatus |
| `PATCH` | `/students/{nr}` | Schülereintrag manuell korrigieren |
| `GET` | `/courses` | Alle 18 Kurse mit Nachfrage-Statistiken |
| `POST` | `/optimize` | Volloptimierung starten (Kurse + Zuteilung) |
| `POST` | `/optimize/assignments` | Nur Zuteilung neu berechnen (Kurse fix) |
| `PATCH` | `/courses/{name}` | Kurs offered/semester manuell setzen |
| `GET` | `/results` | Zuteilungsergebnis (pro Kurs + pro SuS) |
| `GET` | `/export/csv` | Export als CSV |
| `GET` | `/export/excel` | Export als Excel (.xlsx) |

---

## UI-Screens

### Screen 1 — Upload
Drag-&-Drop-Zone für die CSV-Datei. Nach dem Upload läuft die Validierung automatisch und leitet direkt zum Daten-Editor weiter.

### Screen 2 — Daten-Editor
Tabelle aller Schülereinträge. Fehlerhafte Zeilen sind rot hervorgehoben mit Fehlerbeschreibung. Alle Felder sind inline editierbar. Valide Einträge werden grün markiert. Schüler können ein `name`-Feld bekommen. Leere Zeilen (keine Präferenzen) werden ausgegraut angezeigt, aber nicht in die Optimierung einbezogen.

### Screen 3 — Optimierung & Kursauswahl
Button „Optimierung starten". Nach dem Lauf: Zwei Spalten (HJ1 / HJ2) mit je 4 Kursen. Kurse sind per Drag & Drop zwischen den Halbjahren verschiebbar. Nicht gewählte Kurse erscheinen in einer dritten Spalte „nicht angeboten" und können ebenfalls per Drag & Drop eingetauscht werden. Änderungen triggern eine neue Zuteilungs-Berechnung.

### Screen 4 — Ergebnisse
Tab-Ansicht:
- **Pro Kurs:** Kursname, Halbjahr, Anzahl SuS, Ø Priorität, Liste der zugeteilten Schülernummern (+ Namen falls vorhanden)
- **Pro Schüler:** Nr., Name, Kurs HJ1, Prio HJ1, Kurs HJ2, Prio HJ2

### Screen 5 — Export
Buttons für CSV- und Excel-Export. Beide Formate enthalten: Schüler-Nr., Name, Kurs HJ1, Prio HJ1, Kurs HJ2, Prio HJ2.

---

## Validierungsregeln (CSV-Import)

Ein Schülereintrag ist **ungültig** wenn:
- Weniger oder mehr als 8 nicht-null Prioritäten vergeben
- Eine Priorität (1–8) mehrfach vergeben
- Ein Wert außerhalb 0–8 vorkommt
- Alle Felder leer sind (→ wird still ignoriert)

Ungültige Einträge werden im Daten-Editor angezeigt und können korrigiert werden. Sie fließen erst nach Korrektur in die Optimierung ein.

---

## Docker-Setup

```
docker-compose.yml
├── frontend  (nginx:alpine, Port 80)
│   └── React-Build via Vite
└── backend   (python:3.12-slim, Port 8000 intern)
    ├── FastAPI + Uvicorn
    ├── PuLP + CBC-Solver
    └── openpyxl (Excel-Export)
```

Frontend-Container proxied API-Anfragen (`/api/*`) über nginx an den Backend-Container.
