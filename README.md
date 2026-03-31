# Kurswahl

Web-App zur automatischen Kursauswahl und Schülerzuteilung. Ein Lehrer lädt eine CSV-Datei mit Schülerpräferenzen hoch — der Algorithmus wählt die 8 besten Kurse aus 18 Kandidaten aus, verteilt sie auf zwei Halbjahre und teilt jeden Schüler optimal zu.

## Features

- CSV-Upload mit automatischer Fehlervalidierung
- ILP-Optimierung (PuLP/CBC) für maximale Schülerzufriedenheit
- Manuelle Nachkorrektur per Drag & Drop
- Export als CSV und Excel

## Rahmenbedingungen

- 18 Kurs-Kandidaten → 8 werden angeboten (4 pro Halbjahr)
- Kapazität: 15–22 Schüler pro Kurs (Kochen max. 16)
- Schüler priorisieren 8 Wunschkurse (Priorität 1–8)

## Tech Stack

| Schicht | Technologie |
|---------|-------------|
| Backend | Python 3.12, FastAPI, PuLP (ILP), openpyxl |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, @dnd-kit |
| Infra | Docker Compose, nginx |

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

## GitHub Codespaces

Einfach über **Code → Codespaces → Create codespace on main** starten. Alle Abhängigkeiten werden automatisch installiert.

## Tests

```bash
cd backend && pytest ../tests/ -v
```
