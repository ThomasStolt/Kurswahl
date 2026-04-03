import type { Student, Course, CourseStats, UploadResult, ResultsData, ScoreReport } from './types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'API-Fehler')
  }
  return res.json()
}

export const api = {
  uploadCsv: (file: File): Promise<UploadResult> => {
    const form = new FormData()
    form.append('file', file)
    return request('/upload', { method: 'POST', body: form })
  },

  getStudents: (): Promise<Student[]> => request('/students'),

  updateStudent: (nr: number, data: { name?: string; preferences?: Record<string, number> }): Promise<Student> =>
    request(`/students/${nr}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  getCourses: (): Promise<CourseStats[]> => request('/courses'),

  updateCourse: (name: string, data: { offered?: boolean; semester?: number | null }): Promise<Course> =>
    request(`/courses/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  runFullOptimization: (): Promise<{ offered: Course[]; assignment_count: number }> =>
    request('/optimize', { method: 'POST' }),

  runAssignmentOptimization: (): Promise<{ assignment_count: number; score_report: ScoreReport }> =>
    request('/optimize/assignments', { method: 'POST' }),

  getResults: (): Promise<ResultsData> => request('/results'),

  exportCsv: () => window.open(`${BASE}/export/csv`, '_blank'),
  exportExcel: () => window.open(`${BASE}/export/excel`, '_blank'),
}
