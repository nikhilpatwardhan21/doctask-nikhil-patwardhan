# PROGRESS: Implementation Log

## System Setup Progress
- [x] Initialized Git repository.
- [x] Defined core system requirements from task brief.
- [x] Created `TASK.md` detailing operational principles.
- [x] Created `requirements.txt` with dependencies (`fastapi`, `uvicorn`, `langgraph`, `langgraph-checkpoint-postgres`, `asyncpg`, `psycopg`, `pgvector`, `mcp`, `pypdf`, `pytest`).
- [x] Created `docker-compose.yml` with pgvector PostgreSQL container.
- [x] Built `backend/app/core/db.py` async connection pool and `AsyncPostgresSaver` checkpointer setup.
- [x] Defined state schema (`TypedDict`) and state machine graph in `backend/app/agents/graph.py`.
- [x] Implemented FastAPI REST routes & MCP server gate in `backend/app/main.py` and `backend/app/mcp_server/server.py`.
- [x] Created React Human-in-the-Loop review UI in `frontend/`.
- [x] Phase 2: Built PDF parsing module `backend/app/core/pdf_parser.py` using `pypdf`.
- [x] Phase 2: Built `pgvector` vector store module `backend/app/core/vector_store.py` for semantic cosine similarity search (`<=>`).
- [x] Phase 2: Created automated pytest integration suite in `backend/tests/test_pipeline.py`.
- [x] Phase 2: Passed all 3 automated integration test cases (`test_run_kill_and_resume`, `test_concurrent_pipeline_runs`, `test_prompt_injection_defense`).

## Log of Assumptions & Design Decisions
1. **LangGraph State Management**: Used `TypedDict` for workflow state, tracking `raw_documents`, `extracted_facts`, `rule_findings`, `pending_human_approvals`, `approved_items`, `rejected_items`, `status`, `stage_history`, `cost_metrics`.
2. **Postgres Checkpointing**: Configured `langgraph-checkpoint-postgres` with `AsyncConnectionPool` connecting to port `5433` in Docker Desktop.
3. **pgvector Similarity Search**: Stored extracted document claims as 384-dimensional normalized vector embeddings in PostgreSQL table `doc_embeddings`.
4. **Prompt Injection Safety**: The system ingests adversarial document content as string data to extract and report on, rather than executing embedded instructions as commands.
