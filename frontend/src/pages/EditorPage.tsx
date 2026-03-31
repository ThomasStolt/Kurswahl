import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Student } from '../types'

function PriorityBadge({ prio }: { prio: number }) {
  if (prio === 0) return <span className="text-t3">–</span>
  // prio 1 = best (green), prio 8 = worst (red)
  const hue = Math.round(120 - (prio - 1) * (115 / 7))
  return (
    <span
      style={{ backgroundColor: `hsl(${hue} 55% 42%)` }}
      className="inline-flex items-center justify-center w-5 h-5 rounded text-white text-[10px] font-bold flex-shrink-0"
    >
      {prio}
    </span>
  )
}

function Spinner() {
  return (
    <div className="flex items-center gap-3 mt-16 justify-center text-t2">
      <div className="w-5 h-5 rounded-full border-2 border-border border-t-accent animate-spin-slow" />
      <span className="text-sm">Lade Daten…</span>
    </div>
  )
}

export default function EditorPage() {
  const navigate = useNavigate()
  const [students, setStudents]     = useState<Student[]>([])
  const [loading, setLoading]       = useState(true)
  const [editName, setEditName]     = useState<Record<number, string>>({})
  const [saving, setSaving]         = useState<number | null>(null)
  const [editingNr, setEditingNr]   = useState<number | null>(null)
  const [editPrefs, setEditPrefs]   = useState<Record<string, number>>({})

  useEffect(() => {
    api.getStudents().then(setStudents).finally(() => setLoading(false))
  }, [])

  const saveStudent = async (student: Student) => {
    setSaving(student.nr)
    try {
      const updated = await api.updateStudent(student.nr, {
        name: editName[student.nr] ?? student.name,
      })
      setStudents(prev => prev.map(s => s.nr === updated.nr ? updated : s))
    } finally {
      setSaving(null)
    }
  }

  const startEditingPrefs = (student: Student) => {
    if (editingNr === student.nr) {
      setEditingNr(null)
      return
    }
    setEditingNr(student.nr)
    setEditPrefs({ ...student.preferences })
  }

  const savePrefs = async (student: Student) => {
    setSaving(student.nr)
    try {
      const updated = await api.updateStudent(student.nr, { preferences: editPrefs })
      setStudents(prev => prev.map(s => s.nr === updated.nr ? updated : s))
      setEditingNr(null)
    } finally {
      setSaving(null)
    }
  }

  const validCount   = students.filter(s =>  s.valid).length
  const invalidCount = students.filter(s => !s.valid).length

  if (loading) return <Spinner />

  return (
    <div>
      <div className="flex items-start justify-between mb-6 stagger-1">
        <div>
          <h1 className="font-display text-3xl font-bold text-t1 mb-2">Daten-Editor</h1>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ok/10 text-ok text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-ok" />
              {validCount} gültig
            </span>
            {invalidCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-err/10 text-err text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-err" />
                {invalidCount} mit Fehlern
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate('/optimize')}
          disabled={validCount === 0}
          className="flex items-center gap-2 bg-accent text-surface px-5 py-2.5 rounded-xl font-semibold text-sm
            hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200 hover:shadow-glow active:scale-[0.97]"
        >
          Zur Optimierung
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-card stagger-2">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated">
                {['Nr.', 'Name', 'Status', 'Prioritäten / Fehler', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-t2 text-xs font-semibold uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student, idx) => {
                const isEditing = editingNr === student.nr
                const nonZero   = Object.values(editPrefs).filter(v => v > 0)
                const count     = nonZero.length
                const hasDups   = count !== new Set(nonZero).size
                const canSave   = count === 8 && !hasDups

                return (
                  <>
                    <tr
                      key={student.nr}
                      style={{ animationDelay: `${Math.min(idx * 20, 300)}ms` }}
                      className={`border-t border-border transition-colors duration-100
                        ${student.valid ? 'hover:bg-elevated' : 'bg-err/[0.025] hover:bg-err/[0.05]'}
                        ${isEditing ? 'bg-elevated' : ''}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-t3 text-xs w-12">{student.nr}</td>
                      <td className="px-4 py-2.5 w-48">
                        <input
                          type="text"
                          defaultValue={student.name}
                          placeholder="Name eingeben…"
                          onChange={e => setEditName(prev => ({ ...prev, [student.nr]: e.target.value }))}
                          className="bg-transparent border border-transparent hover:border-border/60 focus:border-accent/50
                            rounded-lg px-2 py-1 w-full text-sm text-t1 placeholder:text-t3
                            focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all duration-150"
                        />
                      </td>
                      <td className="px-4 py-2.5 w-24">
                        {student.valid ? (
                          <span className="inline-flex items-center gap-1.5 text-ok text-xs font-semibold">
                            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 6l3 3 5-5" />
                            </svg>
                            Gültig
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-err text-xs font-semibold">
                            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <path d="M6 3v4M6 9v1" />
                            </svg>
                            Fehler
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 max-w-xs">
                        {student.valid ? (
                          <div className="flex gap-2 flex-wrap">
                            {Object.entries(student.preferences)
                              .filter(([, v]) => v > 0)
                              .sort(([, a], [, b]) => a - b)
                              .map(([course, prio]) => (
                                <div key={course} className="flex items-center gap-1">
                                  <PriorityBadge prio={prio} />
                                  <span className="text-xs text-t2">{course}</span>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <ul className="space-y-0.5">
                            {student.errors.map((e, i) => (
                              <li key={i} className="text-xs text-err/80 flex items-start gap-1">
                                <span className="text-err/40 mt-0.5">·</span>
                                {e}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-2.5 w-40 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editName[student.nr] !== undefined && editName[student.nr] !== student.name && (
                            <button
                              onClick={() => saveStudent(student)}
                              disabled={saving === student.nr}
                              className="text-xs bg-accent/10 text-accent px-3 py-1 rounded-lg
                                hover:bg-accent/20 transition-colors duration-150 font-semibold disabled:opacity-50"
                            >
                              {saving === student.nr ? '…' : 'Speichern'}
                            </button>
                          )}
                          <button
                            onClick={() => startEditingPrefs(student)}
                            className={`text-xs px-3 py-1 rounded-lg transition-all duration-150 font-semibold flex items-center gap-1
                              ${isEditing
                                ? 'bg-accent/15 text-accent'
                                : 'text-t3 hover:text-t1 hover:bg-elevated'}`}
                            title="Kurswahlen bearbeiten"
                          >
                            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8.5 1.5l2 2-6 6H2.5v-2l6-6z" />
                            </svg>
                            Wahlen
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isEditing && (
                      <tr key={`prefs-${student.nr}`} className="border-t border-border">
                        <td colSpan={5} className="px-4 py-4 bg-elevated">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-t2 uppercase tracking-wider">Kurswahlen bearbeiten</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                              ${canSave ? 'bg-ok/10 text-ok' : hasDups ? 'bg-err/10 text-err' : 'bg-accent/10 text-accent'}`}>
                              {hasDups ? 'Doppelte Prioritäten!' : `${count} / 8 gewählt`}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                            {Object.entries(editPrefs)
                              .sort(([a, pa], [b, pb]) => {
                                if (pa === 0 && pb === 0) return a.localeCompare(b)
                                if (pa === 0) return 1
                                if (pb === 0) return -1
                                return pa - pb
                              })
                              .map(([course, prio]) => {
                                const isDup = prio > 0 && Object.entries(editPrefs).some(([c, p]) => c !== course && p === prio)
                                return (
                                  <label key={course} className="flex items-center gap-2 group">
                                    <input
                                      type="number"
                                      min={0}
                                      max={8}
                                      value={prio === 0 ? '' : prio}
                                      placeholder="–"
                                      onChange={e => {
                                        const val = e.target.value === '' ? 0 : Math.max(0, Math.min(8, parseInt(e.target.value) || 0))
                                        setEditPrefs(prev => ({ ...prev, [course]: val }))
                                      }}
                                      className={`w-10 text-center text-sm border rounded-lg px-1 py-1 bg-surface text-t1
                                        focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all duration-150
                                        [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
                                        ${isDup ? 'border-err/50 bg-err/5' : 'border-border focus:border-accent/50'}`}
                                    />
                                    <span className="text-xs text-t2 truncate group-hover:text-t1 transition-colors">{course}</span>
                                  </label>
                                )
                              })}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => savePrefs(student)}
                              disabled={!canSave || saving === student.nr}
                              className="flex items-center gap-1.5 text-xs bg-accent text-surface px-4 py-1.5 rounded-lg font-semibold
                                hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                            >
                              {saving === student.nr ? (
                                <><div className="w-3 h-3 rounded-full border border-current/30 border-t-current animate-spin-slow" /> Speichern…</>
                              ) : 'Speichern'}
                            </button>
                            <button
                              onClick={() => setEditingNr(null)}
                              className="text-xs text-t3 hover:text-t1 px-3 py-1.5 rounded-lg hover:bg-border/50 transition-all duration-150"
                            >
                              Abbrechen
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
