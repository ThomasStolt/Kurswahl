# Kurswahl

Web-App zur automatischen Kursauswahl und Schülerzuteilung. Ein Lehrer lädt eine CSV-Datei mit Schülerpräferenzen hoch — der Algorithmus wählt die 8 besten Kurse aus 18 Kandidaten aus, verteilt sie auf zwei Halbjahre und teilt jeden Schüler optimal zu.

## Features

- CSV-Upload mit automatischer Fehlervalidierung und Vorschau
- ILP-Optimierung (PuLP/CBC) für maximale Schülerzufriedenheit
- Kursauswahl per Drag & Drop zwischen Halbjahren und „Nicht angeboten"
- Kurspräferenzen pro Schüler editierbar: sortierbare Liste per Drag & Drop oder Pfeil-Buttons
- Optimistische UI-Aktualisierungen mit automatischem Rollback bei Fehler
- Ergebnisansicht nach Kurs und nach Schüler (mit Zufriedenheitsbewertung)
- Zufriedenheits-Score: globale, schüler- und kursbezogene Bewertung der Optimierungsergebnisse
- Live-Score auf der Optimierungsseite — aktualisiert sich nach jedem Drag & Drop
- Export als CSV (UTF-8-SIG, Excel-kompatibel) und Excel (.xlsx) mit Score-Zusammenfassung und Kursübersicht
- Algorithmus-Erklärung auf der Upload-Seite mit aufklappbarem technischem Detail
- Dark Mode (system-aware, persistiert) mit warm Amber-Akzent

## Rahmenbedingungen

- 18 Kurs-Kandidaten → 8 werden angeboten (4 pro Halbjahr)
- Kapazität: 15–26 Schüler pro Kurs (Kochen max. 16)
- Schüler priorisieren 8 Wunschkurse (Priorität 1–8)

## CSV-Format

Die Eingabedatei muss folgendes Format haben (Semikolon als Trennzeichen):

```
Nr.;Name;Kurs1;Kurs2;...;Kurs8
1;Max Mustermann;Biologie;Chemie;...;Physik
```

- Spalte `Nr.`: Ganzzahlige Schülernummer
- Spalte `Name`: Vollständiger Name
- Kursspalten: Priorisierte Wunschkurse (1 = höchste Priorität)
- Genau 8 Nicht-Null-Einträge pro Schüler, keine Duplikate

## Workflow

1. **Upload** — CSV-Datei hochladen, Validierungsergebnisse prüfen
2. **Editor** — Namen anpassen; Kurspräferenzen per Drag & Drop neu sortieren
3. **Optimierung** — ILP-Algorithmus starten, Ergebnis per Drag & Drop nachkorrigieren, Live-Zufriedenheits-Score verfolgen
4. **Ergebnisse** — Zuteilungen mit Zufriedenheitsbewertung einsehen und als CSV/Excel exportieren

## Tech Stack

| Schicht | Technologie |
|---------|-------------|
| Backend | Python 3.12, FastAPI, PuLP (ILP/CBC), openpyxl |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, @dnd-kit |
| Infra | Docker Compose, nginx |

## Projektstruktur

```
Kurswahl/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI-App, alle Router eingebunden
│   │   ├── models.py        # Pydantic-Modelle (Student, Course, Assignment …)
│   │   ├── session.py       # Atomares JSON-Session-Management
│   │   ├── parser.py        # CSV-Parser mit Validierung
│   │   ├── optimizer.py     # ILP-Optimierung mit PuLP/CBC
│   │   ├── scorer.py        # Zufriedenheits-Score-Berechnung
│   │   ├── exporter.py      # CSV- und Excel-Export
│   │   └── routers/         # FastAPI-Router (upload, students, courses, optimize, results, export)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api.ts           # Typsicherer API-Client
│   │   ├── types.ts         # TypeScript-Interfaces
│   │   ├── App.tsx          # Router + Navigation
│   │   └── pages/           # UploadPage, EditorPage, OptimizePage, ResultsPage
│   ├── package.json
│   └── vite.config.ts
├── tests/
│   ├── conftest.py
│   ├── test_parser.py
│   ├── test_optimizer.py
│   ├── test_scorer.py
│   └── test_api.py
├── docker-compose.yml
└── nginx.conf
```

## Schnellstart (Docker)

```bash
docker compose up
```

Anschließend im Browser: **http://localhost**

## Entwicklung

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (neues Terminal)
cd frontend && npm install && npm run dev
```

Frontend läuft auf `http://localhost:5173`, Backend auf `http://localhost:8000`.

## Tests

```bash
cd backend && pytest ../tests/ -v
```

## GitHub Codespaces

Einfach über **Code → Codespaces → Create codespace on main** starten. Alle Abhängigkeiten werden automatisch installiert.
