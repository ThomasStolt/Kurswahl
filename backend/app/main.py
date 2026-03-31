from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import upload

app = FastAPI(title="Kurswahl API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
