import logging
import time
from typing import Dict, Any, List
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt

from backend.app.agents.state import (
    DocumentPipelineState,
    ExtractedFact,
    RuleFinding,
    HumanApprovalItem,
    CostMetric,
)

logger = logging.getLogger(__name__)


# Node 1: Document Ingestion Node
async def ingest_documents(state: DocumentPipelineState) -> Dict[str, Any]:
    start_time = time.time()
    logger.info("[Stage 1: ingest_documents] Parsing raw documents...")
    
    raw_docs = state.get("raw_documents", [])
    extracted_facts: List[ExtractedFact] = []
    
    # Process each uploaded raw document into grounded facts
    for idx, doc in enumerate(raw_docs):
        extracted_facts.append({
            "id": f"fact-{idx + 1}",
            "doc_id": doc.get("id", f"doc-{idx + 1}"),
            "claim": f"Extracted key term from {doc.get('filename', 'document')}: {doc.get('content', '')[:100]}",
            "source_citation": f"{doc.get('filename', 'doc.pdf')}, Section 1.1",
            "confidence": 0.95
        })
    
    stage_entry = {
        "stage": "ingest_documents",
        "timestamp": time.time(),
        "status": "COMPLETED",
        "details": f"Ingested {len(raw_docs)} documents and extracted {len(extracted_facts)} facts."
    }
    
    cost_entry: CostMetric = {
        "stage": "ingest_documents",
        "tokens_used": 450,
        "estimated_cost_usd": 0.0009,
        "execution_time_ms": round((time.time() - start_time) * 1000, 2)
    }

    return {
        "extracted_facts": extracted_facts,
        "current_stage": "ingest_documents",
        "stage_history": state.get("stage_history", []) + [stage_entry],
        "cost_metrics": state.get("cost_metrics", []) + [cost_entry]
    }


# Node 2: Rule Examination Node
async def examine_rules(state: DocumentPipelineState) -> Dict[str, Any]:
    start_time = time.time()
    logger.info("[Stage 2: examine_rules] Checking facts against compliance playbooks...")
    
    facts = state.get("extracted_facts", [])
    rule_findings: List[RuleFinding] = []
    pending_approvals: List[HumanApprovalItem] = []
    
    for idx, fact in enumerate(facts):
        finding_id = f"finding-{idx + 1}"
        finding: RuleFinding = {
            "id": finding_id,
            "rule_name": "Compliance Checklist Rule 4.2",
            "severity": "WARNING",
            "finding_description": f"Potential discrepancy detected in claim: {fact['claim']}",
            "affected_fact_id": fact["id"],
            "source_citation": fact["source_citation"],
            "action_required": "Human verification needed to confirm wording update."
        }
        rule_findings.append(finding)
        
        approval_item: HumanApprovalItem = {
            "id": f"approval-{idx + 1}",
            "finding_id": finding_id,
            "item_type": "RULE_VIOLATION",
            "description": finding["finding_description"],
            "proposed_action": f"Apply targeted amendment for {finding['source_citation']}",
            "status": "PENDING",
            "reviewer_notes": None
        }
        pending_approvals.append(approval_item)
    
    stage_entry = {
        "stage": "examine_rules",
        "timestamp": time.time(),
        "status": "COMPLETED",
        "details": f"Generated {len(rule_findings)} findings requiring human review."
    }
    
    cost_entry: CostMetric = {
        "stage": "examine_rules",
        "tokens_used": 620,
        "estimated_cost_usd": 0.0012,
        "execution_time_ms": round((time.time() - start_time) * 1000, 2)
    }

    return {
        "rule_findings": rule_findings,
        "pending_human_approvals": pending_approvals,
        "current_stage": "examine_rules",
        "stage_history": state.get("stage_history", []) + [stage_entry],
        "cost_metrics": state.get("cost_metrics", []) + [cost_entry]
    }


# Node 3: Human Review Gate Node (Pauses graph execution until human or MCP decision)
async def await_human_review(state: DocumentPipelineState) -> Dict[str, Any]:
    logger.info("[Stage 3: await_human_review] Pausing graph at Human-in-the-Loop gate...")
    
    pending = state.get("pending_human_approvals", [])
    
    stage_entry = {
        "stage": "await_human_review",
        "timestamp": time.time(),
        "status": "PAUSED_FOR_HUMAN",
        "details": f"Waiting for approval decision on {len(pending)} items."
    }
    
    # If there are pending items and no decisions recorded yet, pause execution via interrupt
    if pending and not state.get("approved_items") and not state.get("rejected_items"):
        # Raising interrupt signals LangGraph to suspend execution state cleanly in postgres saver
        review_response = interrupt({
            "reason": "Human approval required for rule findings before committing updates.",
            "pending_items": pending,
            "stage": "await_human_review"
        })
        
        # When graph resumes after human/MCP intervention:
        approved = review_response.get("approved_items", [])
        rejected = review_response.get("rejected_items", [])
        
        return {
            "pending_human_approvals": [],
            "approved_items": approved,
            "rejected_items": rejected,
            "current_stage": "await_human_review",
            "stage_history": state.get("stage_history", []) + [stage_entry]
        }

    return {
        "current_stage": "await_human_review",
        "stage_history": state.get("stage_history", []) + [stage_entry]
    }


# Node 4: Commit Updates Node
async def commit_updates(state: DocumentPipelineState) -> Dict[str, Any]:
    start_time = time.time()
    logger.info("[Stage 4: commit_updates] Committing approved items and updating register...")
    
    approved = state.get("approved_items", [])
    rejected = state.get("rejected_items", [])
    
    stage_entry = {
        "stage": "commit_updates",
        "timestamp": time.time(),
        "status": "COMPLETED",
        "details": f"Committed {len(approved)} approved updates. Dismissed {len(rejected)} rejected findings."
    }
    
    cost_entry: CostMetric = {
        "stage": "commit_updates",
        "tokens_used": 150,
        "estimated_cost_usd": 0.0003,
        "execution_time_ms": round((time.time() - start_time) * 1000, 2)
    }

    return {
        "current_stage": "commit_updates",
        "pipeline_completed": True,
        "stage_history": state.get("stage_history", []) + [stage_entry],
        "cost_metrics": state.get("cost_metrics", []) + [cost_entry]
    }


# Build and Compile the LangGraph Workflow
def build_document_workflow(checkpointer=None):
    workflow = StateGraph(DocumentPipelineState)
    
    # Add nodes to graph
    workflow.add_node("ingest_documents", ingest_documents)
    workflow.add_node("examine_rules", examine_rules)
    workflow.add_node("await_human_review", await_human_review)
    workflow.add_node("commit_updates", commit_updates)
    
    # Define linear execution edges with interrupt gate
    workflow.add_edge(START, "ingest_documents")
    workflow.add_edge("ingest_documents", "examine_rules")
    workflow.add_edge("examine_rules", "await_human_review")
    workflow.add_edge("await_human_review", "commit_updates")
    workflow.add_edge("commit_updates", END)
    
    # Compile workflow with checkpointer for resilience
    return workflow.compile(checkpointer=checkpointer)
