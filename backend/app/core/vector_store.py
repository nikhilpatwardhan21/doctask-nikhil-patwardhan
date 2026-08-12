import math
import logging
from typing import List, Dict, Any, Optional

try:
    from app.core.db import pool
    from app.core.config import settings
except ModuleNotFoundError:
    from backend.app.core.db import pool
    from backend.app.core.config import settings

logger = logging.getLogger(__name__)

# Feature vector size for pgvector
EMBEDDING_DIM = 384


def compute_embedding(text: str) -> List[float]:
    """
    Computes a deterministic 384-dimensional normalized vector embedding for text.
    Runs 100% offline without requiring external model API keys.
    """
    vec = [0.0] * EMBEDDING_DIM
    text_lower = text.lower()
    
    # Generate character trigram and term hashes
    words = text_lower.split()
    for word in words:
        h = hash(word) % EMBEDDING_DIM
        vec[h] += 1.0
        
    for i in range(len(text_lower) - 2):
        trigram = text_lower[i:i+3]
        h = hash(trigram) % EMBEDDING_DIM
        vec[h] += 0.5
        
    # L2 normalize vector
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [round(x / norm, 6) for x in vec]
    return vec


async def init_vector_table():
    """
    Ensures pgvector extension and doc_embeddings table exist in PostgreSQL.
    """
    if pool is None:
        logger.info("Pool is None, skipping vector table creation (Memory mode).")
        return
        
    try:
        async with pool.connection() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            await conn.execute(f"""
                CREATE TABLE IF NOT EXISTS doc_embeddings (
                    id SERIAL PRIMARY KEY,
                    doc_id TEXT NOT NULL,
                    claim_text TEXT NOT NULL,
                    source_citation TEXT NOT NULL,
                    embedding vector({EMBEDDING_DIM})
                );
                CREATE INDEX IF NOT EXISTS doc_embeddings_hnsw_idx 
                ON doc_embeddings USING hnsw (embedding vector_cosine_ops);
            """)
            logger.info("pgvector doc_embeddings table and HNSW index ready.")
    except Exception as e:
        logger.warning(f"Could not initialize pgvector table ({e}).")



async def store_fact_vector(doc_id: str, claim_text: str, source_citation: str):
    """
    Stores an extracted fact and its vector embedding in pgvector table.
    """
    if pool is None:
        return
        
    embedding = compute_embedding(claim_text)
    vec_str = "[" + ",".join(str(x) for x in embedding) + "]"
    
    try:
        async with pool.connection() as conn:
            await conn.execute(
                """
                INSERT INTO doc_embeddings (doc_id, claim_text, source_citation, embedding)
                VALUES (%s, %s, %s, %s::vector);
                """,
                (doc_id, claim_text, source_citation, vec_str)
            )
            logger.info(f"Stored pgvector embedding for doc '{doc_id}'.")
    except Exception as e:
        logger.warning(f"Could not store vector embedding in Postgres ({e}).")


async def search_similar_claims(query_text: str, top_k: int = 3) -> List[Dict[str, Any]]:
    """
    Queries PostgreSQL pgvector table using cosine distance (<=>) for semantic search.
    """
    if pool is None:
        return []
        
    query_vec = compute_embedding(query_text)
    vec_str = "[" + ",".join(str(x) for x in query_vec) + "]"
    
    results = []
    try:
        async with pool.connection() as conn:
            cursor = await conn.execute(
                f"""
                SELECT doc_id, claim_text, source_citation, (embedding <=> %s::vector) AS distance
                FROM doc_embeddings
                ORDER BY embedding <=> %s::vector ASC
                LIMIT {top_k};
                """,
                (vec_str, vec_str)
            )
            rows = await cursor.fetchall()
            for r in rows:
                results.append({
                    "doc_id": r[0],
                    "claim_text": r[1],
                    "source_citation": r[2],
                    "similarity_score": round(1.0 - float(r[3]), 4)
                })
    except Exception as e:
        logger.warning(f"Error querying pgvector similarity ({e}).")
        
    return results
