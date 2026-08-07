# TASK: Agentic Document Processing System

## Core Architectural Principles
1. **Visible Stages (State Machine)**: The system moves through distinct, observable stages (`ingest_documents`, `examine_rules`, `await_human_review`, `commit_updates`). Every stage transition is recorded in execution state and logs.
2. **Resilience via Checkpointing**: Process restarts must preserve completed steps. Built with LangGraph `AsyncPostgresSaver` on PostgreSQL + pgvector.
3. **Human Gate (Approval Workflows)**: Granular item-by-item approval/rejection before final commit. Decisions are respected individually without discarding remaining findings.
4. **Machine Driver (MCP Protocol)**: Dual interface — accessible via React UI for human operators and via Model Context Protocol (MCP) server for external AI agents.
5. **No Bluffing & Traceability**: Findings and facts trace directly to source document excerpts.
