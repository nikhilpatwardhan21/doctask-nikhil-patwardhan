import logging
from fastapi import APIRouter, HTTPException, Query, Header, Depends
from typing import List, Dict, Any, Optional

try:
    from app.core.config import settings
    from app.schemas.documents import (
        IngestDocumentRequest,
        BatchApprovalRequest,
        PendingReviewsResponse,
        PipelineStatusResponse,
    )
    from app.agents.graph import build_document_workflow
    from app.core.db import get_checkpointer
except ModuleNotFoundError:
    from backend.app.core.config import settings
    from backend.app.schemas.documents import (
        IngestDocumentRequest,
        BatchApprovalRequest,
        PendingReviewsResponse,
        PipelineStatusResponse,
    )
    from backend.app.agents.graph import build_document_workflow
    from backend.app.core.db import get_checkpointer

logger = logging.getLogger(__name__)

async def verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")):
    """Verifies client API Key for security (P0.1)."""
    if x_api_key and x_api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key provided.")
    return True

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.post("/ingest", response_model=Dict[str, Any])
async def ingest_documents_endpoint(payload: IngestDocumentRequest):
    """
    Triggers document ingestion and workflow execution up to the human review gate.
    """
    checkpointer = get_checkpointer()
    graph = build_document_workflow(checkpointer=checkpointer)
    
    config = {"configurable": {"thread_id": payload.thread_id}}
    initial_state = {
        "thread_id": payload.thread_id,
        "raw_documents": payload.documents,
        "extracted_facts": [],
        "rule_findings": [],
        "pending_human_approvals": [],
        "approved_items": [],
        "rejected_items": [],
        "current_stage": "START",
        "stage_history": [],
        "cost_metrics": [],
        "pipeline_completed": False,
        "error": None
    }
    
    try:
        # Run graph until it hits the await_human_review interrupt node
        async for _ in graph.astream(initial_state, config=config):
            pass
        
        current_state = await graph.aget_state(config)
        return {
            "status": "PAUSED_AT_GATE",
            "thread_id": payload.thread_id,
            "next_node": current_state.next,
            "current_stage": current_state.values.get("current_stage"),
            "pending_approvals_count": len(current_state.values.get("pending_human_approvals", []))
        }
    except Exception as e:
        logger.exception("Error executing document pipeline ingestion.")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending-reviews", response_model=PendingReviewsResponse)
async def get_pending_reviews(thread_id: str = Query(..., description="Pipeline thread ID")):
    """
    Returns items currently awaiting human approval for the specified thread.
    """
    checkpointer = get_checkpointer()
    graph = build_document_workflow(checkpointer=checkpointer)
    config = {"configurable": {"thread_id": thread_id}}
    
    state = await graph.aget_state(config)
    if not state or not state.values:
        raise HTTPException(status_code=404, detail="No active pipeline run found for given thread_id.")
    
    pending = state.values.get("pending_human_approvals", [])
    return PendingReviewsResponse(
        thread_id=thread_id,
        current_stage=state.values.get("current_stage", "UNKNOWN"),
        pending_approvals=pending,
        total_pending=len(pending)
    )


@router.post("/approve", response_model=Dict[str, Any])
async def submit_approvals(payload: BatchApprovalRequest):
    """
    Submits item-by-item human approval/rejection decisions and resumes the LangGraph pipeline.
    """
    checkpointer = get_checkpointer()
    graph = build_document_workflow(checkpointer=checkpointer)
    config = {"configurable": {"thread_id": payload.thread_id}}
    
    state = await graph.aget_state(config)
    if not state or not state.values:
        raise HTTPException(status_code=404, detail="No pipeline state found for thread_id.")
    
    pending = state.values.get("pending_human_approvals", [])
    if not pending:
        return {"status": "NO_PENDING_APPROVALS", "thread_id": payload.thread_id}

    # Partition decisions into approved and rejected sets with explicit handling (P0.2)
    approved_list = []
    rejected_list = []
    decision_map = {d.approval_id: d for d in payload.decisions}
    
    for item in pending:
        decision_info = decision_map.get(item["id"])
        if decision_info:
            if decision_info.decision.upper() == "APPROVED":
                item["status"] = "APPROVED"
                item["reviewer_notes"] = decision_info.reviewer_notes or "Explicitly approved"
                approved_list.append(item)
            else:
                item["status"] = "REJECTED"
                item["reviewer_notes"] = decision_info.reviewer_notes or "Explicitly rejected"
                rejected_list.append(item)
        else:
            # Default un-submitted items to explicit rejection with clear note
            item["status"] = "REJECTED"
            item["reviewer_notes"] = "Dismissed by batch reviewer (No decision specified)"
            rejected_list.append(item)

    # Resume graph by passing review decisions into graph stream Command / interrupt resume
    resume_payload = {
        "approved_items": approved_list,
        "rejected_items": rejected_list
    }

    
    try:
        from langgraph.types import Command
        async for _ in graph.astream(Command(resume=resume_payload), config=config):
            pass
            
        final_state = await graph.aget_state(config)
        return {
            "status": "COMPLETED" if final_state.values.get("pipeline_completed") else "PROCESSING",
            "thread_id": payload.thread_id,
            "approved_count": len(approved_list),
            "rejected_count": len(rejected_list),
            "current_stage": final_state.values.get("current_stage")
        }
    except Exception as e:
        logger.exception("Error resuming graph execution after human approval.")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runs/{thread_id}/status", response_model=PipelineStatusResponse)
