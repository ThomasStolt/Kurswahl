import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ResultsData } from '../types'

function ScoreBadge({ score }: { score: number }) {
  const prio = score > 0 ? 9 - score : null
  if (!prio) return <span className="text-t3 text-xs">–</span>
  const style =
    prio <= 2 ? 'bg-ok/10 text-ok'
    : prio <= 4 ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
    : 'bg-err/10 text-err'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${style}`}>
      {prio}
    </span>
  )
}

export default function ResultsPage() {
  const [results, setResults] = useState<ResultsData | null>(null)
  const [tab, setTab]         = useState<'course' | 'student'>('course')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    api.getResults()
      .then(setResults)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center gap-3 mt-16 justify-center text-t2">
      <div className="w-5 h-5 rounded-full border-2 border-border border-t-accent animate-spin-slow" />
      <span className="text-sm">Lade Ergebnisse…</span>
    </div>
  )
  if (error) return (
    <div className="mt-8 p-4 bg-err/[0.05] border border-err/20 rounded-xl text-err text-sm">{error}</div>
  )
  if (!results) return null

  return (
    <div>
      <div className="flex items-start justify-between mb-6 stagger-1">
        <div>
          <h1 className="font-display text-3xl font-bold text-t1 mb-1">Ergebnisse</h1>
          <p className="text-sm text-t2">Kurs- und Schülerzuteilungen im Überblick</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={api.exportCsv}
            className="flex items-center gap-2 bg-elevated border border-border text-t1 px-4 py-2.5 rounded-xl text-sm
              font-medium hover:border-accent/40 hover:text-accent transition-all duration-200"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v9M4 7l4 4 4-4M2 13h12" />
            </svg>
            CSV
          </button>
          <button
            onClick={api.exportExcel}
            className="flex items-center gap-2 bg-ok text-surface px-4 py-2.5 rounded-xl text-sm
              font-semibold hover:bg-ok/90 transition-all duration-200 hover:shadow-glow active:scale-[0.97]"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v9M4 7l4 4 4-4M2 13h12" />
            </svg>
            Excel
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="stagger-2 flex gap-1 p-1 bg-elevated border border-border rounded-xl w-fit mb-6">
        {(['course', 'student'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${tab === t
                ? 'bg-surface text-t1 shadow-card'
                : 'text-t2 hover:text-t1'}`}
          >
            {t === 'course' ? 'Pro Kurs' : 'Pro Schüler'}
          </button>
        ))}
      </div>

      {tab === 'course' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger-3">
          {results.by_course
            .sort((a, b) => (a.semester ?? 0) - (b.semester ?? 0))
            .map(course => (
              <div
                key={course.name}
                className="bg-surface border border-border rounded-2xl p-5
                  hover:border-accent/20 hover:shadow-card-md transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-display font-semibold text-t1">{course.name}</h3>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ml-2
                      ${course.semester === 1
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'bg-violet-500/10 text-violet-600 dark:text-violet-400'}`}
                  >
                    HJ {course.semester}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-t2 mb-4">
                  <span className="font-medium">{course.count} Schüler</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span>Ø Priorität {course.avg_score > 0 ? (9 - course.avg_score).toFixed(1) : '–'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {course.students.map(s => (
                    <span
                      key={s.nr}
                      className="bg-elevated border border-border text-t2 text-xs px-2 py-0.5 rounded-full"
                    >
                      {s.name || `Nr. ${s.nr}`}
                    </span>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {tab === 'student' && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-card stagger-3">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated">
                {['Nr.', 'Name', 'HJ1 Kurs', 'Prio', 'HJ2 Kurs', 'Prio'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-t2 text-xs font-semibold uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.by_student
                .sort((a, b) => a.student_nr - b.student_nr)
                .map(a => (
                  <tr key={a.student_nr} className="hover:bg-elevated transition-colors duration-100">
                    <td className="px-4 py-2.5 font-mono text-t3 text-xs">{a.student_nr}</td>
                    <td className="px-4 py-2.5 font-medium text-t1">{a.student_name || '–'}</td>
                    <td className="px-4 py-2.5 text-t2 text-xs">{a.course_hj1}</td>
                    <td className="px-4 py-2.5"><ScoreBadge score={a.score_hj1} /></td>
                    <td className="px-4 py-2.5 text-t2 text-xs">{a.course_hj2}</td>
                    <td className="px-4 py-2.5"><ScoreBadge score={a.score_hj2} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
