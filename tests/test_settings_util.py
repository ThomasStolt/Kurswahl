from app.models import SessionSettings, SessionData


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
