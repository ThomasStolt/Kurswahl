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
  const [students, setStudents]   = useState<Student[]>([])
  const [loading, setLoading]     = useState(true)
  const [editName, setEditName]   = useState<Record<number, string>>({})
  const [saving, setSaving]       = useState<number | null>(null)

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
            <tbody className="divide-y divide-border">
              {students.map((student, idx) => (
                <tr
                  key={student.nr}
                  style={{ animationDelay: `${Math.min(idx * 20, 300)}ms` }}
                  className={`transition-colors duration-100
                    ${student.valid ? 'hover:bg-elevated' : 'bg-err/[0.025] hover:bg-err/[0.05]'}`}
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
                  <td className="px-4 py-2.5 w-24 text-right">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