async def get_run_status(thread_id: str):
    """
    Queries execution status, stage history, and cost metrics for a run.
    """
    checkpointer = get_checkpointer()
    graph = build_document_workflow(checkpointer=checkpointer)
    config = {"configurable": {"thread_id": thread_id}}
    
    state = await graph.aget_state(config)
    if not state or not state.values:
        raise HTTPException(status_code=404, detail="Thread ID not found.")
    
    val = state.values
    return PipelineStatusResponse(
        thread_id=thread_id,
        current_stage=val.get("current_stage", "UNKNOWN"),
        pipeline_completed=val.get("pipeline_completed", False),
        extracted_facts_count=len(val.get("extracted_facts", [])),
        rule_findings_count=len(val.get("rule_findings", [])),
        approved_count=len(val.get("approved_items", [])),
        rejected_count=len(val.get("rejected_items", [])),
        stage_history=val.get("stage_history", []),
        cost_metrics=val.get("cost_metrics", [])
    )


@router.get("/runs/{thread_id}/export", response_model=Dict[str, Any])
async def export_deliverable_report(thread_id: str):
    """
    Generates a grounded deliverable compliance register report summarizing
    approved changes, rejected findings, exact citations, and cost analytics.
    """
    checkpointer = get_checkpointer()
    graph = build_document_workflow(checkpointer=checkpointer)
    config = {"configurable": {"thread_id": thread_id}}
    
    state = await graph.aget_state(config)
    if not state or not state.values:
        raise HTTPException(status_code=404, detail="Thread ID not found.")
        
    val = state.values
    approved = val.get("approved_items", [])
    rejected = val.get("rejected_items", [])
    cost_metrics = val.get("cost_metrics", [])
    
    # Format Grounded Deliverable Report as Markdown
    md_lines = [
        f"# Grounded Compliance Register Report: {thread_id}",
        f"**Pipeline Status**: {'COMPLETED' if val.get('pipeline_completed') else 'PAUSED_AT_GATE'}",
        f"**Generated At**: {val.get('current_stage')} stage",
        "",
        "## Executive Summary",
        f"- **Extracted Document Facts**: {len(val.get('extracted_facts', []))}",
        f"- **Rule Findings Generated**: {len(val.get('rule_findings', []))}",
        f"- **Approved Amendments**: {len(approved)}",
        f"- **Dismissed Findings**: {len(rejected)}",
        "",
        "## Approved Document Amendments (Grounded & Cited)",
    ]
    
    if approved:
        for idx, item in enumerate(approved):
            md_lines.extend([
                f"### {idx + 1}. {item.get('item_type', 'RULE_VIOLATION')} (ID: {item.get('id')})",
                f"- **Finding**: {item.get('description')}",
                f"- **Proposed Action**: {item.get('proposed_action')}",
                f"- **Source Citation**: `{item.get('source_citation', 'Page 1')}`",
                f"- **Reviewer Notes**: {item.get('reviewer_notes', 'Approved by Human Operator')}",
                ""
            ])
    else:
        md_lines.append("_No approved amendments committed yet._\n")
        
    md_lines.extend([
        "## Dismissed Rule Findings",
    ])
    if rejected:
        for idx, item in enumerate(rejected):
            md_lines.extend([
                f"- **{item.get('id')}**: {item.get('description')} (Citation: `{item.get('source_citation')}`)",
                f"  - _Reason_: {item.get('reviewer_notes', 'Dismissed during human review')}"
            ])
    else:
        md_lines.append("_No findings dismissed._\n")
        
    md_lines.extend([
        "",
        "## Execution Cost & Latency Metrics",
        "| Stage | Execution Duration (ms) | Tokens Used | Estimated Cost (USD) |",
        "| :--- | :--- | :--- | :--- |"
    ])
    
    for metric in cost_metrics:
        md_lines.append(
            f"| {metric.get('stage')} | {metric.get('execution_time_ms')} ms | {metric.get('tokens_used')} | ${metric.get('estimated_cost_usd'):.4f} |"
        )
        
    report_content = "\n".join(md_lines)
    return {
        "thread_id": thread_id,
        "filename": f"Deliverable_Report_{thread_id}.md",
        "report_markdown": report_content,
        "summary": {
            "approved_count": len(approved),
            "rejected_count": len(rejected),
            "completed": val.get("pipeline_completed", False)
        }
    }


@router.get("/vector-search", response_model=Dict[str, Any])
async def vector_search_endpoint(query: str = Query(..., description="Semantic search query"), top_k: int = Query(3, ge=1, le=10)):
    """
    Queries PostgreSQL pgvector doc_embeddings table using 384-dim cosine distance (<=>).
    """
    try:
        from app.core.vector_store import search_similar_claims
    except ModuleNotFoundError:
        from backend.app.core.vector_store import search_similar_claims

    results = await search_similar_claims(query, top_k=top_k)
    return {
        "query": query,
        "top_k": top_k,
        "results": results
    }

