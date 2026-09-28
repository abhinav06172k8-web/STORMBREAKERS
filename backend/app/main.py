from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.api.ai import router as ai_router
from app.ai.model_router import LocalModelUnavailable, model_router
from app.core.config import settings
from app.utils.logging import configure_logging


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    yield
    await model_router.close()


app = FastAPI(title="EDUPLUS API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api")


@app.exception_handler(LocalModelUnavailable)
async def local_model_unavailable(_, exc: LocalModelUnavailable) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc), "admin_action": "Check Ollama and installed model tags."})


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "eduplus-api"}
