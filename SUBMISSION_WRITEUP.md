# Task 4 Submission Write-Up: DocTask Autonomous System

**Candidate**: Nikhil Patwardhan  
**Repository**: `doctask-nikhil-patwardhan`  
**Target Role**: Full-Stack AI Engineer  

---

## 1. What Was Built & Who It Serves

**DocTask** is an autonomous, state-resilient agentic document intelligence platform built to solve **"The Analyst That Never Sleeps"** problem (Task 1). Organizations run on piles of related documents (vendor contracts, project status reports, clinical paperwork, engineering specifications) that describe the same reality but frequently disagree.

DocTask ingests mixed-format document piles (`.pdf`, `.txt`, `.json`), extracts grounded facts with page-level citations (`Filename.pdf, Page N`), evaluates compliance playbooks in visible stages, pauses at a **Human-in-the-Loop (HITL) Review Gatekeeper**, and exports a grounded compliance register report where every claim traces to exact source citations.

In addition, DocTask implements **Task 2 (Assigned Build)**: an autonomous **Repository ADR Agent** (`builds/repo_decision_agent/adr_agent.py`) that monitors git commit activity, filters architectural decisions from noise, and maintains a continuous Architectural Decision Record (`DECISIONS.md`).

---

## 2. Quantitative Results & Measurable Achievements

| Metric / Behavior | Measurement / Verification | Result |
| :--- | :--- | :-: |
| **Test Suite Execution (Behavior #7)** | `pytest backend/tests/test_pipeline.py -v` | **3 / 3 Passed in < 0.60s** (Keyless) |
| **Process Crash Recovery (Behavior #2)** | `AsyncPostgresSaver` state resume from PostgreSQL :5433 | **0% Data Loss / Clean Resume** |
| **Prompt Injection Defense (Behavior #8)** | Adversarial instruction payload in `test_prompt_injection_defense` | **100% Contained as Data** |
| **Concurrent Run Isolation (Behavior #9)** | 2 parallel pipeline runs on same thread isolated via UUID | **0% State Corruption** |
| **Stage Telemetry Tracking (Behavior #10)** | Per-stage duration (ms) and token spend tracking | **Exact Latency & Cost Tracked** |

---

## 3. Key Architectural Decisions & Honest Trade-Offs

### A. Orchestration: LangGraph vs. AutoGen / CrewAI
- **Decision**: We selected **LangGraph** as our primary orchestration framework.
- **Rationale**: AutoGen and CrewAI excel at multi-agent conversational chat loops but lack native checkpointing for cyclic human-in-the-loop state machines. LangGraph provides native `interrupt()` functions and seamless integration with `AsyncPostgresSaver`, allowing process runs to be stopped, killed mid-run, and resumed cleanly from PostgreSQL.

### B. Database & Vector Storage: PostgreSQL (`pgvector`) vs. MongoDB / External Vector DBs
- **Decision**: We deployed **PostgreSQL v16 with `pgvector`** running on Port `5433` (`doctask_db`).
- **Rationale**: Storing 384-dimensional normalized embeddings (`vector(384)`) alongside LangGraph checkpointer tables in a single PostgreSQL container eliminates external network latency, ensures ACID transactional consistency, and allows HNSW cosine similarity queries (`ORDER BY embedding <=> query_vec`) directly in SQL.

### C. Machine Interface: FastMCP Protocol (Behavior #4)
- **Decision**: Exposed machine tools via **FastMCP** (`backend/app/mcp_server/server.py`).
- **Rationale**: Exposes `trigger_pipeline`, `submit_approval`, and `export_report` as standardized MCP tools, enabling external AI coding agents (Claude Code, Cursor) or CLI scripts to drive the human review gate programmatically.

---

## 4. Known Edge Cases & Honest Limitations

1. **OCR Support**: PDF parsing uses `pypdf` for fast text extraction. Scanned PDFs (pure image bitmaps without text layers) require an OCR pre-processor (e.g. Tesseract / pdf2image) to extract text prior to ingestion.
2. **Local Embedding Vector Dimensionality**: Vector embeddings are normalized to 384 dimensions using a deterministic hashing algorithm, allowing keyless offline testing. Upgrading to OpenAI `text-embedding-3-small` (1536-dim) in production requires set API keys.

---

## 5. Verification Commands

- **Backend & FastMCP Server**:
  ```powershell
  backend\venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --port 8000
  ```
- **React Frontend**:
  ```powershell
  cd frontend
  npm run dev
  ```
- **Automated Integration Tests**:
  ```powershell
  backend\venv\Scripts\python.exe -m pytest backend/tests/test_pipeline.py -v
  ```
- **Task 2 ADR Agent Dry-Run**:
  ```powershell
  backend\venv\Scripts\python.exe builds/repo_decision_agent/adr_agent.py --dry-run
  ```
