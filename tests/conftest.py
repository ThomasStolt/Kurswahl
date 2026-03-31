import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


VALID_CSV = """Nr.;Body Percussion;Debating;Kochen;Medien;Podcast;Psychologie;Rhetorik;Schach;Stricken;Theater;Wirtschaft;Häkeln;History Hunters;Improvisation;Just Relax;Move&Groove;Musik am Computer;Girls' Empowerment
5;0;6;2;0;0;1;7;8;0;0;4;0;3;0;0;0;5;0
6;0;6;1;0;8;7;4;0;0;5;0;0;0;2;0;0;3;0
"""

INVALID_CSV_DUPLICATE = """Nr.;Body Percussion;Debating;Kochen;Medien;Podcast;Psychologie;Rhetorik;Schach;Stricken;Theater;Wirtschaft;Häkeln;History Hunters;Improvisation;Just Relax;Move&Groove;Musik am Computer;Girls' Empowerment
8;8;2;7;1;4;2;3;5;0;0;1;6;3;4;5;8;6;0
"""

EMPTY_ROW_CSV = """Nr.;Body Percussion;Debating;Kochen;Medien;Podcast;Psychologie;Rhetorik;Schach;Stricken;Theater;Wirtschaft;Häkeln;History Hunters;Improvisation;Just Relax;Move&Groove;Musik am Computer;Girls' Empowerment
2;;;;;;;;;;;;;;;;;;
"""
