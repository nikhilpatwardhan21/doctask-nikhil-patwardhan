import sys
import asyncio
import logging
from contextlib import asynccontextmanager

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core.config import settings
from backend.app.core.db import init_db_and_checkpointer, close_db_pool
from backend.app.api.routes import router as api_router
from backend.app.mcp_server.server import mcp_server

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application Lifespan Manager:
    Initializes PostgreSQL connection pool and LangGraph AsyncPostgresSaver checkpointer on startup,
    and cleans up pool resources on shutdown.
    """
    logger.info("Initializing application resources...")
    await init_db_and_checkpointer()
    logger.info("Database and LangGraph AsyncPostgresSaver checkpointer ready.")
    yield
    logger.info("Shutting down application resources...")
    await close_db_pool()


# Create FastAPI instance
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Agentic Document-Processing System with LangGraph state checkpointing and MCP Machine Interface.",
    lifespan=lifespan
)

# Enable CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register REST API routes for React Frontend
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root_health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "mcp_enabled": True,
        "endpoints": {
            "ingest": "/api/v1/ingest",
            "pending_reviews": "/api/v1/pending-reviews",
            "approve": "/api/v1/approve",
            "status": "/api/v1/runs/{thread_id}/status"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
