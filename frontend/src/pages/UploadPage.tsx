import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { UploadResult, SessionSettings, SettingsResponse } from '../types'

const DEFAULT_SETTINGS: SessionSettings = {
  hj1_count: 4,
  hj2_count: 4,
  default_max: 22,
  default_min: 1,
  special_course: null,
  special_max: 14,
  special_min: 1,
}

function settingsEqual(a: SessionSettings, b: SessionSettings): boolean {
  return (
    a.hj1_count === b.hj1_count &&
    a.hj2_count === b.hj2_count &&
    a.default_max === b.default_max &&
    a.default_min === b.default_min &&
    a.special_course === b.special_course &&
    a.special_max === b.special_max &&
    a.special_min === b.special_min
  )
}

interface ValidationErrors {
  hj1_count?: string
  hj2_count?: string
  default_max?: string
  default_min?: string
  special_max?: string
  special_min?: string
  hj_overflow?: string
}

function validate(s: SessionSettings, courseCount: number): ValidationErrors {
  const errs: ValidationErrors = {}
  if (s.hj1_count < 1) errs.hj1_count = 'Mindestens 1'
  if (s.hj2_count < 1) errs.hj2_count = 'Mindestens 1'
  if (s.default_max < 1) errs.default_max = 'Mindestens 1'
  if (s.default_min < 1) errs.default_min = 'Mindestens 1'
  if (s.special_max < 1) errs.special_max = 'Mindestens 1'
  if (s.special_min < 1) errs.special_min = 'Mindestens 1'
  if (s.default_min > s.default_max) {
    errs.default_min = 'Min > Max'
    errs.default_max = 'Min > Max'
  }
  if (s.special_min > s.special_max) {
    errs.special_min = 'Min > Max'
    errs.special_max = 'Min > Max'
  }
  if (courseCount > 0 && s.hj1_count + s.hj2_count > courseCount) {
    errs.hj_overflow = `Nur ${courseCount} Kurse in der CSV — Optimierung wird scheitern.`
  }
  return errs
}

function hasBlockingErrors(errs: ValidationErrors): boolean {
  const { hj_overflow, ...blocking } = errs
  return Object.keys(blocking).length > 0
}

