# Task 4 System Architecture Diagram: DocTask

This document presents the full-stack system architecture of the **DocTask Autonomous Platform** (Task 1 & Task 2).

---

## 🏗️ End-to-End System Architecture

```mermaid
flowchart TB
    subgraph ClientLayer ["Client & Interface Layer"]
        UI["React 18 Control Tower Deck\n(Port 3000 / Vite / Space Grotesk)"]
        MCP_Client["MCP Client / External AI Agent\n(Claude Code / Cursor)"]
        CLI["CLI Command / Automated Runner"]
    end

    subgraph APILayer ["FastAPI REST & FastMCP Protocol Layer"]
        API["FastAPI App\n(Port 8000 / Uvicorn)"]
        MCP_Server["FastMCP Server\n(mcp_server/server.py)"]
        Auth["X-API-Key Security Middleware"]
    end

    subgraph AgentLayer ["LangGraph State Machine Engine (Task 1)"]
        Ingest["Stage 1: ingest_documents\n(pypdf / Base64 / Fact Extraction)"]
        Examine["Stage 2: examine_rules\n(Dynamic Playbooks & Diff Generation)"]
        Gate["Stage 3: await_human_review\n[Native interrupt() HITL Gate]"]
        Commit["Stage 4: commit_updates\n(Grounded Deliverable Register)"]

        Ingest --> Examine --> Gate --> Commit
    end

    subgraph DBLayer ["PostgreSQL Database Infrastructure (Port 5433)"]
        Checkpointer[("AsyncPostgresSaver\nCheckpointer State Persistence\n(Behavior #2: Crash Resilience)")]
        VectorStore[("pgvector Extension\n384-Dim HNSW Index\n(doc_embeddings table)")]
    end

    subgraph Task2Layer ["Repository ADR Agent (Task 2)"]
        GitWatcher["Git Commit / Merged PR Monitor\n(builds/repo_decision_agent/adr_agent.py)"]
        ADR_Doc[("DECISIONS.md\nContinuous Decision Record")]
        GitWatcher --> ADR_Doc
    end

    %% Interactions
    UI -->|HTTP / X-API-Key| Auth
    MCP_Client -->|MCP Tools Protocol| MCP_Server
    CLI -->|Pytest / Direct Calls| API

    Auth --> API
    MCP_Server --> API

    API -->|astream / aget_state| Ingest
    Gate -->|Human Approve / Reject| Commit

    AgentLayer <-->|State Checkpoints| Checkpointer
    AgentLayer <-->|Vector Cosine Search <=>| VectorStore
```

---

## 📌 Architectural Layer Breakdown

### 1. Client Layer (`frontend/`)
- Built with React 18, Vite, and custom CSS design system.
- Displays 4 visible workflow stages, document ingestion dock, 2-option human review cards (`✖ Reject` / `✓ Approve`), top sticky bulk controls, and stage telemetry analytics.

### 2. API & MCP Layer (`backend/app/api/` & `backend/app/mcp_server/`)
- **FastAPI REST API**: Endpoints for `/ingest`, `/pending-reviews`, `/approve`, `/runs/{thread_id}/status`, `/runs/{thread_id}/export`, `/vector-search`.
- **FastMCP Protocol**: Standardized machine interface exposing `trigger_pipeline`, `submit_approval`, and `export_report` for programmatic driving.

### 3. LangGraph Orchestration Layer (`backend/app/agents/graph.py`)
- Stateful cyclic workflow graph with 4 distinct nodes.
- Native `interrupt()` gate pauses execution until human operators commit item decisions.

### 4. PostgreSQL Storage Infrastructure (`docker-compose.yml`)
- PostgreSQL v16 on Port `5433` with `pgvector` extension.
- **`AsyncPostgresSaver`**: Survives process kills and restarts cleanly.
- **`doc_embeddings`**: HNSW index for fast 384-dimensional cosine distance searches.

### 5. Task 2 Repository ADR Agent (`builds/repo_decision_agent/`)
- Watches git commits, filters architectural decisions, updates status lines (accepted/superseded), and writes continuous decision records to `DECISIONS.md`.
