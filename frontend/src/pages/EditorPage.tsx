import { useEffect, useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../api'
import type { Student } from '../types'

function PriorityBadge({ prio }: { prio: number }) {
  if (prio === 0) return <span className="text-t3">–</span>
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

function SortableCourseItem({
  course, index, onMoveUp, onMoveDown, canUp, canDown,
}: {
  course: string; index: number;
  onMoveUp: () => void; onMoveDown: () => void;
  canUp: boolean; canDown: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: course })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const selected = index < 8

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg select-none
        transition-all duration-100
        ${isDragging
          ? 'opacity-40 scale-[0.98] bg-accent/5 border border-accent/25 shadow-glow'
          : selected
          ? 'bg-surface border border-border hover:border-accent/25'
          : 'bg-elevated border border-border/50 opacity-55 hover:opacity-80'}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-t3 hover:text-t2 transition-colors flex-shrink-0 p-0.5 -m-0.5"
        tabIndex={-1}
      >
        <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 4.5h10M2 7h10M2 9.5h10" />
        </svg>
      </button>

      {/* Priority indicator */}
      <div className="w-5 flex-shrink-0 flex justify-center">
        {selected ? <PriorityBadge prio={index + 1} /> : <span className="text-xs text-t3 font-mono">–</span>}
      </div>

      {/* Course name */}
      <span className="flex-1 text-sm text-t1 truncate">{course}</span>

      {/* Arrow buttons */}
      <div className="flex gap-0.5 flex-shrink-0">
        <button
          onClick={onMoveUp}
          disabled={!canUp}
          className="p-1 rounded hover:bg-elevated text-t3 hover:text-t1 disabled:opacity-20 transition-all"
        >
          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 7l3-4 3 4" />
          </svg>
        </button>
        <button
          onClick={onMoveDown}
          disabled={!canDown}
          className="p-1 rounded hover:bg-elevated text-t3 hover:text-t1 disabled:opacity-20 transition-all"
        >
          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3l3 4 3-4" />
          </svg>
        </button>
      </div>
    </div>
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
  const [editOrder, setEditOrder]   = useState<string[]>([])

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
    if (editingNr === student.nr) { setEditingNr(null); return }
    const selected = Object.entries(student.preferences)
      .filter(([, p]) => p > 0)
      .sort(([, a], [, b]) => a - b)
      .map(([course]) => course)
    const unselected = Object.entries(student.preferences)
      .filter(([, p]) => p === 0)
      .map(([course]) => course)
      .sort((a, b) => a.localeCompare(b))
    setEditOrder([...selected, ...unselected])
    setEditingNr(student.nr)
  }

  const moveItem = (index: number, direction: -1 | 1) => {
    setEditOrder(prev => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setEditOrder(prev => {
      const oldIdx = prev.indexOf(active.id as string)
      const newIdx = prev.indexOf(over.id as string)
      return arrayMove(prev, oldIdx, newIdx)
    })
  }

  const savePrefs = async (student: Student) => {
    setSaving(student.nr)
    const preferences: Record<string, number> = {}
    editOrder.forEach((course, i) => { preferences[course] = i < 8 ? i + 1 : 0 })
    try {
      const updated = await api.updateStudent(student.nr, { preferences })
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
                return (
                  <Fragment key={student.nr}>
                    <tr
                      style={{ animationDelay: `${Math.min(idx * 20, 300)}ms` }}
                      className={`border-t border-border transition-colors duration-100
                        ${student.valid ? 'hover:bg-elevated' : 'bg-err/[0.025] hover:bg-err/[0.05]'}
                        ${isEditing ? '!bg-elevated' : ''}`}
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
                              {saving === student.nr ? '…' : 'Name'}
                            </button>
                          )}
                          <button
                            onClick={() => startEditingPrefs(student)}
                            className={`text-xs px-3 py-1 rounded-lg transition-all duration-150 font-semibold flex items-center gap-1
                              ${isEditing ? 'bg-accent/15 text-accent' : 'text-t3 hover:text-t1 hover:bg-elevated'}`}
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
                      <tr className="border-t border-accent/20">
                        <td colSpan={5} className="px-6 py-4 bg-elevated">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-semibold text-t2 uppercase tracking-wider">
                              Kurswahlen bearbeiten
                            </span>
                            <span className="text-xs text-t3">
                              Reihenfolge = Priorität · die ersten 8 werden gewählt
                            </span>
                          </div>

                          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={editOrder} strategy={verticalListSortingStrategy}>
                              <div className="space-y-1">
                                {editOrder.map((course, i) => (
                                  <Fragment key={course}>
                                    {i === 8 && (
                                      <div className="flex items-center gap-3 py-2 px-1">
                                        <div className="h-px flex-1 bg-border" />
                                        <span className="text-[11px] text-t3 font-medium tracking-wide">nicht gewählt</span>
                                        <div className="h-px flex-1 bg-border" />
                                      </div>
                                    )}
                                    <SortableCourseItem
                                      course={course}
                                      index={i}
                                      onMoveUp={() => moveItem(i, -1)}
                                      onMoveDown={() => moveItem(i, 1)}
                                      canUp={i > 0}
                                      canDown={i < editOrder.length - 1}
                                    />
                                  </Fragment>
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>

                          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
                            <button
                              onClick={() => savePrefs(student)}
                              disabled={saving === student.nr}
                              className="flex items-center gap-1.5 text-xs bg-accent text-surface px-4 py-1.5 rounded-lg
                                font-semibold hover:bg-accent/90 disabled:opacity-40 transition-all duration-150"
                            >
                              {saving === student.nr ? (
                                <>
                                  <div className="w-3 h-3 rounded-full border border-current/30 border-t-current animate-spin-slow" />
                                  Speichern…
                                </>
                              ) : 'Speichern'}
                            </button>
                            <button
                              onClick={() => setEditingNr(null)}
                              className="text-xs text-t3 hover:text-t1 px-3 py-1.5 rounded-lg
                                hover:bg-border/40 transition-all duration-150"
                            >
                              Abbrechen
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
