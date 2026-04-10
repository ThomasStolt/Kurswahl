import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DndContext, DragEndEvent, closestCenter, useDroppable } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../api'
import type { CourseStats, ScoreReport } from '../types'

const COL_HJ1 = 'col-hj1'
const COL_HJ2 = 'col-hj2'
const COL_NONE = 'col-none'

function CourseCard({ course }: { course: CourseStats }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: course.name })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-surface border rounded-xl px-3.5 py-2.5 cursor-grab active:cursor-grabbing select-none
        transition-all duration-150
        ${isDragging
          ? 'border-accent/40 opacity-40 scale-95 shadow-glow'
          : 'border-border hover:border-accent/30 hover:shadow-card-md'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-t1 text-sm truncate">{course.name}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-t3 bg-elevated px-2 py-0.5 rounded-full font-medium">
            {course.total_interested}
          </span>
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-t3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 5h12M2 8h12M2 11h12" />
          </svg>
        </div>
      </div>
    </div>
  )
}

const COLUMNS = [
  {
    title:  'Halbjahr 1',
    border: 'border-blue-500/20 dark:border-blue-500/15',
    header: 'bg-blue-500/[0.06]',
    badge:  'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot:    'bg-blue-500',
  },
  {
    title:  'Halbjahr 2',
    border: 'border-violet-500/20 dark:border-violet-500/15',
    header: 'bg-violet-500/[0.06]',
    badge:  'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    dot:    'bg-violet-500',
  },
  {
    title:  'Nicht angeboten',
    border: 'border-border',
    header: 'bg-elevated',
    badge:  'bg-elevated text-t2',
    dot:    'bg-t3',
  },
] as const

