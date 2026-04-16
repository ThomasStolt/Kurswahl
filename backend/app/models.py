from pydantic import BaseModel, Field, field_validator
from typing import Optional


class Student(BaseModel):
    nr: int
    name: str = ""
    preferences: dict[str, int]  # {Kursname: Priorität 0–8}
    valid: bool
    errors: list[str]


class Course(BaseModel):
    name: str
    min_students: int = 1
    max_students: int = 22
    offered: bool = False
    semester: Optional[int] = None  # 1 oder 2


class SessionSettings(BaseModel):
    hj1_count: int = 4
    hj2_count: int = 4
    default_max: int = 22
    default_min: int = 1
    special_course: Optional[str] = None
    special_max: int = 14
    special_min: int = 1

    @field_validator("special_course", mode="before")
    @classmethod
    def _empty_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v


class CourseStats(BaseModel):
    name: str
    min_students: int
    max_students: int
    offered: bool
    semester: Optional[int]
    demand: dict[int, int]   # {Priorität: Anzahl SuS}
    total_interested: int    # Anzahl SuS mit Priorität > 0


class Assignment(BaseModel):
    student_nr: int
    student_name: str
    course_hj1: str
    course_hj2: str
    score_hj1: int
    score_hj2: int


class StudentScore(BaseModel):
    student_nr: int
    student_name: str
    score_total: int        # 0-16
    avg_priority: float     # average achieved priority (1.0-8.0), 0.0 if unassigned


class CourseScore(BaseModel):
    name: str
    semester: int
    avg_priority: float     # average priority of assigned students
    student_count: int
    max_students: int
    fill_rate: float        # 0.0-1.0


class ScoreReport(BaseModel):
    score_achieved: int
    score_maximum: int
    score_percent: float
    score_label: str        # "Exzellent", "Gut", etc.
    score_description: str
    student_scores: list[StudentScore]
    course_scores: list[CourseScore]


class SessionData(BaseModel):
    students: list[Student] = []
    courses: list[Course] = []
    assignments: list[Assignment] = []
    settings: SessionSettings = Field(default_factory=SessionSettings)


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    preferences: Optional[dict[str, int]] = None


class CourseUpdate(BaseModel):
    offered: Optional[bool] = None
    semester: Optional[int] = None
