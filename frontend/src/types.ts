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

export interface StudentScore {
  student_nr: number
  student_name: string
  score_total: number
  avg_priority: number
}

export interface CourseScore {
  name: string
  semester: number
  avg_priority: number
  student_count: number
  max_students: number
  fill_rate: number
}

export interface ScoreReport {
  score_achieved: number
  score_maximum: number
  score_percent: number
  score_label: string
  score_description: string
  student_scores: StudentScore[]
  course_scores: CourseScore[]
}

export interface ResultsData {
  by_course: {
    name: string
    semester: number | null
    students: { nr: number; name: string; score: number; semester: number }[]
    avg_score: number
    count: number
  }[]
  by_student: Assignment[]
  score_report: ScoreReport
}

export interface SessionSettings {
  hj1_count: number
  hj2_count: number
  default_max: number
  default_min: number
  special_course: string | null
  special_max: number
  special_min: number
}

export interface SettingsResponse {
  settings: SessionSettings
  courses: string[]
  assignments_exist: boolean
}

export interface SettingsUpdateResponse {
  settings: SessionSettings
  assignments_cleared: boolean
}
