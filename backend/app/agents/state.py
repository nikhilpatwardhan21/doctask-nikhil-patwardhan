from typing import List, Dict, Any, Optional
from typing_extensions import TypedDict


class DocumentItem(TypedDict):
    id: str
    filename: str
    content: str
    mime_type: str
    metadata: Dict[str, Any]


class ExtractedFact(TypedDict):
    id: str
    doc_id: str
    claim: str
    source_citation: str
    confidence: float


class RuleFinding(TypedDict):
    id: str
    rule_name: str
    severity: str  # e.g., "INFO", "WARNING", "CRITICAL"
    finding_description: str
    affected_fact_id: Optional[str]
    source_citation: str
    action_required: str
    original_text: Optional[str]
    proposed_text: Optional[str]


class HumanApprovalItem(TypedDict):
    id: str
    finding_id: str
    item_type: str  # e.g., "RULE_VIOLATION", "FACT_CONFLICT", "DOCUMENT_UPDATE"
    description: str
    proposed_action: str
    source_citation: Optional[str]
    status: str  # "PENDING", "APPROVED", "REJECTED"
    reviewer_notes: Optional[str]
    original_text: Optional[str]
    proposed_text: Optional[str]


class CostMetric(TypedDict):
    stage: str
    tokens_used: int
    estimated_cost_usd: float
    execution_time_ms: float


class DocumentPipelineState(TypedDict):
    thread_id: str
    raw_documents: List[DocumentItem]
    extracted_facts: List[ExtractedFact]
    rule_findings: List[RuleFinding]
    pending_human_approvals: List[HumanApprovalItem]
    approved_items: List[HumanApprovalItem]
    rejected_items: List[HumanApprovalItem]
    current_stage: str
    stage_history: List[Dict[str, Any]]
    cost_metrics: List[CostMetric]
    pipeline_completed: bool
    error: Optional[str]
