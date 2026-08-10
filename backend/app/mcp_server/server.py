import json
import logging
from typing import Dict, Any, List
from mcp.server import MCPServer

try:
    from app.core.db import get_checkpointer
    from app.agents.graph import build_document_workflow
except ModuleNotFoundError:
    from backend.app.core.db import get_checkpointer
    from backend.app.agents.graph import build_document_workflow
from langgraph.types import Command

logger = logging.getLogger(__name__)

# Instantiate MCPServer for Model Context Protocol (MCP)
mcp_server = MCPServer(
    name="DocumentProcessingGateMCP",
    instructions="MCP Server enabling external AI agents to drive document processing pipelines and gate approvals."
)


@mcp_server.tool()
async def trigger_document_pipeline(thread_id: str, raw_documents_json: str) -> str:
    """
    Triggers the document processing workflow for a given thread_id.
    raw_documents_json should be a JSON string formatted as a list of document objects (id, filename, content).
    """
    try:
        raw_docs = json.loads(raw_documents_json)
        checkpointer = get_checkpointer()
        graph = build_document_workflow(checkpointer=checkpointer)
        
        config = {"configurable": {"thread_id": thread_id}}
        initial_state = {
            "thread_id": thread_id,
            "raw_documents": raw_docs,
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
        
        async for _ in graph.astream(initial_state, config=config):
            pass
            
        state = await graph.aget_state(config)
        pending = state.values.get("pending_human_approvals", [])
        return json.dumps({
            "status": "PAUSED_AT_GATE",
            "thread_id": thread_id,
            "pending_reviews_count": len(pending),
            "pending_items": pending
        }, indent=2)
    except Exception as e:
        logger.exception("Error in MCP trigger_document_pipeline tool.")
        return json.dumps({"error": str(e)})


@mcp_server.tool()
async def list_pending_reviews(thread_id: str) -> str:
    """
    Exposes pending items awaiting approval at the human review gate to an external agent.
    """
    try:
        checkpointer = get_checkpointer()
        graph = build_document_workflow(checkpointer=checkpointer)
        config = {"configurable": {"thread_id": thread_id}}
        
        state = await graph.aget_state(config)
        if not state or not state.values:
            return json.dumps({"error": f"No state found for thread_id: {thread_id}"})
            
        pending = state.values.get("pending_human_approvals", [])
        return json.dumps({
            "thread_id": thread_id,
            "current_stage": state.values.get("current_stage"),
            "pending_count": len(pending),
            "pending_items": pending
        }, indent=2)
    except Exception as e:
        logger.exception("Error in MCP list_pending_reviews tool.")
        return json.dumps({"error": str(e)})


@mcp_server.tool()
async def submit_approval_decision(thread_id: str, decisions_json: str) -> str:
    """
    Exposes human-approval gate to external agents as an MCP tool.
    decisions_json must be a JSON array of objects: [{"approval_id": "...", "decision": "APPROVED"|"REJECTED", "reviewer_notes": "..."}]
    """
    try:
        decisions_data = json.loads(decisions_json)
        checkpointer = get_checkpointer()
        graph = build_document_workflow(checkpointer=checkpointer)
        config = {"configurable": {"thread_id": thread_id}}
        
        state = await graph.aget_state(config)
        if not state or not state.values:
            return json.dumps({"error": f"No active workflow found for thread_id: {thread_id}"})
            
        pending = state.values.get("pending_human_approvals", [])
        decision_map = {d["approval_id"]: d for d in decisions_data}
        
        approved_list = []
        rejected_list = []
        for item in pending:
            d = decision_map.get(item["id"])
            if d and d.get("decision", "").upper() == "APPROVED":
                item["status"] = "APPROVED"
                item["reviewer_notes"] = d.get("reviewer_notes", "Approved via MCP tool")
                approved_list.append(item)
            else:
                item["status"] = "REJECTED"
                item["reviewer_notes"] = d.get("reviewer_notes", "Rejected via MCP tool") if d else "Rejected"
                rejected_list.append(item)

        resume_payload = {
            "approved_items": approved_list,
            "rejected_items": rejected_list
        }
        
        async for _ in graph.astream(Command(resume=resume_payload), config=config):
            pass
            
        final_state = await graph.aget_state(config)
        return json.dumps({
            "status": "SUCCESS",
            "pipeline_completed": final_state.values.get("pipeline_completed", False),
            "approved_count": len(approved_list),
            "rejected_count": len(rejected_list),
            "current_stage": final_state.values.get("current_stage")
        }, indent=2)
    except Exception as e:
        logger.exception("Error in MCP submit_approval_decision tool.")
        return json.dumps({"error": str(e)})
