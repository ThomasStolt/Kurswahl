from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import upload, students, courses

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


@app.get("/api/health")
def health():
    return {"status": "ok"}
