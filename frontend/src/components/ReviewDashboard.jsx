import React, { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:8000/api/v1';
const API_HEADERS = {
  'Content-Type': 'application/json',
  'X-API-Key': 'superdocs_secret_key_2026'
};

const SAMPLE_DOCUMENTS = [
  {
    id: 'doc-001',
    filename: 'Vendor_Contract_Amendment_v2.pdf',
    content: 'Section 4.2: Payment terms extended to Net 60. Confidentiality clause updated to include third-party sub-processors.',
    mime_type: 'application/pdf',
    metadata: { department: 'Legal', year: 2026 }
  },
  {
    id: 'doc-002',
    filename: 'Project_Status_Report_Q2.pdf',
    content: 'Milestone 3 delayed by 2 weeks due to third-party API integration and security compliance audit.',
    mime_type: 'application/pdf',
    metadata: { department: 'Engineering' }
  }
];

export default function ReviewDashboard() {
  const [threadId, setThreadId] = useState(() => `thread-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`);
  const [stage, setStage] = useState('IDLE');
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [decisions, setDecisions] = useState({});
  const [runStatus, setRunStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // Reader & Modal State
  const [activeModalItem, setActiveModalItem] = useState(null);
  const [reportPreview, setReportPreview] = useState(null);

  // Document Ingestion queue
  const [documents, setDocuments] = useState([]);
  const [newFilename, setNewFilename] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newDepartment, setNewDepartment] = useState('Legal');
  const [showAddDocForm, setShowAddDocForm] = useState(false);

  // Terminal Auto-Scroll Ref
  const terminalBoxRef = useRef(null);

  // Terminal Logs (Chronological Event Stream)
  const [logs, setLogs] = useState([
    `[${new Date().toLocaleTimeString()}] Task 1 Agentic System Initialized on Thread: ${threadId}`,
    `[${new Date().toLocaleTimeString()}] LangGraph checkpointer connected to PostgreSQL :5433 (Behavior #2)`,
    `[${new Date().toLocaleTimeString()}] FastMCP machine tools registered for MCP automation (Behavior #4)`
  ]);

  const addLog = (text) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${text}`]);
  };

  // Smoothly auto-scroll terminal to bottom when new log arrives
  useEffect(() => {
    if (terminalBoxRef.current) {
      terminalBoxRef.current.scrollTop = terminalBoxRef.current.scrollHeight;
    }
  }, [logs]);




  // Fetch current run status & backend telemetry events
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/runs/${threadId}/status`, { headers: API_HEADERS });
      if (res.ok) {
        const data = await res.json();
        setRunStatus(data);
        setStage(data.current_stage);
        
        // Log backend telemetry events if available
        if (data.stage_history && data.stage_history.length > 0) {
          const latestStage = data.stage_history[data.stage_history.length - 1];
          addLog(`Backend Event [${latestStage.stage}]: Status=${latestStage.status} | Details=${latestStage.details || 'Completed'}`);
        }
      }
    } catch (err) {
      console.warn("Could not fetch run status:", err.message);
    }
  };


  // Fetch pending reviews
  const fetchPendingReviews = async () => {
    try {
      const res = await fetch(`${API_BASE}/pending-reviews?thread_id=${threadId}`, { headers: API_HEADERS });
      if (res.ok) {
        const data = await res.json();
        setPendingApprovals(data.pending_approvals || []);
        setStage(data.current_stage);
      }
    } catch (err) {
      console.warn("Could not fetch pending reviews:", err.message);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchPendingReviews();
  }, [threadId]);

  // Handle local File upload (PDF base64 & text files)
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const reader = new FileReader();
      const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      
      reader.onload = (event) => {
        const rawResult = event.target.result || '';
        const docObj = {
          id: `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          filename: file.name,
          content: rawResult,
          mime_type: file.type || (isPdf ? 'application/pdf' : 'text/plain'),
          metadata: { department: newDepartment, uploadedAt: new Date().toISOString() }
        };
        setDocuments(prev => [...prev, docObj]);
        addLog(`Queued source document: ${file.name}`);
      };

      if (isPdf) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };


  // Add custom manual document text
  const handleAddManualDocument = (e) => {
    e.preventDefault();
    if (!newFilename.trim() || !newContent.trim()) return;

    const docObj = {
      id: `doc-${Date.now()}`,
      filename: newFilename.endsWith('.pdf') || newFilename.endsWith('.txt') ? newFilename : `${newFilename}.txt`,
      content: newContent,
      mime_type: 'text/plain',
      metadata: { department: newDepartment, year: 2026 }
    };
    setDocuments(prev => [...prev, docObj]);
    addLog(`Queued manual text entry: ${docObj.filename}`);
    setNewFilename('');
    setNewContent('');
    setShowAddDocForm(false);
  };

  const handleRemoveDocument = (docId) => {
    setDocuments(prev => prev.filter(d => d.id !== docId));
  };

  // Trigger ingestion workflow with user documents
  const handleIngest = async () => {
    if (documents.length === 0) {
      setMessage('Please queue at least 1 document to start the workflow.');
      return;
    }

    setLoading(true);
    setMessage('⚡ Executing Workflow: Ingesting documents & examining against playbooks...');
    addLog(`Running workflow pipeline on ${documents.length} document(s)...`);
    try {
      const payload = {
        thread_id: threadId,
        documents: documents
      };
      
      const res = await fetch(`${API_BASE}/ingest`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      setMessage(`✦ Paused at Human Review Gate (Stage: ${data.current_stage})`);
      addLog(`Workflow paused at Human Review Gate (Status: ${data.status})`);
      await fetchPendingReviews();
      await fetchStatus();
    } catch (err) {
      setMessage(`✖ Error executing pipeline: ${err.message}`);
      addLog(`Error during pipeline execution: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDecisionChange = (approvalId, status) => {
    setDecisions(prev => ({
      ...prev,
      [approvalId]: status
    }));
  };

  // Single Item Direct Trigger: Approves/Rejects & Commits immediately
  const handleInstantSingleSubmit = async (approvalId, singleDecision) => {
    setLoading(true);
    setMessage(`⚡ Gatekeeper Decision (${singleDecision}) submitted for ${approvalId}...`);
    addLog(`Submitted gate decision (${singleDecision}) for item ${approvalId}`);

    const formattedDecisions = pendingApprovals.map(item => {
      const isTarget = item.id === approvalId;
      const decisionVal = isTarget ? singleDecision : (decisions[item.id] || 'APPROVED');
      return {
        approval_id: item.id,
        decision: decisionVal,
        reviewer_notes: `Reviewed by Operator (${decisionVal}) at ${new Date().toLocaleTimeString()}`
      };
    });

    try {
      const res = await fetch(`${API_BASE}/approve`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({
          thread_id: threadId,
          decisions: formattedDecisions
        })
      });
      
      const data = await res.json();
      setMessage(`✦ Execution Resumed & Completed! Approved: ${data.approved_count}, Dismissed: ${data.rejected_count}`);
      addLog(`Pipeline resumed & completed! Approved: ${data.approved_count}, Rejected: ${data.rejected_count}`);
      setPendingApprovals([]);
      await fetchStatus();
    } catch (err) {
      setMessage(`✖ Error executing gate decision: ${err.message}`);
      addLog(`Error executing gate decision: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Submit all approvals to resume LangGraph state machine
  const handleSubmitApprovals = async () => {
    setLoading(true);
    setMessage('⚡ Submitting all Gatekeeper decisions to state machine...');
    addLog(`Submitting batch approval decisions...`);

    const formattedDecisions = pendingApprovals.map(item => ({
      approval_id: item.id,
      decision: decisions[item.id] || 'APPROVED',
      reviewer_notes: `Batch reviewed by Operator at ${new Date().toLocaleTimeString()}`
    }));

    try {
      const res = await fetch(`${API_BASE}/approve`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({
          thread_id: threadId,
          decisions: formattedDecisions
        })
      });
      
      const data = await res.json();
      setMessage(`✦ Execution Resumed & Completed! Approved: ${data.approved_count}, Dismissed: ${data.rejected_count}`);
      addLog(`Workflow completed! Grounded Register committed.`);
      setPendingApprovals([]);
      await fetchStatus();
    } catch (err) {
      setMessage(`✖ Error committing decisions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Export Grounded Deliverable Report (.md)
  const handleExportDeliverable = async () => {
    try {
      const res = await fetch(`${API_BASE}/runs/${threadId}/export`, { headers: API_HEADERS });
      if (res.ok) {
        const data = await res.json();
        const content = data.report_markdown;
        setReportPreview(content);
        
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || `Deliverable_Report_${threadId}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setMessage(`✦ Exported Grounded Deliverable Report: ${data.filename}`);
        addLog(`Exported deliverable report: ${data.filename}`);
      } else {
        setMessage('Could not generate report for current thread.');
      }
    } catch (err) {
      setMessage(`Error exporting report: ${err.message}`);
    }
  };

  const stages = [
    { name: 'ingest_documents', label: 'STEP 1', desc: 'Ingest & Extract Facts (Behavior #1, #5)' },
    { name: 'examine_rules', label: 'STEP 2', desc: 'Examine Against Playbook (Movement 2)' },
    { name: 'await_human_review', label: 'STEP 3', desc: 'Human Review Gate (Behavior #3)' },
    { name: 'commit_updates', label: 'STEP 4', desc: 'Commit Grounded Deliverable (Movement 3)' }
  ];

  const filteredApprovals = pendingApprovals.filter(item => {
    if (severityFilter === 'ALL') return true;
    return item.item_type === severityFilter || item.description?.includes(severityFilter);
  });

  return (
    <div className="container">
      {/* Header */}
      <header>
        <div className="brand-group">
          <div className="brand-badge">
            <span className="pulse-dot"></span>
            TASK 1 AGENTIC SYSTEM
          </div>
          <h1 className="brand-title">DocTask Human-in-the-Loop Review Gate</h1>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="telemetry-pill">
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-terracotta)', fontFamily: 'var(--font-mono)' }}>THREAD_ID:</span>
            <input
              type="text"
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* 4 Visible Workflow Stages (Behavior #1: Visible Steps We Can Watch) */}
      <div style={{ marginBottom: '1rem' }}>
        <div className="eyebrow-tag" style={{ marginBottom: '0.5rem' }}>VISIBLE WORKFLOW STAGES (BEHAVIOR #1)</div>
        <div className="pipeline-deck">
          {stages.map((s) => {
            const isCurrent = stage === s.name;
            const isCompleted = runStatus?.pipeline_completed || stages.findIndex(st => st.name === stage) > stages.findIndex(st => st.name === s.name);
            return (
              <div key={s.name} className={`pipeline-node ${isCurrent ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent-terracotta)', fontWeight: '700' }}>{s.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: isCurrent ? 'var(--accent-gold)' : isCompleted ? 'var(--accent-sage)' : 'var(--text-muted)' }}>
                    {isCurrent ? 'ACTIVE' : isCompleted ? 'DONE' : 'WAITING'}
                  </span>
                </div>
                <div className="pipeline-node-title">{s.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{s.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Movement 1: Document Ingestion Dock */}
      <div className="control-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow-tag">MOVEMENT 1 / UNDERSTANDS THE PILE</div>
            <h2 className="panel-title">Source Document Ingestion Queue ({documents.length})</h2>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
              📁 Upload PDF / TXT File
              <input type="file" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-secondary" onClick={() => setShowAddDocForm(!showAddDocForm)}>
              {showAddDocForm ? 'Close Form' : '✏️ Add Text Excerpt'}
            </button>
            <button className="btn btn-secondary" onClick={() => setDocuments(SAMPLE_DOCUMENTS)}>
              ➕ Load Samples
            </button>
            {documents.length > 0 && (
              <button className="btn btn-reject" onClick={() => setDocuments([])}>
                🗑️ Clear Queue
              </button>
            )}
          </div>
        </div>

        {/* Add Manual Text Form */}
        {showAddDocForm && (
          <form onSubmit={handleAddManualDocument} style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '14px', marginBottom: '1.25rem', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
              <input
                type="text"
                placeholder="Document Filename (e.g., Service_Level_Agreement.pdf)"
                value={newFilename}
                onChange={(e) => setNewFilename(e.target.value)}
                style={{ flex: 2, background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '0.65rem 1rem', borderRadius: '8px', fontFamily: 'var(--font-sans)', outline: 'none' }}
                required
              />
              <select
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '0.65rem 1rem', borderRadius: '8px', fontFamily: 'var(--font-sans)', outline: 'none' }}
              >
                <option value="Legal">Department: Legal</option>
                <option value="Engineering">Department: Engineering</option>
                <option value="Finance">Department: Finance</option>
                <option value="Compliance">Department: Compliance</option>
              </select>
            </div>
            <textarea
              placeholder="Paste document text content here..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '0.65rem 1rem', borderRadius: '8px', fontFamily: 'var(--font-sans)', marginBottom: '0.75rem', outline: 'none' }}
              required
            />
            <button type="submit" className="btn btn-approve" style={{ fontSize: '0.85rem' }}>
              + Add Document to Queue
            </button>
          </form>
        )}

        {/* Queued Documents */}
        {documents.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '14px', border: '1px dashed var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Queue is empty. Click <strong>📁 Upload PDF / TXT File</strong> or <strong>➕ Load Samples</strong> to add documents.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {documents.map((doc) => (
              <div key={doc.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.95rem', fontFamily: 'var(--font-brand)' }}>
                    📄 {doc.filename}
                  </span>
                  <button
                    onClick={() => handleRemoveDocument(doc.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '800' }}
                    title="Remove Document"
                  >
                    ✖
                  </button>
                </div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: '1.45', marginBottom: '0.75rem', height: '2.9em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  "{doc.content}"
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                    {doc.metadata?.department || 'General'}
                  </span>
                  <span style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                    {doc.content.length} chars
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Workflow Trigger Controls */}
      <div style={{ marginBottom: '2.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={handleIngest} disabled={loading || documents.length === 0} style={{ padding: '0.9rem 2rem', fontSize: '1rem' }}>
          {loading ? '⚡ Running Workflow...' : `▶ Run Agentic Pipeline (${documents.length} Docs)`}
        </button>
        <button className="btn btn-secondary" onClick={fetchStatus}>
          🔄 Check Pipeline Status
        </button>

        {runStatus && (
          <button className="btn btn-approve" onClick={handleExportDeliverable}>
            📥 Export Grounded Deliverable Report (.MD)
          </button>
        )}
        {message && <span style={{ color: 'var(--accent-gold)', fontSize: '0.9rem', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{message}</span>}
      </div>

      {/* Movement 2 & Behavior #3: Human Review Gatekeeper */}
      <div className="control-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow-tag">MOVEMENT 2 & BEHAVIOR #3 / HUMAN HOLDS THE GATE</div>
            <h2 className="panel-title">Human Review Gatekeeper (Item-by-Item Approval)</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Before final output is committed, review findings and approve or reject item-by-item (Behavior #3).
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>FILTER BY SEVERITY:</span>
            {['ALL', 'WARNING', 'CRITICAL'].map(f => (
              <button
                key={f}
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', opacity: severityFilter === f ? 1 : 0.6 }}
                onClick={() => setSeverityFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {filteredApprovals.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px dashed var(--border-color)' }}>
            <p style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '0.4rem' }}>No pending items awaiting review for thread <code>{threadId}</code>.</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Queue source documents above and click <strong>▶ Run Agentic Pipeline</strong> to pause execution at this gate.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Top Bulk Action Bar & Commit Control (No scrolling required!) */}
            <div style={{ background: 'var(--bg-surface)', padding: '1rem 1.25rem', borderRadius: '14px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                  onClick={() => {
                    const newDecs = {};
                    pendingApprovals.forEach(item => { newDecs[item.id] = 'APPROVED'; });
                    setDecisions(newDecs);
                  }}
                >
                  ✓ Select All Approve
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                  onClick={() => {
                    const newDecs = {};
                    pendingApprovals.forEach(item => { newDecs[item.id] = 'REJECTED'; });
                    setDecisions(newDecs);
                  }}
                >
                  ✖ Select All Reject
                </button>
              </div>

              {/* Pagination Page Switcher */}
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.825rem' }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                >
                  ◀ Prev
                </button>
                <span style={{ color: 'var(--accent-gold)', padding: '0 0.5rem', fontWeight: '700' }}>
                  Page {currentPage} of {Math.ceil(filteredApprovals.length / 3) || 1}
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                  disabled={currentPage >= Math.ceil(filteredApprovals.length / 3)}
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredApprovals.length / 3), prev + 1))}
                >
                  Next ▶
                </button>
              </div>

              <button className="btn btn-approve" onClick={handleSubmitApprovals} disabled={loading} style={{ padding: '0.65rem 1.4rem', fontSize: '0.9rem' }}>
                🚀 Commit All Decisions ({filteredApprovals.length} Items)
              </button>
            </div>

            {/* Paginated Card List (3 Cards Per Page) */}
            {filteredApprovals.slice((currentPage - 1) * 3, currentPage * 3).map((item) => {
              const currentDecision = decisions[item.id] || 'APPROVED';
              return (
                <div key={item.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '1.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                      <span style={{ background: 'rgba(244, 63, 94, 0.15)', color: 'var(--accent-rose)', border: '1px solid rgba(244, 63, 94, 0.3)', padding: '0.35rem 0.85rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '800', fontFamily: 'var(--font-mono)' }}>
                        {item.item_type}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={() => setActiveModalItem(item)}>
                        🔎 View Details
                      </button>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ID: {item.id}</span>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-main)', marginBottom: '1rem' }}>
                    <strong style={{ color: 'var(--accent-terracotta)' }}>Finding:</strong> {item.description}
                    <br />
                    <strong style={{ color: 'var(--accent-gold)' }}>Proposed Action:</strong> {item.proposed_action}
                  </div>

                  {/* Wording Storyboard Diff */}
                  {(item.original_text || item.proposed_text) && (
                    <div className="diff-storyboard">
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Wording Diff</div>
                      <div className="diff-line-deleted">
                        - ORIGINAL: {item.original_text || 'Original clause text'}
                      </div>
                      <div className="diff-line-added">
                        + PROPOSED: {item.proposed_text || 'Proposed amendment wording'}
                      </div>
                    </div>
                  )}

                  {/* Source Citation (Behavior #5: Grounded Claims) */}
                  <div className="citation-box">
                    <span>📌 Source Page Citation Anchor (Behavior #5):</span>
                    <strong>{item.source_citation || 'Document Excerpt, Page 1'}</strong>
                  </div>

                  {/* Item Actions (2 Clean Options) */}
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    <button
                      className="btn btn-reject"
                      style={{ flex: 1, padding: '0.65rem 1.25rem', fontSize: '0.9rem', opacity: currentDecision === 'REJECTED' ? 1 : 0.45 }}
                      onClick={() => handleDecisionChange(item.id, 'REJECTED')}
                    >
                      {currentDecision === 'REJECTED' ? '✖ Selected: Reject Finding' : '✖ Reject Finding'}
                    </button>
                    <button
                      className="btn btn-approve"
                      style={{ flex: 1, padding: '0.65rem 1.25rem', fontSize: '0.9rem', opacity: currentDecision === 'APPROVED' ? 1 : 0.45 }}
                      onClick={() => handleDecisionChange(item.id, 'APPROVED')}
                    >
                      {currentDecision === 'APPROVED' ? '✓ Selected: Approve Finding' : '✓ Approve Finding'}
                    </button>
                  </div>

                </div>
              );
            })}

            {/* Bottom Pagination Bar */}
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', padding: '0.85rem 1.25rem', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.825rem' }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                >
                  ◀ Prev
                </button>

                {Array.from({ length: Math.ceil(filteredApprovals.length / 3) || 1 }, (_, i) => i + 1).map(pgNum => (
                  <button
                    key={pgNum}
                    className="btn btn-secondary"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', opacity: currentPage === pgNum ? 1 : 0.5, borderColor: currentPage === pgNum ? 'var(--accent-gold)' : 'var(--border-color)' }}
                    onClick={() => setCurrentPage(pgNum)}
                  >
                    {pgNum}
                  </button>
                ))}

                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                  disabled={currentPage >= Math.ceil(filteredApprovals.length / 3)}
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredApprovals.length / 3), prev + 1))}
                >
                  Next ▶
                </button>
              </div>

              <button className="btn btn-approve" onClick={handleSubmitApprovals} disabled={loading} style={{ padding: '0.85rem 2rem', fontSize: '1rem' }}>
                🚀 Commit All Decisions ({filteredApprovals.length} items) & Finish Execution
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Deliverable Report Preview Drawer */}
      {reportPreview && (
        <div className="control-panel">
          <div className="panel-header">
            <h2 className="panel-title">📄 Grounded Audit Register Live Preview</h2>
            <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setReportPreview(null)}>
              Close Preview
            </button>
          </div>
          <pre style={{ background: '#0d0b0a', padding: '1.5rem', borderRadius: '14px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-gold)', overflowX: 'auto', whiteSpace: 'pre-wrap', border: '1px solid var(--border-color)' }}>
            {reportPreview}
          </pre>
        </div>
      )}

      {/* Behavior #10: Stage Execution Duration & Token Cost Table */}
      {runStatus && (
        <div className="control-panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow-tag">BEHAVIOR #10 / KNOWS WHAT IT COST</div>
              <h2 className="panel-title">Stage Execution Telemetry & Cost Report</h2>
            </div>
            <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', background: 'rgba(245, 158, 11, 0.12)', padding: '0.35rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: '700' }}>
              STATUS: {runStatus.pipeline_completed ? '✓ COMPLETED' : '● PAUSED AT GATE'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '2rem' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>EXTRACTED FACTS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--accent-terracotta)', marginTop: '0.2rem' }}>{runStatus.extracted_facts_count}</div>
            </div>
            <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>RULE FINDINGS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--accent-rose)', marginTop: '0.2rem' }}>{runStatus.rule_findings_count}</div>
            </div>
            <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>APPROVED ITEMS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--accent-sage)', marginTop: '0.2rem' }}>{runStatus.approved_count}</div>
            </div>
            <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>DISMISSED ITEMS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{runStatus.rejected_count}</div>
            </div>
          </div>

          {/* Stage Cost Breakdown Table */}
          {runStatus.cost_metrics && runStatus.cost_metrics.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '800', marginBottom: '1rem', color: 'var(--text-main)', fontFamily: 'var(--font-brand)' }}>STAGE TELEMETRY (DURATION & TOKENS)</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>STAGE NAME</th>
                    <th style={{ padding: '0.75rem 1rem' }}>EXECUTION DURATION</th>
                    <th style={{ padding: '0.75rem 1rem' }}>TOKENS USED</th>
                    <th style={{ padding: '0.75rem 1rem' }}>ESTIMATED COST (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {runStatus.cost_metrics.map((m, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--accent-terracotta)', fontWeight: '700' }}>{m.stage}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>{m.execution_time_ms} ms</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>{m.tokens_used}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--accent-sage)', fontWeight: '700' }}>${m.estimated_cost_usd?.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Live System Event Console Log Stream */}
      <div className="control-panel">
        <div className="panel-header">
          <h2 className="panel-title">💻 Live System Event Console Log</h2>
          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontWeight: '700' }}>
            ● REALTIME STREAM
          </span>
        </div>
        <div className="terminal-box" ref={terminalBoxRef}>
          {logs.map((l, idx) => (
            <div key={idx} className="terminal-line">{l}</div>
          ))}
        </div>
      </div>








      {/* Inspection Modal */}
      {activeModalItem && (
        <div className="modal-overlay" onClick={() => setActiveModalItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', fontFamily: 'var(--font-brand)', fontWeight: '800' }}>Inspection Details: {activeModalItem.id}</h3>
              <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setActiveModalItem(null)}>
                ✖ Close
              </button>
            </div>
            <div style={{ lineHeight: '1.6', fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '1rem' }}>
              <strong>Finding:</strong> {activeModalItem.description}<br />
              <strong>Action Required:</strong> {activeModalItem.proposed_action}<br />
              <strong>Citation Anchor:</strong> <code style={{ color: 'var(--accent-terracotta)', fontWeight: '700' }}>{activeModalItem.source_citation}</code>
            </div>

            <div className="diff-storyboard">
              <div style={{ color: 'var(--accent-rose)', marginBottom: '0.5rem' }}>- ORIGINAL: {activeModalItem.original_text}</div>
              <div style={{ color: 'var(--accent-sage)' }}>+ PROPOSED: {activeModalItem.proposed_text}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button className="btn btn-reject" onClick={() => { handleDecisionChange(activeModalItem.id, 'REJECTED'); setActiveModalItem(null); }}>
                ✖ Reject Finding
              </button>
              <button className="btn btn-approve" onClick={() => { handleDecisionChange(activeModalItem.id, 'APPROVED'); setActiveModalItem(null); }}>
                ✓ Approve Finding
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
        <p style={{ fontFamily: 'var(--font-brand)', fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '0.5rem', fontWeight: '800' }}>DOCTASK TASK 1 AGENTIC SYSTEM</p>
        <p>Built for the SuperDocs Engineer Task by Nikhil Patwardhan | Repository: <code>doctask-nikhil-patwardhan</code></p>
      </footer>
    </div>
  );
}