export default function UploadPage() {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [algoOpen, setAlgoOpen] = useState(false)
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS)
  const [savedSettings, setSavedSettings] = useState<SessionSettings>(DEFAULT_SETTINGS)
  const [courses, setCourses] = useState<string[]>([])
  const [assignmentsExist, setAssignmentsExist] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.getSettings().then((res: SettingsResponse) => {
      setSettings(res.settings)
      setSavedSettings(res.settings)
      setCourses(res.courses)
      setAssignmentsExist(res.assignments_exist)
      if (res.courses.length > 0) {
        setUploadResult({ total: 0, valid_count: 0, invalid_count: 0, course_names: res.courses })
      }
    }).catch(e => setError(e instanceof Error ? e.message : 'Fehler beim Laden der Einstellungen'))
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleFile = useCallback(async (file: File) => {
    if (loading) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Bitte eine CSV-Datei hochladen.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await api.uploadCsv(file)
      setUploadResult(res)
      const fresh = await api.getSettings()
      setSettings(fresh.settings)
      setSavedSettings(fresh.settings)
      setCourses(fresh.courses)
      setAssignmentsExist(fresh.assignments_exist)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [loading])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const errors = validate(settings, courses.length)
  const blocked = hasBlockingErrors(errors)
  const canContinue = courses.length > 0 && !blocked
  const changed = !settingsEqual(settings, savedSettings)

  const doSave = async () => {
    try {
      await api.updateSettings(settings)
      setSavedSettings(settings)
      navigate('/editor')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen')
    }
  }

  const onContinue = () => {
    if (!canContinue) return
    if (assignmentsExist && changed) {
      setConfirmOpen(true)
    } else {
      doSave()
    }
  }

  return (
    <div className="max-w-2xl mx-auto mt-10 stagger-1">
      <div className="mb-8 stagger-1">
        <h1 className="font-display text-3xl font-bold text-t1 mb-1.5">CSV hochladen</h1>
        <p className="text-t2 text-sm">Schülerpräferenzen importieren und Rahmenbedingungen einstellen</p>
      </div>

      {/* Upload area */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={onDrop}
        className={`stagger-2 relative flex flex-col items-center justify-center rounded-2xl p-10 cursor-pointer
          transition-all duration-300 border-2
          ${uploadResult
            ? 'border-ok/50 bg-ok/[0.04]'
            : dragging
            ? 'border-accent bg-accent/[0.05] scale-[1.02]'
            : loading
            ? 'border-border bg-elevated'
            : 'border-border hover:border-accent/50 hover:bg-accent/[0.025] bg-surface'}`}
      >
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) handleFile(file)
          }}
        />
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-accent/25 border-t-accent animate-spin-slow" />
            <p className="text-t2 text-sm font-medium">Wird verarbeitet…</p>
          </div>
        ) : uploadResult ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-10 h-10 rounded-full bg-ok/10 border border-ok/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-ok" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <p className="font-display font-semibold text-t1">{uploadResult.total} Schüler importiert</p>
            <p className="text-sm text-t2">
              <span className="text-ok">{uploadResult.valid_count} gültig</span>
              {uploadResult.invalid_count > 0 && (
                <> · <span className="text-err">{uploadResult.invalid_count} mit Fehlern</span></>
              )}
            </p>
            <p className="text-xs text-t3 mt-1">Neue Datei droppen zum Ersetzen</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300
              ${dragging ? 'border-accent text-accent scale-110' : 'border-border text-t3'}`}>
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className={`font-medium transition-colors duration-200 ${dragging ? 'text-accent' : 'text-t1'}`}>
                {dragging ? 'Loslassen zum Hochladen' : 'CSV-Datei hier ablegen'}
              </p>
              <p className="text-xs text-t3 mt-1">oder klicken zum Auswählen · max. 5 MB</p>
            </div>
          </div>
        )}
      </label>

      {error && (
        <div className="stagger-3 mt-4 p-4 bg-err/[0.05] border border-err/20 rounded-xl flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-err/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-err text-xs font-bold">!</span>
          </div>
          <p className="text-err text-sm leading-relaxed">{error}</p>
        </div>
      )}

      {/* Settings card */}
      <section className="stagger-3 mt-6 bg-surface border border-border rounded-2xl p-6 shadow-card">
        <h2 className="font-display text-lg font-semibold text-t1 mb-1">Rahmenbedingungen</h2>
        <p className="text-sm text-t2 mb-5">Diese Werte steuern, wie der Solver Kurse auswählt und Schüler zuteilt.</p>

        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Kurse HJ1" value={settings.hj1_count}
            onChange={v => setSettings(s => ({ ...s, hj1_count: v }))}
            error={errors.hj1_count} />
          <NumberField label="Kurse HJ2" value={settings.hj2_count}
            onChange={v => setSettings(s => ({ ...s, hj2_count: v }))}
            error={errors.hj2_count} />
          <NumberField label="Max Schüler / Kurs" value={settings.default_max}
            onChange={v => setSettings(s => ({ ...s, default_max: v }))}
            error={errors.default_max} />
          <NumberField label="Min Schüler / Kurs" value={settings.default_min}
            onChange={v => setSettings(s => ({ ...s, default_min: v }))}
            error={errors.default_min} />
          <NumberField label="Max Schüler Sonderkurs" value={settings.special_max}
            onChange={v => setSettings(s => ({ ...s, special_max: v }))}
            error={errors.special_max} />
          <NumberField label="Min Schüler Sonderkurs" value={settings.special_min}
            onChange={v => setSettings(s => ({ ...s, special_min: v }))}
            error={errors.special_min} />
        </div>

        {errors.hj_overflow && (
          <p className="mt-2 text-xs text-yellow-700 dark:text-yellow-400">{errors.hj_overflow}</p>
        )}

        <div className="mt-5">
          <label className="block text-sm font-medium text-t1 mb-1">Sonderkurs</label>
          <select
            value={settings.special_course ?? ''}
            disabled={courses.length === 0}
            onChange={e => setSettings(s => ({
              ...s,
              special_course: e.target.value === '' ? null : e.target.value,
            }))}
            className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-t1
              disabled:text-t3 disabled:cursor-not-allowed"
          >
            {courses.length === 0 ? (
              <option value="">Erst CSV hochladen…</option>
            ) : (
              <>
                <option value="">– kein Sonderkurs –</option>
                {courses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </>
            )}
          </select>
        </div>
      </section>

      {/* Continue button */}
      <div className="stagger-3 mt-6 flex justify-end">
        <button
          type="button"
          disabled={!canContinue}
          onClick={onContinue}
          className="px-6 py-2.5 rounded-lg bg-accent text-white font-medium shadow-card
            hover:bg-accent/90 disabled:bg-elevated disabled:text-t3 disabled:cursor-not-allowed
            disabled:shadow-none transition-colors"
        >
          Weiter zum Editor
        </button>
      </div>

      {/* Help boxes */}
      <div className="stagger-4 mt-6 p-4 bg-elevated border border-border rounded-xl">
        <p className="text-xs font-semibold text-t2 mb-2 uppercase tracking-wider">Erwartetes Format</p>
        <code className="text-xs text-t3 font-mono block">Nr.;Name;Kurs1;Kurs2;…;Kurs8</code>
        <p className="text-xs text-t3 mt-1.5">Genau 8 Wunschkurse · Priorität 1–8 · keine Duplikate</p>
      </div>

      <div className="stagger-4 mt-4 p-4 bg-elevated border border-border rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-3 h-3 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </div>
          <p className="text-xs font-semibold text-t2 uppercase tracking-wider">So funktioniert die Optimierung</p>
        </div>
        <p className="text-xs text-t3 leading-relaxed">
          Dieses Tool verteilt Schüler anhand ihrer Wunschlisten optimal auf Kurse.
          Der Algorithmus wählt Kurse gemäß den oben eingestellten Anzahlen pro Halbjahr
          und teilt jeden Schüler so zu, dass möglichst viele ihre Top-Wünsche erhalten.
        </p>
        <button
          type="button"
          aria-expanded={algoOpen}
          aria-controls="algo-detail"
          onClick={() => setAlgoOpen(o => !o)}
          className="mt-3 flex items-center gap-1.5 text-xs text-accent hover:underline cursor-pointer"
        >
          <svg viewBox="0 0 24 24"
            className={`w-3 h-3 transition-transform duration-200 ${algoOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
          Wie funktioniert's im Detail?
        </button>
        {algoOpen && (
          <div id="algo-detail" className="border-t border-border mt-3 pt-3 space-y-1.5">
            <p className="text-xs text-t3"><span className="text-t2 font-medium">Methode:</span> Ganzzahlige lineare Optimierung (ILP) via PuLP/CBC-Solver</p>
            <p className="text-xs text-t3"><span className="text-t2 font-medium">Zielfunktion:</span> Maximiert die Gesamtzufriedenheit — Priorität 1 gibt 8 Punkte, Priorität 2 gibt 7, usw.</p>
            <p className="text-xs text-t3"><span className="text-t2 font-medium">Nebenbedingungen:</span> HJ-Anzahlen gemäß Einstellungen, jeder Schüler bekommt genau 1 Kurs pro HJ, Kurskapazitäten (min/max) werden eingehalten</p>
            <p className="text-xs text-t3"><span className="text-t2 font-medium">Ergebnis:</span> Mathematisch optimale Zuteilung — keine bessere Verteilung ist möglich</p>
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setConfirmOpen(false)}>
          <div className="bg-surface rounded-2xl p-6 max-w-md mx-4 shadow-card border border-border" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold text-t1 mb-2">Zuteilungen verwerfen?</h3>
            <p className="text-sm text-t2 mb-5">
              Die bestehenden Zuteilungen werden durch die geänderten Rahmenbedingungen ungültig und verworfen.
              Du musst die Optimierung danach neu starten.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-lg bg-elevated text-t1 hover:bg-elevated/70 text-sm"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => { setConfirmOpen(false); doSave() }}
                className="px-4 py-2 rounded-lg bg-err text-white hover:bg-err/90 text-sm"
              >
                Zuteilungen verwerfen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  onChange: (v: number) => void
  error?: string
}

function NumberField({ label, value, onChange, error }: NumberFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-t2 mb-1">{label}</label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={e => {
          const n = parseInt(e.target.value, 10)
          onChange(Number.isNaN(n) ? 0 : n)
        }}
        className={`w-full bg-elevated border rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-t1
          ${error ? 'border-err' : 'border-border'}`}
      />
      {error && <p className="text-xs text-err mt-0.5">{error}</p>}
    </div>
  )
}
