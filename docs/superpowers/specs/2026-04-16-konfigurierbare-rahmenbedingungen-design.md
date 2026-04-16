# Konfigurierbare Rahmenbedingungen — Design

**Datum:** 2026-04-16
**Status:** Spec, bereit für Implementation-Plan
**Autor:** Brainstorming-Session mit Nutzer

## Motivation

Bisher sind zentrale Rahmenbedingungen der Kurswahl hart kodiert:

- **Exakt 8 Kurse angeboten** (4 in HJ1, 4 in HJ2) — `optimizer.py` Zeilen 64–65
- **`Course.max_students = 26`** und **`Course.min_students = 15`** als Pydantic-Defaults — `models.py` Zeilen 15–16
- **Kochen mit Sonderlimit 16** — hard-wired Ausnahme, in früheren Code-Ständen über eine Namens-Abfrage

Diese Werte spiegeln die aktuelle Konfiguration *einer bestimmten Schule in einem bestimmten Jahr* wider. Für andere Jahrgänge oder andere Schulen müssen sie veränderbar sein, ohne Code-Änderungen. Außerdem soll die Sonderregel für einen einzelnen Kurs (bisher fix „Kochen") frei wählbar werden.

## Scope

**In scope:**

- Konfigurierbare Anzahl Kurse pro Halbjahr (HJ1, HJ2 unabhängig)
- Konfigurierbare Standard-Kapazitäten (Min, Max pro Kurs)
- Auswählbarer Sonderkurs mit eigenen Kapazitäten (Min, Max)
- UI für alle Einstellungen auf Seite 1 (UploadPage)
- Persistenz der Settings in der Session
- Reset-Verhalten, wenn Settings nach Optimierung geändert werden

**Out of scope:**

- Per-Kurs-Overrides (jedem einzelnen Kurs seine eigenen Kapazitäten zuweisen) — die neue Struktur lässt die Tür dafür offen, aber es gibt kein UI und keinen API-Endpoint dafür
- Änderung der „genau 8 Prioritäten pro Schüler"-Regel im CSV-Format
- Änderung des Zufriedenheits-Scores (Punktesystem und −5-Strafterm bleiben)
- Migration bestehender Sessions auf die neuen Defaults (wird als Breaking-Change akzeptiert)

## UX-Entscheidungen

1. **Sonderkurs-Auswahl nach dem Upload** (Variante B): Das Dropdown erscheint auf Seite 1 gefüllt, sobald eine CSV hochgeladen wurde, und enthält alle Kursnamen aus der CSV plus „– kein Sonderkurs –". Default: „Kochen" falls in der Liste, sonst „– kein Sonderkurs –".
2. **Kein Auto-Redirect mehr nach dem Upload** (Flow B): Die 2-Sekunden-Weiterleitung entfällt. Nach dem Upload bleibt der Nutzer auf Seite 1 und klickt explizit „Weiter zum Editor".
3. **Minima mit Default 1** (quasi kein Mindestlimit): Der Nutzer kann für die Standard- und Sonderkurs-Minimalbelegung frei andere Werte einstellen, aber der Default ist 1.
4. **Settings bleiben editierbar** (Variante A): Navigiert der Nutzer nach dem Editor zurück zu Seite 1, sieht er alle Settings mit den zuletzt gesetzten Werten und kann sie ändern. Eine Änderung, die sich von den gespeicherten Werten unterscheidet, invalidiert bestehende Zuteilungen nach Bestätigung eines Warndialogs.

## Architektur-Ansatz

**Gewählt: Ansatz 1 — Settings als Quelle der Wahrheit, `Course.min/max` als abgeleitete Cache-Ansicht.**

`Course.min_students` und `Course.max_students` bleiben erhalten und werden beim Upload sowie bei jedem Settings-Save aus den Settings neu berechnet. Der Solver, Scorer, Exporter und alle Result-Routen lesen weiterhin aus den Course-Feldern — sie bleiben unverändert.

Begründung: minimal-invasiv, lässt Raum für zukünftige per-Kurs-Overrides, erfordert keine Migration alter Sessions.

## Datenmodell

Neues Pydantic-Modell in `backend/app/models.py`:

```python
class SessionSettings(BaseModel):
    hj1_count: int = 4
    hj2_count: int = 4
    default_max: int = 22
    default_min: int = 1
    special_course: Optional[str] = None
    special_max: int = 14
    special_min: int = 1
```

`SessionData` wird erweitert:

```python
class SessionData(BaseModel):
    students: list[Student] = []
    courses: list[Course] = []
    assignments: list[Assignment] = []
    settings: SessionSettings = Field(default_factory=SessionSettings)
```

Der PUT-Endpoint akzeptiert `SessionSettings` als vollständiges Objekt (nicht partial). Das Frontend sendet immer alle Felder. Für den Sonderkurs wird sowohl `null` als auch leerer String als „kein Sonderkurs" akzeptiert — Normalisierung via Pydantic-Validator auf `None`.

Neue Helper-Funktion (z. B. in `backend/app/session.py` oder einem neuen `backend/app/settings.py`):

```python
def apply_settings_to_courses(
    courses: list[Course], settings: SessionSettings
) -> None:
    """Setzt min_students/max_students jedes Kurses gemäß Settings."""
    for c in courses:
        if settings.special_course and c.name == settings.special_course:
            c.min_students = settings.special_min
            c.max_students = settings.special_max
        else:
            c.min_students = settings.default_min
            c.max_students = settings.default_max
```

Semantik: referenziert `settings.special_course` einen Namen, der nicht in der Kursliste ist, wird das Feld still ignoriert — kein Fehler.

## Solver-Änderungen

In `backend/app/optimizer.py`:

- `run_full_optimization(students, courses, settings)` bekommt `SessionSettings` als dritten Parameter.
- Die Constraints
  ```python
  prob += lpSum(offer[c] for c in course_names) == 8
  prob += lpSum(in_hj1[c] for c in course_names) == 4
  ```
  werden ersetzt durch
  ```python
  prob += lpSum(in_hj1[c] for c in course_names) == settings.hj1_count
  prob += lpSum(in_hj2[c] for c in course_names) == settings.hj2_count
  ```
  Die `offer == 8`-Zeile entfällt; durch `in_hj1[c] + in_hj2[c] == offer[c]` ergibt sich die Gesamtsumme automatisch als `hj1_count + hj2_count`.
- Pre-Solve-Checks vor dem `prob.solve(...)`-Aufruf:
  - `if settings.hj1_count + settings.hj2_count > len(course_names): raise ValueError("Nicht genug Kurse: Die CSV enthält N Kurse, aber X+Y=Z sollen angeboten werden.")`
  - Kapazitäts-Obergrenze: `max_cap = max(settings.default_max, settings.special_max)`; `if (settings.hj1_count + settings.hj2_count) * max_cap < len(valid): raise ValueError("Nicht genug Plätze: maximal C Plätze für S Schüler.")` — echte obere Schranke über alle möglichen Kursauswahlen; feuert nur, wenn Infeasibility garantiert ist (keine False-Positives).
- `run_assignment_optimization(students, courses, settings)` bekommt den Parameter ebenfalls; die zwei dynamischen Constraints entfallen hier, weil `hj1`/`hj2`-Listen bereits aus `courses` bestimmt sind und mit der Invariante `len(hj1) == hj1_count` konsistent sind.

## Backend-API

**Neuer Router** `backend/app/routers/settings.py`, gemountet unter `/api/settings`:

### `GET /api/settings`

Response:

```json
{
  "settings": { "hj1_count": 4, "hj2_count": 4, "default_max": 22,
                "default_min": 1, "special_course": "Kochen",
                "special_max": 14, "special_min": 1 },
  "courses": ["Kochen", "Fotografie", "..."],
  "assignments_exist": false
}
```

`courses` ist die Liste der in der Session vorhandenen Kursnamen (leer, wenn noch nichts hochgeladen wurde). `assignments_exist` ist `true`, sobald die Session mindestens eine Zuteilung enthält.

### `PUT /api/settings`

Body: vollständiges `SessionSettings`-Objekt. Verhalten:

1. Body wird validiert und komplett als neue Settings übernommen (kein Merge nötig).
2. Validierung:
   - Alle `*_min`, `*_max`, `hj*_count`-Felder müssen `>= 1` sein → sonst `422`.
   - `default_min <= default_max` und `special_min <= special_max` → sonst `422`.
   - `special_course` muss entweder `None` / leerer String (wird zu `None` normalisiert) oder in der aktuellen Kursliste enthalten sein → sonst `422`. Wenn die Kursliste leer ist, ist nur `None` gültig.
3. `apply_settings_to_courses(courses, settings)`.
4. Reset-Logik: Wenn `new_settings != old_settings` **und** `len(assignments) > 0`, dann:
   - `assignments = []`
   - Für jeden Kurs: `offered = False`, `semester = None`
   - `assignments_cleared` wird in der Response gesetzt.
5. `session.save()`.
6. Response: `{"settings": ..., "assignments_cleared": bool}`

Ein `PUT` mit einem Body, der semantisch nichts ändert (identische Settings), ist ein No-Op: Reset findet nicht statt, `assignments_cleared` ist `false`.

**Infeasibility-Checks gehören NICHT hier hinein** (z. B. `hj1+hj2 > len(courses)`). Sie werden erst beim Optimierungsaufruf geprüft, damit das Editieren der Settings ohne Block funktioniert, auch wenn man temporär einen inkonsistenten Zwischenzustand hat.

### Änderungen an bestehenden Endpoints

- `POST /api/upload`: Das hart kodierte `COURSE_CAPS: dict[str, int] = {"Kochen": 16}` in `upload.py` wird entfernt — neue `Course`-Objekte werden ohne explizites `max_students`/`min_students` erzeugt (Modell-Defaults greifen); anschließend wird `apply_settings_to_courses(new_courses, session.settings)` aufgerufen, was die korrekten Werte gemäß Settings setzt. Zusätzlich wird `settings.special_course` still auf `None` zurückgesetzt, falls der Name nicht (mehr) in der neuen Kursliste vorkommt. Das bestehende `data.assignments = []` bleibt erhalten (Upload impliziert immer einen Assignments-Reset).
- `POST /api/optimize`: Übergibt `session.settings` an den Solver.
- `POST /api/optimize/swap`: Die bestehende Prüfung „Ein Halbjahr darf nicht leer bleiben" wird verallgemeinert zu einer Post-Swap-Assertion, dass `len(hj1_offered) == settings.hj1_count` und `len(hj2_offered) == settings.hj2_count`. Wird die Invariante verletzt, `400`.

## Frontend

### UploadPage-Layout

Die Seitenbreite wird von `max-w-md` auf `max-w-2xl` angehoben, damit Zahlenfelder in zwei Spalten passen.

Vertikale Struktur:

1. **Header** (unverändert): `h1 „CSV hochladen"`, Untertitel.
2. **Upload-Bereich**: bestehende Drop-Zone. Nach erfolgreichem Upload bleibt der grüne „N Schüler importiert"-Status dauerhaft sichtbar (keine 2-Sekunden-Meldung + Redirect mehr). Neue Datei droppen überschreibt.
3. **Settings-Card** (immer sichtbar):
   - Zwei-Spalten-Grid mit drei Zeilen Zahlenfeldern:
     - Zeile 1: `Kurse HJ1` | `Kurse HJ2`
     - Zeile 2: `Max Schüler / Kurs` | `Min Schüler / Kurs`
     - Zeile 3: `Max Schüler Sonderkurs` | `Min Schüler Sonderkurs`
   - Volle Breite darunter: Sonderkurs-Dropdown.
     - Vor Upload: `disabled`, Placeholder „Erst CSV hochladen…".
     - Nach Upload: gefüllt mit `["– kein Sonderkurs –", ...courses]`, Default „Kochen" oder erster Eintrag.
4. **„Weiter zum Editor"-Button**: unten rechts. Disabled solange keine CSV geladen ist oder ein Eingabefeld Validierungsfehler zeigt.
5. **Hilfe-Boxen** „Erwartetes Format" und „So funktioniert die Optimierung": rutschen nach unten, inhaltlich aktualisiert (siehe Dokumentations-Änderungen).

### State- und API-Lifecycle

- Mount: `GET /api/settings` → Response wird in lokalen State gelegt. `courses` speist das Dropdown; `assignments_exist` steuert den Warndialog.
- Settings-Eingaben: kontrollierte Komponenten, lokale State-Updates, **keine** Live-Persistierung.
- Upload: nach erfolgreichem `POST /api/upload` wird `GET /api/settings` erneut geholt, um die Kursliste im Dropdown zu aktualisieren.
- Klick auf „Weiter zum Editor":
  1. Client-Validierung (siehe unten). Bei Fehlern: Abbruch, Fokus auf erstes fehlerhaftes Feld.
  2. Falls `assignments_exist && formularGeändert`: Confirm-Modal „Damit werden die bestehenden Zuteilungen verworfen. Fortfahren?" Abbruch hier lässt den Nutzer auf Seite 1 mit seinen Eingaben.
  3. `PUT /api/settings` mit dem vollen Settings-Objekt. Response wird verworfen (außer bei Fehler).
  4. `navigate('/editor')`.

### Inline-Validierung

- Werte `< 1` → rotes Outline + Fehlertext unter dem Feld: „Mindestens 1."
- `default_min > default_max` → rotes Outline an beiden Feldern + Fehlertext: „Min darf nicht größer als Max sein."
- Analog für `special_min > special_max`.
- `hj1_count + hj2_count > courses.length` (nur wenn CSV geladen): Warntext unter den HJ-Feldern (nicht-blockierend, goldgelb): „Es gibt nur N Kurse in der CSV — die Optimierung wird scheitern."

Solange ein hart-blockierender Fehler aktiv ist, ist „Weiter zum Editor" disabled.

### Navigation

Top-Bar-Link zurück zu Seite 1 bleibt funktional. Beim erneuten Betreten der Seite werden die zuletzt gespeicherten Settings geladen.

## Edge Cases und Migration

### Reset-Trigger

Der Assignments-Reset auf `PUT /api/settings` löst genau dann aus, wenn das neue `SessionSettings`-Objekt vom alten abweicht **und** `assignments` nicht leer sind. No-op-PUTs lassen bestehende Zuteilungen intakt. Der Vergleich erfolgt Feld für Feld (Pydantic `__eq__`).

### Sonderkurs nach CSV-Neu-Upload

`POST /api/upload` setzt `settings.special_course = None`, falls der bisher gespeicherte Kursname nicht in der neuen Kursliste vorkommt. Auf Seite 1 zeigt das Dropdown daraufhin „– kein Sonderkurs –", und der Nutzer kann neu wählen. Die anderen Settings-Werte bleiben erhalten.

### Infeasibility

- Pre-Solve-Check liefert klartextliche Fehlermeldungen (siehe Solver-Änderungen).
- Restliche CBC-Infeasibilities fallen auf die bestehende generische Meldung zurück.

### Bestehende Sessions ohne `settings`-Feld

Pydantic füllt das fehlende Feld automatisch mit `SessionSettings()`-Defaults. Die alten `Course.min=15` / `Course.max=26` aus der Session bleiben erhalten, bis der Nutzer auf Seite 1 zum ersten Mal auf „Weiter zum Editor" klickt. Ab diesem Zeitpunkt greift `apply_settings_to_courses` mit den neuen Defaults und setzt überall Min=1, Max=22 (bzw. 14 für den Sonderkurs). Bestehende Assignments gehen dabei verloren — **Breaking-Change**.

### CSV-Validator unverändert

„Genau 8 Prioritäten pro Schüler" bleibt Vertragsteil des CSV-Formats, unabhängig von den konfigurierten HJ-Anzahlen.

## Tests

### Backend

Erweitert in `tests/test_api.py`:

- `GET /api/settings` bei leerer Session liefert Defaults + leere `courses` + `assignments_exist: false`.
- `GET /api/settings` nach Upload liefert geparste Kursliste.
- `PUT /api/settings` akzeptiert valide Werte und persistiert.
- `PUT /api/settings` → `422` bei `< 1`, bei `min > max`, bei unbekanntem `special_course`.
- `PUT /api/settings` identischer Body (no-op) behält Assignments.
- `PUT /api/settings` echte Änderung nach Optimierung löscht Assignments; Response `assignments_cleared: true`.
- `POST /api/upload` mit CSV ohne bisherigen Sonderkurs → `special_course = None`.
- `POST /api/optimize/swap` bricht mit `400` ab, wenn Invariante manipuliert wird.

Erweitert in `tests/test_optimizer.py`:

- `run_full_optimization` mit `hj1_count=3, hj2_count=5` → genau 3 Kurse in HJ1, 5 in HJ2.
- Asymmetrische Fälle: `1+1`, `5+3`.
- Sonderkurs mit `special_max=14`: der ausgewählte Kurs bekommt diese Obergrenze, die anderen `default_max`.
- Pre-Solve-Check wirft `ValueError` mit konkreter Meldung bei `hj1+hj2 > len(courses)`.
- Pre-Solve-Check wirft `ValueError` bei `(hj1+hj2) * max(default_max, special_max) < n_students`.

Neue Helper-Tests (neue Datei `tests/test_settings.py` oder in `test_api.py`):

- `apply_settings_to_courses` mit `special_course=None` setzt alle Kurse auf Defaults.
- `apply_settings_to_courses` mit benanntem Sonderkurs setzt nur diesen auf `special_*`.
- `apply_settings_to_courses` mit unbekanntem Sonderkurs-Namen ignoriert ihn still (alle Kurse auf Defaults).

### Frontend (manuelle Smoke-Tests)

Das Projekt hat keine Frontend-Test-Suite. Nach Implementierung werden diese Pfade manuell verifiziert:

1. Frische Session → Seite 1 zeigt Defaults → CSV hochladen → Dropdown füllt sich → „Weiter" → Editor → Optimierung erfolgreich mit 4+4.
2. Zurück zu Seite 1 → `hj1_count=3, hj2_count=5` → „Weiter" zeigt Warndialog → bestätigen → neue Optimierung mit 3+5.
3. Neue CSV ohne „Kochen" hochladen → Dropdown auf „– kein Sonderkurs –".
4. Validation: `default_min=10, default_max=5` → rote Outlines, Button disabled.
5. `npm run build` und `tsc --noEmit` fehlerfrei.

## Dokumentations-Änderungen

- **`ConstraintsPage.tsx`**: Sektion „Kurs-Kapazitäten" wird umgeschrieben, zeigt die neuen Defaults (1, 22, 14) und markiert sie als konfigurierbar mit Hinweis „Die tatsächlichen Werte werden auf Seite 1 eingestellt." Sektion „Volloptimierung" entfernt „exakt 8" / „4+4" und spricht stattdessen von „den auf Seite 1 eingestellten Anzahlen pro Halbjahr". Footer-Kapazitätsrechnung wird zu einem Beispiel.
- **`CHANGELOG.md`**: Breaking-Change-Eintrag: „Kurskapazitäten und HJ-Anzahlen sind jetzt konfigurierbar. Bestehende Sessions werden beim ersten Öffnen von Seite 1 auf die neuen Defaults (Min 1, Max 22, Sonderkurs-Max 14) zurückgesetzt — Assignments gehen dabei verloren."
- **`README.md`**: kurzer Hinweis auf konfigurierbare Rahmenbedingungen.
- **`UploadPage.tsx`**-Info-Box „So funktioniert die Optimierung": Text aktualisiert — nicht mehr „4 pro Halbjahr", sondern „nach den oben eingestellten Anzahlen".

## Offene Punkte

Keine. Der nächste Schritt ist ein Implementation-Plan über die `writing-plans`-Skill.
