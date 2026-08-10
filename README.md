# Agentic Document Processing System

An enterprise-grade, resilient agentic document-processing system built with **Python (FastAPI)**, **LangGraph**, **PostgreSQL (`pgvector`)**, **Model Context Protocol (MCP)**, and a **React Human-in-the-Loop (HITL)** review dashboard.

---

## 🌟 Core System Behaviors & Architecture

| Behavior | Architecture & Implementation | Status |
| :--- | :--- | :---: |
| **1. Visible Stages** | 4-stage State Machine (`ingest_documents` → `examine_rules` → `await_human_review` → `commit_updates`). Every step transition is tracked in execution state. | ✅ |
| **2. Survives Being Stopped** | State checkpointing via LangGraph `AsyncPostgresSaver` backed by PostgreSQL + `pgvector`. A process killed mid-run resumes cleanly upon restart. | ✅ |
| **3. Human Holds Gate** | Human-in-the-Loop approval gate allowing item-by-item approval or rejection before committing updates. | ✅ |
| **4. Machine Driver (MCP)** | Dual interface: FastMCP server tools (`trigger_document_pipeline`, `list_pending_reviews`, `submit_approval_decision`) allow external AI agents to drive the workflow. | ✅ |
| **5. Grounded Citations** | Zero bluffing. Every extracted fact and rule finding traces directly to exact page citations (`Filename.pdf, Page N`). | ✅ |
| **6. One-Command Setup** | Full containerized database setup via `docker compose up -d`. | ✅ |
| **7. Proves Itself** | Complete `pytest` integration test suite running 100% offline without requiring paid model API keys. | ✅ |
| **8. Injection Defense** | Adversarial instructions inside source documents are treated as plain text data to report on, never executed as commands. | ✅ |
| **9. Concurrent Safety** | Thread isolation (`thread_id`) prevents state corruption across simultaneous pipeline executions. | ✅ |
| **10. Cost & Latency Analytics** | Real-time stage analytics recording duration (ms), token consumption, and estimated cost (USD) per stage. | ✅ |

---

## 🏗️ System Architecture

```
                                ┌───────────────────────────┐
                                │ React HITL Review UI      │
                                │ (Port 3000)               │
                                └─────────────┬─────────────┘
                                              │ HTTP REST
                                              ▼
┌──────────────────────────┐    ┌───────────────────────────┐
│ External Coding Agent    │───►│ FastAPI Backend Server    │
│ (Cursor / MCP Client)    │    │ (Port 8000 / main.py)     │
└──────────────────────────┘    └─────────────┬─────────────┘
          │ MCP Protocol                      │
          └───────────────────────────────────┼────────────────┐
                                              │                │
                                              ▼                ▼
                                 ┌──────────────────┐  ┌──────────────┐
                                 │ LangGraph Engine │  │ MCP Server   │
                                 └────────┬─────────┘  └──────────────┘
                                          │
                                          ▼
                                ┌───────────────────────────┐
                                │ Docker PostgreSQL 16      │
                                │ - AsyncPostgresSaver      │
                                │ - pgvector Extension      │
                                └───────────────────────────┘
```

---

## 🚀 Quickstart Guide

### Prerequisites
- **Python 3.10+**
- **Node.js 18+**
- **Docker Desktop** *(Optional - for PostgreSQL `pgvector` persistence)*

### 1. Database Setup (Docker Compose)
Start the PostgreSQL container with `pgvector` enabled:
```bash
docker compose up -d
```
*(PostgreSQL operates on `localhost:5433`, Database: `doctask_db`, User: `postgres`, Password: `postgres`).*

### 2. Backend Setup (FastAPI & MCP Server)
1. Create and activate Python virtual environment:
   ```bash
   python -m venv backend/venv
   # Windows PowerShell:
   .\backend\venv\Scripts\Activate.ps1
   ```
2. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start FastAPI application:
   ```bash
   python -m uvicorn backend.app.main:app --reload --port 8000
   ```
   - **Swagger Interactive API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **Health Endpoint**: [http://localhost:8000/](http://localhost:8000/)

### 3. Frontend Setup (React Review UI)
Open a second terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser to access the Human-in-the-Loop review dashboard!

---

## 🧪 Running Automated Integration Tests

Run the offline pytest suite verifying run recovery, thread concurrency, and prompt injection safety:

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_pipeline.py -v
```

### Test Suite Summary:
- `test_run_kill_and_resume`: Verifies state recovery from PostgreSQL checkpointer after simulated process interruption.
- `test_concurrent_pipeline_runs`: Verifies state isolation between simultaneous execution threads (`thread_alpha` vs `thread_beta`).
- `test_prompt_injection_defense`: Verifies malicious document instructions are treated as data to report on, not commands to execute.

---

## 🔌 API & MCP Tool Reference

### REST Endpoints
- `POST /api/v1/ingest`: Trigger document processing pipeline up to human gate.
- `GET /api/v1/pending-reviews`: Retrieve pending approval items for a thread.
- `POST /api/v1/approve`: Submit item-by-item approval/rejection decisions and resume graph execution.
- `GET /api/v1/runs/{thread_id}/status`: Query stage status, history, and cost metrics.
- `GET /api/v1/runs/{thread_id}/export`: Download grounded deliverable compliance register report (.md).
- `GET /api/v1/vector-search`: Perform direct cosine similarity search (`<=>`) over PostgreSQL `pgvector` store.

### Model Context Protocol (MCP) Tools
- `trigger_document_pipeline(thread_id, raw_documents_json)`: Programmatically starts graph execution.
- `list_pending_reviews(thread_id)`: Exposes items awaiting approval at the human gate.
- `submit_approval_decision(thread_id, decisions_json)`: Drives approval gate programmatically via MCP tool calls.

---

## 📐 Architectural Trade-offs & Design Choices

1. **LangGraph State Machine vs Fixed Scripts**:  
   *Trade-off*: Adds structural overhead, but guarantees deterministic state transitions, native `interrupt` gates, and multi-actor resumption.
2. **PostgreSQL (`pgvector`) vs SQLite**:  
   *Trade-off*: Requires containerized infrastructure (Docker), but provides production-ready vector similarity search (`<=>`) and scalable ACID state checkpointing.
3. **Dual REST + MCP Surface**:  
   *Trade-off*: Requires dual route maintenance, but enables both human operators (via React UI) and automated coding agents (via MCP) to drive the approval gate.
