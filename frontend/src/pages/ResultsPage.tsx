import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ResultsData } from '../types'

function ScoreBadge({ score }: { score: number }) {
  const prio = score > 0 ? 9 - score : null
  const color = !prio ? 'bg-gray-200 text-gray-500'
    : prio <= 2 ? 'bg-green-500 text-white'
    : prio <= 4 ? 'bg-yellow-400 text-white'
    : 'bg-red-400 text-white'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${color}`}>
      {prio ? `Prio ${prio}` : '–'}
    </span>
  )
}

export default function ResultsPage() {
  const [results, setResults] = useState<ResultsData | null>(null)
  const [tab, setTab] = useState<'course' | 'student'>('course')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getResults()
      .then(setResults)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-500 mt-8">Lade Ergebnisse…</div>
  if (error) return <div className="text-red-600 mt-8">{error}</div>
  if (!results) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Ergebnisse</h1>
        <div className="flex gap-2">
          <button
            onClick={api.exportCsv}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium"
          >
            ↓ CSV
          </button>
          <button
            onClick={api.exportExcel}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
          >
            ↓ Excel
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['course', 'student'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'course' ? 'Pro Kurs' : 'Pro Schüler'}
          </button>
        ))}
      </div>

      {tab === 'course' && (
        <div className="grid grid-cols-2 gap-4">
          {results.by_course.sort((a, b) => (a.semester ?? 0) - (b.semester ?? 0)).map(course => (
            <div key={course.name} className="bg-white rounded-xl shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-800">{course.name}</h3>
                <span className={`text-xs px-2 py-1 rounded font-medium
                  ${course.semester === 1 ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  HJ {course.semester}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                {course.count} Schüler · Ø Priorität: {course.avg_score > 0 ? (9 - course.avg_score).toFixed(1) : '–'}
              </p>
              <div className="flex flex-wrap gap-1">
                {course.students.map(s => (
                  <span key={s.nr} className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">
                    {s.name || `Nr. ${s.nr}`}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'student' && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th className="px-4 py-3 font-medium">Nr.</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">HJ1 Kurs</th>
                <th className="px-4 py-3 font-medium">HJ1 Prio</th>
                <th className="px-4 py-3 font-medium">HJ2 Kurs</th>
                <th className="px-4 py-3 font-medium">HJ2 Prio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.by_student.sort((a, b) => a.student_nr - b.student_nr).map(a => (
                <tr key={a.student_nr} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-gray-700">{a.student_nr}</td>
                  <td className="px-4 py-2 text-gray-600">{a.student_name || '–'}</td>
                  <td className="px-4 py-2">{a.course_hj1}</td>
                  <td className="px-4 py-2"><ScoreBadge score={a.score_hj1} /></td>
                  <td className="px-4 py-2">{a.course_hj2}</td>
                  <td className="px-4 py-2"><ScoreBadge score={a.score_hj2} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
