# Algorithm Explanation Card — Design Spec

**Date:** 2026-04-04
**Status:** Approved

## Overview

Add an informational card to the UploadPage that explains what the Kurswahl optimization tool does. The card serves two audiences: a plain-language summary for teachers/administrators, and a collapsible technical section for curious users.

## Placement

- Located at the bottom of `UploadPage.tsx`, below the existing "Erwartetes Format" card
- Last element on the page

## Structure

A single card with:
1. **Header:** Small icon (info/lightbulb) + title "So funktioniert die Optimierung"
2. **Summary** (always visible): 2-3 sentences in plain German
3. **Toggle row:** "Wie funktioniert's im Detail?" — expands/collapses the technical section
4. **Technical detail** (collapsible): Compact list explaining the ILP method

## Content

### Always-visible summary

> Dieses Tool verteilt Schüler anhand ihrer Wunschlisten optimal auf Kurse. Der Algorithmus wählt 8 Kurse (4 pro Halbjahr) und teilt jeden Schüler so zu, dass möglichst viele ihre Top-Wünsche erhalten.

### Expandable technical detail

- **Methode:** Ganzzahlige lineare Optimierung (ILP) via PuLP/CBC-Solver
- **Zielfunktion:** Maximiert die Gesamtzufriedenheit — Priorität 1 gibt 8 Punkte, Priorität 2 gibt 7, usw.
- **Nebenbedingungen:** Genau 8 Kurse angeboten (4 pro HJ), jeder Schüler bekommt genau 1 Kurs pro HJ, Kurskapazitäten (min/max) werden eingehalten
- **Ergebnis:** Mathematisch optimale Zuteilung — keine bessere Verteilung ist möglich

## Interaction

- `useState<boolean>(false)` controls expanded/collapsed state
- Click on toggle row flips state
- Chevron icon rotates 180° when expanded
- Smooth transition on expand/collapse

## Styling

- Card: `bg-elevated border border-border rounded-xl p-4` (matches "Erwartetes Format" card)
- Animation: `stagger-3` class (appears after format card in page load sequence — may need `stagger-4` if sequencing conflicts)
- Title: `text-xs font-semibold text-t2 uppercase tracking-wider`
- Summary text: `text-xs text-t3`
- Toggle row: `text-xs text-accent cursor-pointer` with hover underline
- Technical section: `text-xs text-t3` with `border-t border-border mt-3 pt-3` separator
- List bullets: small accent-colored dots or dashes

## Implementation scope

- Single file change: `frontend/src/pages/UploadPage.tsx`
- No new components, no new dependencies
- One `useState` hook added
