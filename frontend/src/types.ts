export interface Student {
  nr: number
  name: string
  preferences: Record<string, number>
  valid: boolean
  errors: string[]
}

export interface Course {
  name: string
  min_students: number
  max_students: number
  offered: boolean
  semester: number | null
}

export interface CourseStats extends Course {
  demand: Record<number, number>
  total_interested: number
}

export interface Assignment {
  student_nr: number
  student_name: string
  course_hj1: string
  course_hj2: string
  score_hj1: number
  score_hj2: number
}

export interface UploadResult {
  total: number
  valid_count: number
  invalid_count: number
  course_names: string[]
}

export interface ResultsData {
  by_course: {
    name: string
    semester: number
    students: { nr: number; name: string; score: number; semester: number }[]
    avg_score: number
    count: number
  }[]
  by_student: Assignment[]
}
