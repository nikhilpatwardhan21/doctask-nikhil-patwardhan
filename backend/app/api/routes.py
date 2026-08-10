import logging
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any

try:
    from app.schemas.documents import (
        IngestDocumentRequest,
        BatchApprovalRequest,
        PendingReviewsResponse,
        PipelineStatusResponse,
    )
    from app.agents.graph import build_document_workflow
    from app.core.db import get_checkpointer
except ModuleNotFoundError:
    from backend.app.schemas.documents import (
        IngestDocumentRequest,
        BatchApprovalRequest,
        PendingReviewsResponse,
        PipelineStatusResponse,
    )
    from backend.app.agents.graph import build_document_workflow
    from backend.app.core.db import get_checkpointer

logger = logging.getLogger(__name__)
router = APIRouter()


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

    # Partition decisions into approved and rejected sets
    approved_list = []
    rejected_list = []
    decision_map = {d.approval_id: d for d in payload.decisions}
    
    for item in pending:
        decision_info = decision_map.get(item["id"])
        if decision_info and decision_info.decision.upper() == "APPROVED":
            item["status"] = "APPROVED"
            item["reviewer_notes"] = decision_info.reviewer_notes
            approved_list.append(item)
        else:
            item["status"] = "REJECTED"
            item["reviewer_notes"] = decision_info.reviewer_notes if decision_info else "Rejected by default"
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


@router.get("/vector-search", response_model=Dict[str, Any])
async def search_vector_embeddings(query: str = Query(..., description="Semantic search query text"), top_k: int = 3):
    """
    Exposes direct pgvector cosine similarity search (<=>) over stored document embeddings.
    """
    try:
        try:
            from app.core.vector_store import search_similar_claims
        except ModuleNotFoundError:
            from backend.app.core.vector_store import search_similar_claims
            
        results = await search_similar_claims(query_text=query, top_k=top_k)
        return {
            "query": query,
            "total_matches": len(results),
            "results": results
        }
    except Exception as e:
        logger.exception("Error executing pgvector similarity search.")
        raise HTTPException(status_code=500, detail=str(e))
