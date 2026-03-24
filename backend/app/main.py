from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import generate, download, history

app = FastAPI(
    title="MaxPyLang Studio",
    description="MaxPyLang Studio — generate Max for Live audio plugins from natural language prompts",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generate.router, prefix="/api")
app.include_router(download.router, prefix="/api")
app.include_router(history.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
