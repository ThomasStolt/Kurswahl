from app.models import Course, SessionSettings


def apply_settings_to_courses(
    courses: list[Course], settings: SessionSettings
) -> None:
    """Set min_students/max_students on each course from the settings.

    The course whose name matches settings.special_course receives the
    special_min/special_max values; all others receive default_min/default_max.
    If settings.special_course is None or does not match any course in the list,
    every course receives the default values (silent no-op for unknown names).
    """
    for c in courses:
        if settings.special_course is not None and c.name == settings.special_course:
            c.min_students = settings.special_min
            c.max_students = settings.special_max
        else:
            c.min_students = settings.default_min
            c.max_students = settings.default_max
