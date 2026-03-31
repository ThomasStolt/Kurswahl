import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../api'
import type { CourseStats } from '../types'

function CourseCard({ course }: { course: CourseStats }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: course.name })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm cursor-grab active:cursor-grabbing select-none"
    >
      <span className="font-medium text-gray-800 text-sm">{course.name}</span>
      <span className="ml-2 text-xs text-gray-400">{course.total_interested} SuS</span>
    </div>
  )
}

const COLUMN_STYLES = {
  blue:   { wrap: 'bg-blue-50 border-blue-200',     heading: 'text-blue-700' },
  purple: { wrap: 'bg-purple-50 border-purple-200', heading: 'text-purple-700' },
  gray:   { wrap: 'bg-gray-100 border-gray-200',    heading: 'text-gray-600' },
} as const

function Column({
  title, courses, color
}: { title: string; courses: CourseStats[]; color: keyof typeof COLUMN_STYLES }) {
  const { wrap, heading } = COLUMN_STYLES[color]
  return (
    <div className={`${wrap} border rounded-xl p-4 min-h-48`}>
      <h3 className={`font-semibold ${heading} mb-3`}>{title}</h3>
      <SortableContext items={courses.map(c => c.name)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {courses.map(c => <CourseCard key={c.name} course={c} />)}
        </div>
      </SortableContext>
    </div>
  )
}

export default function OptimizePage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<CourseStats[]>([])
  const [loading, setLoading] = useState(true)
  const [optimizing, setOptimizing] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [optimized, setOptimized] = useState(false)

  useEffect(() => {
    api.getCourses().then(setCourses).finally(() => setLoading(false))
  }, [])

  const hj1 = courses.filter(c => c.offered && c.semester === 1)
  const hj2 = courses.filter(c => c.offered && c.semester === 2)
  const notOffered = courses.filter(c => !c.offered)

  const runOptimization = async () => {
    setOptimizing(true)
    try {
      await api.runFullOptimization()
      const updated = await api.getCourses()
      setCourses(updated)
      setOptimized(true)
    } finally {
      setOptimizing(false)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedName = active.id as string
    const targetName = over.id as string

    const dragged = courses.find(c => c.name === draggedName)
    const target = courses.find(c => c.name === targetName)
    if (!dragged || !target) return

    // Swap semester assignments (optimistic update)
    const previousCourses = courses
    const newCourses = courses.map(c => {
      if (c.name === draggedName) return { ...c, semester: target.semester, offered: target.offered }
      if (c.name === targetName) return { ...c, semester: dragged.semester, offered: dragged.offered }
      return c
    })
    setCourses(newCourses as CourseStats[])

    // Persist changes to backend
    setReassigning(true)
    try {
      await api.updateCourse(draggedName, { offered: target.offered ?? false, semester: target.semester ?? undefined })
      await api.updateCourse(targetName, { offered: dragged.offered, semester: dragged.semester ?? undefined })
      await api.runAssignmentOptimization()
    } catch {
      // Roll back optimistic update on failure
      setCourses(previousCourses)
    } finally {
      setReassigning(false)
    }
  }

  if (loading) return <div className="text-gray-500 mt-8">Lade Kurse…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Optimierung & Kursauswahl</h1>
        {optimized && (
          <button
            onClick={() => navigate('/results')}
            className="bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700"
          >
            Ergebnisse ansehen →
          </button>
        )}
      </div>

      {!optimized ? (
        <div className="text-center py-16">
          <p className="text-gray-600 mb-6">Der Algorithmus wählt automatisch die 8 besten Kurse aus und teilt die Schüler optimal zu.</p>
          <button
            onClick={runOptimization}
            disabled={optimizing}
            className="bg-blue-600 text-white px-8 py-3 rounded-xl text-lg font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            {optimizing ? '⏳ Optimierung läuft…' : '▶ Optimierung starten'}
          </button>
        </div>
      ) : (
        <div>
          {reassigning && (
            <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">
              ⏳ Zuteilung wird neu berechnet…
            </div>
          )}
          <p className="text-sm text-gray-500 mb-4">
            Kurse per Drag & Drop zwischen den Halbjahren oder in „Nicht angeboten" verschieben.
          </p>
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-3 gap-4">
              <Column title="Halbjahr 1" courses={hj1} color="blue" />
              <Column title="Halbjahr 2" courses={hj2} color="purple" />
              <Column title="Nicht angeboten" courses={notOffered} color="gray" />
            </div>
          </DndContext>
        </div>
      )}
    </div>
  )
}
