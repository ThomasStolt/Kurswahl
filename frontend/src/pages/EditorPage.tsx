import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Student } from '../types'

function PriorityBadge({ prio }: { prio: number }) {
  if (prio === 0) return <span className="text-gray-300">–</span>
  const colors = ['', 'bg-green-500', 'bg-green-400', 'bg-lime-400',
    'bg-yellow-300', 'bg-orange-300', 'bg-orange-400', 'bg-red-400', 'bg-red-500']
  return (
    <span className={`inline-block w-6 h-6 rounded text-white text-xs font-bold
      flex items-center justify-center ${colors[prio] ?? 'bg-gray-400'}`}>
      {prio}
    </span>
  )
}

export default function EditorPage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [editName, setEditName] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<number | null>(null)

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

  const validCount = students.filter(s => s.valid).length
  const invalidCount = students.filter(s => !s.valid).length

  if (loading) return <div className="text-gray-500 mt-8">Lade Daten…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Daten-Editor</h1>
          <p className="text-sm text-gray-500 mt-1">
            {validCount} gültig · {invalidCount} mit Fehlern
          </p>
        </div>
        <button
          onClick={() => navigate('/optimize')}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40"
          disabled={validCount === 0}
        >
          Weiter zur Optimierung →
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded-xl shadow">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-left">
              <th className="px-4 py-3 font-medium">Nr.</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Fehler / Prioritäten</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map(student => (
              <tr
                key={student.nr}
                className={student.valid ? '' : 'bg-red-50'}
              >
                <td className="px-4 py-2 font-mono text-gray-700">{student.nr}</td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    defaultValue={student.name}
                    placeholder="Name eingeben…"
                    onChange={e => setEditName(prev => ({ ...prev, [student.nr]: e.target.value }))}
                    className="border border-gray-200 rounded px-2 py-1 w-40 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                <td className="px-4 py-2">
                  {student.valid
                    ? <span className="text-green-600 font-medium">✓ Gültig</span>
                    : <span className="text-red-600 font-medium">⚠ Fehler</span>
                  }
                </td>
                <td className="px-4 py-2">
                  {student.valid ? (
                    <div className="flex gap-1 flex-wrap">
                      {Object.entries(student.preferences)
                        .filter(([, v]) => v > 0)
                        .sort(([, a], [, b]) => a - b)
                        .map(([course, prio]) => (
                          <span key={course} className="text-xs text-gray-600">
                            {course}: <PriorityBadge prio={prio} />
                          </span>
                        ))}
                    </div>
                  ) : (
                    <ul className="text-xs text-red-700 list-disc list-inside">
                      {student.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-2">
                  {editName[student.nr] !== undefined && editName[student.nr] !== student.name && (
                    <button
                      onClick={() => saveStudent(student)}
                      disabled={saving === student.nr}
                      className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
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
  )
}
