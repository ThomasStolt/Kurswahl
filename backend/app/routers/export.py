from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from app import session, exporter

router = APIRouter(prefix="/api")


@router.get("/export/csv")
def export_csv():
    data = session.load()
    if not data.assignments:
        raise HTTPException(status_code=404, detail="Keine Ergebnisse vorhanden")
    content = exporter.to_csv(data.assignments, data.courses)
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=kurszuteilung.csv"},
    )


@router.get("/export/excel")
def export_excel():
    data = session.load()
    if not data.assignments:
        raise HTTPException(status_code=404, detail="Keine Ergebnisse vorhanden")
    content = exporter.to_excel(data.assignments, data.courses)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=kurszuteilung.xlsx"},
    )
