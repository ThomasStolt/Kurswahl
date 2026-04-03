# Zufriedenheits-Score Feature

**Datum:** 2026-04-03
**Status:** Entwurf

## Ziel

Ein mehrstufiges Zufriedenheits-Scoring-System, das Lehrkraft und Schulleitung eine mathematisch fundierte Einschaetzung der Optimierungsergebnisse liefert — als Arbeitshilfe beim Optimieren und als Ergebnisdokumentation.

## Zielgruppe

- **Lehrkraft**: Sieht beim Optimieren (Drag & Drop) live, wie sich Aenderungen auf die Zufriedenheit auswirken.
- **Schulleitung**: Erhaelt im Export eine dokumentierte Bewertung der Verteilungsfairness.

## Score-Ebenen

### 1. Globaler Score

- **Erreichter Score**: Summe aller Schueler-Scores (score_hj1 + score_hj2 fuer alle Schueler)
- **Theoretisches Maximum**: `Anzahl valider Schueler x 8 x 2` (jeder bekommt Prio 1 in beiden Halbjahren)
- **Prozent**: `erreicht / maximum x 100`
- **Bewertungsskala mit textueller Einordnung**:
  - >= 85%: "Exzellent — fast alle Schueler in ihren Top-Wuenschen"
  - 70-84%: "Gut — die meisten Schueler in ihren Top-3-Wuenschen"
  - 55-69%: "Akzeptabel — einige Schueler mussten auf niedrigere Prioritaeten ausweichen"
  - < 55%: "Kritisch — viele Schueler haben ihre Wunschkurse nicht erhalten"

### 2. Schueler-Score

- `score_total`: Summe aus `score_hj1 + score_hj2` (max. 16)
- `avg_priority`: Durchschnitt der erreichten Prioritaeten beider Halbjahre (z.B. "Oe Prioritaet 2,5")

### 3. Kurs-Score

- `avg_priority`: Durchschnittliche erreichte Prioritaet aller zugewiesenen Schueler
- `fill_rate`: Auslastung in Prozent (`zugewiesene / max_students`)
- `student_count`: Anzahl zugewiesener Schueler

## Score-Berechnung

Die Score-Formel basiert auf dem bestehenden Scoring-System im Optimizer:
- Prioritaet 1 ergibt Score 8, Prioritaet 2 ergibt Score 7, ..., Prioritaet 8 ergibt Score 1
- Kein Interesse (Prioritaet 0) ergibt Score 0 (im Zufriedenheits-Reporting; der Strafterm -5 ist nur fuer den Solver relevant)

Alle Scores werden im Backend berechnet (Ansatz A: Single Source of Truth). Keine doppelte Logik im Frontend.

## API-Aenderungen

### Neue Pydantic-Modelle

```python
class StudentScore(BaseModel):
    student_nr: int
    student_name: str
    score_total: int        # 0-16
    avg_priority: float     # Oe erreichte Prioritaet (1.0-8.0)

class CourseScore(BaseModel):
    name: str
    semester: int
    avg_priority: float     # Oe Prioritaet der zugewiesenen Schueler
    student_count: int
    max_students: int
    fill_rate: float        # 0.0-1.0

class ScoreReport(BaseModel):
    score_achieved: int
    score_maximum: int
    score_percent: float
    score_label: str        # "Exzellent", "Gut", "Akzeptabel", "Kritisch"
    score_description: str  # Textuelle Einordnung
    student_scores: list[StudentScore]
    course_scores: list[CourseScore]
```

### Betroffene Endpunkte

- `GET /api/results` — liefert `ScoreReport` zusaetzlich zu den bisherigen Daten
- `POST /api/optimize/assignments` — liefert ebenfalls den aktualisierten `ScoreReport` zurueck (fuer Live-Score auf der Optimierungsseite)

Keine neuen Endpunkte noetig.

## Frontend-Aenderungen

### Ergebnisseite (ResultsPage)

- **Score-Header**: Grosser Prozentwert oben mit Ampelfarbe (gruen/gelb/orange/rot) und textuelle Einordnung daneben
- **Kurs-Tab**: Jede Kurs-Karte bekommt Oe Prioritaet und Auslastungsbalken (z.B. "18/22 — 82%")
- **Schueler-Tab**: Zusaetzliche Spalte "Gesamt" mit Score (z.B. "14/16") und Oe Prioritaet (z.B. "Oe 2,5")

### Optimierungsseite (OptimizePage)

- **Live-Score-Anzeige** oben: Gesamtscore in Prozent mit Farbe und Kurztext
- Aktualisiert sich automatisch nach jedem Drag & Drop (Antwort vom `/optimize/assignments`-Call enthaelt neuen Score)
- Visueller Uebergang (Zahlanimation) bei Aenderungen

### Export (CSV/Excel)

- **Zusammenfassungszeilen** oben: Gesamtscore, Prozent, Bewertungstext
- **Schueler-Tabelle**: Zusaetzliche Spalten `Gesamt-Score` und `Oe Prioritaet`
- **Kurs-Uebersicht**: Zweites Sheet in Excel / zweiter Block in CSV mit Oe Prioritaet und Auslastung

## Bestehende Patterns

- Score-Berechnung wird in `optimizer.py` als neue Funktion ergaenzt (neben `run_full_optimization` und `run_assignment_optimization`)
- API-Modelle in `models.py`
- Export-Erweiterung in `exporter.py`
- Frontend nutzt bestehenden `api.ts`-Client und erweitert die TypeScript-Types in `types.ts`
- Farbgebung folgt dem bestehenden Ampelsystem der `ScoreBadge`-Komponente

## Nicht im Scope

- Historischer Score-Vergleich ueber mehrere Durchlaeufe
- Score-basierte Empfehlungen ("Tauschen Sie Kurs X gegen Y")
- Schuelerseitige Ansicht der eigenen Zufriedenheit
