from app.models import SessionSettings, SessionData, Course
from app.settings_util import apply_settings_to_courses


def test_session_settings_defaults():
    s = SessionSettings()
    assert s.hj1_count == 4
    assert s.hj2_count == 4
    assert s.default_max == 22
    assert s.default_min == 1
    assert s.special_course is None
    assert s.special_max == 14
    assert s.special_min == 1


def test_session_data_has_default_settings():
    data = SessionData()
    assert isinstance(data.settings, SessionSettings)
    assert data.settings.hj1_count == 4


def test_session_data_accepts_json_without_settings_field():
    """Old session.json files (pre-feature) must still load."""
    data = SessionData.model_validate_json('{"students": [], "courses": [], "assignments": []}')
    assert data.settings.hj1_count == 4
    assert data.settings.default_max == 22


def test_session_settings_special_course_empty_string_normalized():
    """Empty string for special_course is normalized to None."""
    s = SessionSettings(special_course="")
    assert s.special_course is None


def _courses(names):
    return [Course(name=n) for n in names]


def test_apply_no_special_course_all_defaults():
    s = SessionSettings(default_min=3, default_max=20)
    cs = _courses(["A", "B", "C"])
    apply_settings_to_courses(cs, s)
    for c in cs:
        assert c.min_students == 3
        assert c.max_students == 20


def test_apply_named_special_course():
    s = SessionSettings(
        default_min=5, default_max=25,
        special_course="Kochen", special_min=2, special_max=14,
    )
    cs = _courses(["A", "Kochen", "B"])
    apply_settings_to_courses(cs, s)
    assert cs[0].min_students == 5 and cs[0].max_students == 25
    assert cs[1].min_students == 2 and cs[1].max_students == 14
    assert cs[2].min_students == 5 and cs[2].max_students == 25


def test_apply_special_course_not_in_list_silently_ignored():
    """If special_course names a course not in the list, no exception, all defaults."""
    s = SessionSettings(special_course="Kochen", special_max=14)
    cs = _courses(["A", "B"])
    apply_settings_to_courses(cs, s)  # must not raise
    for c in cs:
        assert c.max_students == s.default_max


def test_apply_is_idempotent():
    s = SessionSettings(special_course="Kochen", special_max=14, default_max=22)
    cs = _courses(["A", "Kochen"])
    apply_settings_to_courses(cs, s)
    apply_settings_to_courses(cs, s)
    assert cs[0].max_students == 22
    assert cs[1].max_students == 14
    assert cs[0].min_students == s.default_min
    assert cs[1].min_students == s.special_min
