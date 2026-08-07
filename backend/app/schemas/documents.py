from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class IngestDocumentRequest(BaseModel):
    thread_id: str = Field(..., description="Unique thread identifier for execution checkpointing")
    documents: List[Dict[str, Any]] = Field(..., description="List of documents containing filename, content, and metadata")


class SingleApprovalDecision(BaseModel):
    approval_id: str
    decision: str = Field(..., description="'APPROVED' or 'REJECTED'")
    reviewer_notes: Optional[str] = None


class BatchApprovalRequest(BaseModel):
    thread_id: str
    decisions: List[SingleApprovalDecision]


class PendingReviewsResponse(BaseModel):
    thread_id: str
    current_stage: str
    pending_approvals: List[Dict[str, Any]]
    total_pending: int


class PipelineStatusResponse(BaseModel):
    thread_id: str
    current_stage: str
    pipeline_completed: bool
    extracted_facts_count: int
    rule_findings_count: int
    approved_count: int
    rejected_count: int
    stage_history: List[Dict[str, Any]]
    cost_metrics: List[Dict[str, Any]]