function Column({ col, columnId, courses }: { col: typeof COLUMNS[number]; columnId: string; courses: CourseStats[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId })
  return (
    <div className={`bg-surface border rounded-2xl overflow-hidden shadow-card ${col.border}`}>
      <div className={`${col.header} px-4 pt-4 pb-3 border-b border-border`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${col.dot}`} />
            <h3 className="font-display font-semibold text-t1 text-sm">{col.title}</h3>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${col.badge}`}>
            {courses.length}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`p-3 min-h-28 transition-colors duration-150 ${isOver ? 'bg-accent/[0.06]' : ''}`}
      >
        <SortableContext items={courses.map(c => c.name)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 min-h-14">
            {courses.map(c => <CourseCard key={c.name} course={c} />)}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

function scoreLabelColor(label: string) {
  switch (label) {
    case 'Exzellent': return 'text-ok'
    case 'Gut': return 'text-yellow-600 dark:text-yellow-400'
    case 'Akzeptabel': return 'text-orange-600 dark:text-orange-400'
    default: return 'text-err'
  }
}

function scoreLabelBg(label: string) {
  switch (label) {
    case 'Exzellent': return 'bg-ok/10 border-ok/20'
    case 'Gut': return 'bg-yellow-500/10 border-yellow-500/20'
    case 'Akzeptabel': return 'bg-orange-500/10 border-orange-500/20'
    default: return 'bg-err/10 border-err/20'
  }
}

export default function OptimizePage() {
  const navigate = useNavigate()
  const [courses, setCourses]     = useState<CourseStats[]>([])
  const [loading, setLoading]     = useState(true)
  const [optimizing, setOptimizing] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [optimized, setOptimized] = useState(false)
  const [scoreReport, setScoreReport] = useState<ScoreReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getCourses().then(setCourses).finally(() => setLoading(false))
  }, [])

  const hj1        = courses.filter(c =>  c.offered && c.semester === 1)
  const hj2        = courses.filter(c =>  c.offered && c.semester === 2)
  const notOffered = courses.filter(c => !c.offered)

  const runOptimization = async () => {
    setOptimizing(true)
    setError(null)
    try {
      await api.runFullOptimization()
      const updated = await api.getCourses()
      setCourses(updated)
      setOptimized(true)
      try {
        const results = await api.getResults()
        setScoreReport(results.score_report)
      } catch { /* score display is optional here */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setOptimizing(false)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedName = active.id as string
    const overId = over.id as string
    const dragged = courses.find(c => c.name === draggedName)
    if (!dragged) return

    // If dropped on a column (not a card), redirect to the first card in that column.
    // Swap semantics preserve the 4/4/rest distribution the optimizer expects.
    let targetName = overId
    if (overId === COL_HJ1 || overId === COL_HJ2 || overId === COL_NONE) {
      const colCourses =
        overId === COL_HJ1 ? hj1 :
        overId === COL_HJ2 ? hj2 :
        notOffered
      if (colCourses.length === 0) return
      if (colCourses.some(c => c.name === draggedName)) return
      targetName = colCourses[0].name
    }

    const target = courses.find(c => c.name === targetName)
    if (!target || target.name === dragged.name) return

    const previousCourses = courses
    const previousScore = scoreReport
    const newCourses = courses.map(c => {
      if (c.name === draggedName) return { ...c, semester: target.semester,  offered: target.offered }
      if (c.name === targetName)  return { ...c, semester: dragged.semester, offered: dragged.offered }
      return c
    })
    setCourses(newCourses as CourseStats[])

    setReassigning(true)
    try {
      await api.updateCourse(draggedName, { offered: target.offered  ?? false, semester: target.semester  ?? undefined })
      await api.updateCourse(targetName,  { offered: dragged.offered,          semester: dragged.semester ?? undefined })
      const result = await api.runAssignmentOptimization()
      setScoreReport(result.score_report)
    } catch {
      setCourses(previousCourses)
      setScoreReport(previousScore)
    } finally {
      setReassigning(false)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-3 mt-16 justify-center text-t2">
      <div className="w-5 h-5 rounded-full border-2 border-border border-t-accent animate-spin-slow" />
      <span className="text-sm">Lade Kurse…</span>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6 stagger-1">
        <div>
          <h1 className="font-display text-3xl font-bold text-t1 mb-1">Optimierung</h1>
          <p className="text-sm text-t2">ILP-Algorithmus für maximale Schülerzufriedenheit</p>
        </div>
        {optimized && (
          <button
            onClick={() => navigate('/results')}
            className="flex items-center gap-2 bg-ok text-surface px-5 py-2.5 rounded-xl font-semibold text-sm
              hover:bg-ok/90 transition-all duration-200 hover:shadow-glow active:scale-[0.97]"
          >
            Ergebnisse ansehen
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-err/[0.05] border border-err/20 rounded-xl flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-err/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-err text-xs font-bold">!</span>
          </div>
          <p className="text-err text-sm leading-relaxed">{error}</p>
        </div>
      )}

      {!optimized ? (
        <div className="flex flex-col items-center justify-center py-20 stagger-2">
          <div className="w-20 h-20 rounded-3xl bg-accent/[0.08] border border-accent/15 flex items-center justify-center mb-8">
            <svg viewBox="0 0 32 32" className="w-10 h-10 text-accent" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="16" cy="16" r="12" />
              <path d="M16 8v8l5 3" />
              <path d="M8 4l2 3M24 4l-2 3M4 24l3-2M28 24l-3-2" />
            </svg>
          </div>
          <p className="text-t2 text-center max-w-sm mb-8 leading-relaxed text-sm">
            Der Algorithmus wählt automatisch die{' '}
            <strong className="text-t1 font-semibold">8 besten Kurse</strong>{' '}
            aus und teilt die Schüler optimal zu — maximale Zufriedenheit durch{' '}
            <em className="not-italic text-accent">Integer Linear Programming</em>.
          </p>
          <button
            onClick={runOptimization}
            disabled={optimizing}
            className="flex items-center gap-3 bg-accent text-surface px-10 py-4 rounded-2xl font-bold
              hover:bg-accent/90 disabled:opacity-50 transition-all duration-200
              hover:shadow-glow active:scale-[0.97] text-sm tracking-wide"
          >
            {optimizing ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin-slow" />
                Optimierung läuft…
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
                  <polygon points="5,2 14,8 5,14" />
                </svg>
                Optimierung starten
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="stagger-2">
          {/* Live Score Display */}
          {scoreReport && (
            <div className={`mb-4 p-4 rounded-xl border transition-all duration-300 ${scoreLabelBg(scoreReport.score_label)}`}>
              <div className="flex items-center gap-3">
                <span className={`font-display text-2xl font-bold tabular-nums ${scoreLabelColor(scoreReport.score_label)}`}>
                  {scoreReport.score_percent.toFixed(1)}%
                </span>
                <span className={`text-sm font-medium ${scoreLabelColor(scoreReport.score_label)}`}>
                  {scoreReport.score_label}
                </span>
                <span className="text-xs text-t3">— {scoreReport.score_description}</span>
              </div>
            </div>
          )}
          {reassigning && (
            <div className="mb-4 px-4 py-3 bg-accent/[0.06] border border-accent/15 rounded-xl flex items-center gap-3">
              <div className="w-4 h-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin-slow flex-shrink-0" />
              <span className="text-sm text-accent font-medium">Zuteilung wird neu berechnet…</span>
            </div>
          )}
          <p className="text-xs text-t3 mb-4">
            Kurse per Drag & Drop zwischen den Halbjahren oder in „Nicht angeboten" verschieben.
          </p>
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-3 gap-4">
              <Column col={COLUMNS[0]} columnId={COL_HJ1}  courses={hj1} />
              <Column col={COLUMNS[1]} columnId={COL_HJ2}  courses={hj2} />
              <Column col={COLUMNS[2]} columnId={COL_NONE} courses={notOffered} />
            </div>
          </DndContext>
        </div>
      )}
    </div>
  )
}
