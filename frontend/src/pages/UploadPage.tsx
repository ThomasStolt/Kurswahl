import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { UploadResult } from '../types'

export default function UploadPage() {
  const navigate = useNavigate()
  const [dragging, setDragging]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState<UploadResult | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [algoOpen, setAlgoOpen]   = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
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
      setResult(res)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => navigate('/editor'), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [navigate, loading])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div className="max-w-md mx-auto mt-10 stagger-1">
      <div className="mb-8 stagger-1">
        <h1 className="font-display text-3xl font-bold text-t1 mb-1.5">CSV hochladen</h1>
        <p className="text-t2 text-sm">Schülerpräferenzen im CSV-Format importieren</p>
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={onDrop}
        className={`stagger-2 relative flex flex-col items-center justify-center rounded-2xl p-16 cursor-pointer
          transition-all duration-300 border-2
          ${result
            ? 'border-ok/50 bg-ok/[0.04] scale-[1.01]'
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
        ) : result ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-ok/10 border border-ok/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-ok" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <div>
              <p className="font-display font-semibold text-t1 text-lg">{result.total} Schüler importiert</p>
              <p className="text-sm text-t2 mt-0.5">
                <span className="text-ok">{result.valid_count} gültig</span>
                {result.invalid_count > 0 && (
                  <> · <span className="text-err">{result.invalid_count} mit Fehlern</span></>
                )}
              </p>
            </div>
            <p className="text-xs text-t3">Weiterleitung zum Editor…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all duration-300
              ${dragging ? 'border-accent text-accent scale-110' : 'border-border text-t3'}`}>
              <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

      <div className="stagger-3 mt-6 p-4 bg-elevated border border-border rounded-xl">
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
          Der Algorithmus wählt 8 Kurse (4 pro Halbjahr) und teilt jeden Schüler so zu,
          dass möglichst viele ihre Top-Wünsche erhalten.
        </p>

        <button
          type="button"
          aria-expanded={algoOpen}
          aria-controls="algo-detail"
          onClick={() => setAlgoOpen(o => !o)}
          className="mt-3 flex items-center gap-1.5 text-xs text-accent hover:underline cursor-pointer"
        >
          <svg
            viewBox="0 0 24 24"
            className={`w-3 h-3 transition-transform duration-200 ${algoOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          Wie funktioniert's im Detail?
        </button>

        {algoOpen && (
          <div id="algo-detail" className="border-t border-border mt-3 pt-3 space-y-1.5">
            <p className="text-xs text-t3"><span className="text-t2 font-medium">Methode:</span> Ganzzahlige lineare Optimierung (ILP) via PuLP/CBC-Solver</p>
            <p className="text-xs text-t3"><span className="text-t2 font-medium">Zielfunktion:</span> Maximiert die Gesamtzufriedenheit — Priorität 1 gibt 8 Punkte, Priorität 2 gibt 7, usw.</p>
            <p className="text-xs text-t3"><span className="text-t2 font-medium">Nebenbedingungen:</span> Genau 8 Kurse angeboten (4 pro HJ), jeder Schüler bekommt genau 1 Kurs pro HJ, Kurskapazitäten (min/max) werden eingehalten</p>
            <p className="text-xs text-t3"><span className="text-t2 font-medium">Ergebnis:</span> Mathematisch optimale Zuteilung — keine bessere Verteilung ist möglich</p>
          </div>
        )}
      </div>
    </div>
  )
}
