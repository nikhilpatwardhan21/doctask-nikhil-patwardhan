import os
import sys
import asyncio
import logging
from dotenv import load_dotenv

load_dotenv()

if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

from typing import Optional, Any
from langgraph.checkpoint.memory import MemorySaver
try:
    from app.core.config import settings
except ModuleNotFoundError:
    from backend.app.core.config import settings

logger = logging.getLogger(__name__)

# Global instances
pool: Optional[Any] = None
checkpointer: Optional[Any] = None
fallback_memory_checkpointer = MemorySaver()


async def init_db_and_checkpointer():
    """
    Establishes an async connection pool to PostgreSQL with pgvector enabled
    and configures the LangGraph AsyncPostgresSaver checkpointer.
    Falls back to MemorySaver when USE_POSTGRES is false or connection fails.
    """
    global pool, checkpointer
    
    use_postgres = os.getenv("USE_POSTGRES", "false").lower() in ("true", "1")
    
    if use_postgres:
        try:
            from psycopg_pool import AsyncConnectionPool
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

            conn_info = settings.DATABASE_URL
            logger.info(f"Connecting to Postgres at {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}")

            pool = AsyncConnectionPool(
                conninfo=conn_info,
                max_size=20,
                open=False,
                kwargs={"autocommit": True}
            )
            await pool.open()
            
            async with pool.connection() as conn:
                await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")

            checkpointer = AsyncPostgresSaver(pool)
            await checkpointer.setup()
            logger.info("LangGraph AsyncPostgresSaver checkpointer successfully initialized.")
            return checkpointer
        except Exception as e:
            logger.error(f"CRITICAL: Failed to connect to PostgreSQL checkpointer ({e}).")
            if os.getenv("STRICT_POSTGRES", "false").lower() in ("true", "1"):
                raise RuntimeError(f"PostgreSQL Checkpointer Failure: {e}")
            logger.warning(f"Using in-memory checkpointer fallback.")
            checkpointer = fallback_memory_checkpointer
            return checkpointer

    else:
        logger.info("Postgres checkpointer bypassed (USE_POSTGRES=false). Using in-memory checkpointer.")
        checkpointer = fallback_memory_checkpointer
        return checkpointer


async def close_db_pool() -> None:
    """Closes the async database connection pool cleanly if active."""
    global pool
    if pool is not None:
        try:
            await pool.close()
            logger.info("Database connection pool closed.")
        except Exception:
            pass


def get_checkpointer():
    """Returns the configured checkpointer or fallback MemorySaver."""
    if checkpointer is not None:
        return checkpointer
    return fallback_memory_checkpointer
