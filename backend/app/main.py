from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import upload, students, courses, optimize, results, export

app = FastAPI(title="Kurswahl API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(students.router)
app.include_router(courses.router)
app.include_router(optimize.router)
app.include_router(results.router)
app.include_router(export.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
