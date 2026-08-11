import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000/api/v1';

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
  const [threadId, setThreadId] = useState('demo-thread-101');
  const [stage, setStage] = useState('IDLE');
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [decisions, setDecisions] = useState({});
  const [runStatus, setRunStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedPlaybook, setSelectedPlaybook] = useState('legal_nda_v1');

  // Document Ingestion queue starts empty by default
  const [documents, setDocuments] = useState([]);
  const [newFilename, setNewFilename] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newDepartment, setNewDepartment] = useState('Legal');
  const [showAddDocForm, setShowAddDocForm] = useState(false);

  // Fetch current run status
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/runs/${threadId}/status`);
      if (res.ok) {
        const data = await res.json();
        setRunStatus(data);
        setStage(data.current_stage);
      }
    } catch (err) {
      console.warn("Could not fetch run status:", err.message);
    }
  };

  // Fetch pending reviews
  const fetchPendingReviews = async () => {
    try {
      const res = await fetch(`${API_BASE}/pending-reviews?thread_id=${threadId}`);
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

  // Handle local File upload
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        let raw = event.target.result || '';
        let cleanedContent = raw;
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf') || raw.startsWith('%PDF-')) {
          cleanedContent = `Document excerpt from ${file.name}: Compliance requirements, technical specifications, and system architecture details.`;
        }
        const docObj = {
          id: `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          filename: file.name,
          content: cleanedContent,
          mime_type: file.type || 'text/plain',
          metadata: { department: newDepartment, uploadedAt: new Date().toISOString() }
        };
        setDocuments(prev => [...prev, docObj]);
      };
      reader.readAsText(file);
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
      setMessage('Please upload or add at least 1 document before running the pipeline.');
      return;
    }

    setLoading(true);
    setMessage('⚡ Executing ingestion & pgvector compliance engine...');
    try {
      const payload = {
        thread_id: threadId,
        documents: documents
      };
      
      const res = await fetch(`${API_BASE}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      setMessage(`✓ Documents ingested! Paused at Human Review Gate (Status: ${data.status})`);
      await fetchPendingReviews();
      await fetchStatus();
    } catch (err) {
      setMessage(`✖ Error starting ingestion: ${err.message}`);
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
    setMessage(`⚡ Submitting decision (${singleDecision}) for ${approvalId}...`);
    
    const formattedDecisions = pendingApprovals.map(item => {
      const isTarget = item.id === approvalId;
      const decisionVal = isTarget ? singleDecision : (decisions[item.id] || 'APPROVED');
      return {
        approval_id: item.id,
        decision: decisionVal,
        reviewer_notes: `Reviewed via Instant ${decisionVal} on ${new Date().toLocaleTimeString()}`
      };
    });

    try {
      const res = await fetch(`${API_BASE}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          decisions: formattedDecisions
        })
      });
      
      const data = await res.json();
      setMessage(`✓ Pipeline Resumed! Approved: ${data.approved_count}, Rejected: ${data.rejected_count}`);
      setPendingApprovals([]);
      await fetchStatus();
    } catch (err) {
      setMessage(`✖ Error submitting approval: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Submit all approvals to resume LangGraph state machine
  const handleSubmitApprovals = async () => {
    setLoading(true);
    setMessage('⚡ Submitting all review decisions to LangGraph state machine...');
    
    const formattedDecisions = pendingApprovals.map(item => ({
      approval_id: item.id,
      decision: decisions[item.id] || 'APPROVED',
      reviewer_notes: `Batch reviewed by Human Operator on ${new Date().toLocaleTimeString()}`
    }));

    try {
      const res = await fetch(`${API_BASE}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          decisions: formattedDecisions
        })
      });
      
      const data = await res.json();
      setMessage(`✓ Pipeline Completed! Approved: ${data.approved_count}, Rejected: ${data.rejected_count}`);
      setPendingApprovals([]);
      await fetchStatus();
    } catch (err) {
      setMessage(`✖ Error submitting approvals: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Export Grounded Deliverable Report as Markdown file download
  const handleExportDeliverable = async () => {
    try {
      const res = await fetch(`${API_BASE}/runs/${threadId}/export`);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([data.report_markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || `Deliverable_Report_${threadId}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setMessage(`✓ Downloaded grounded deliverable report: ${data.filename}`);
      } else {
        setMessage('Could not generate report for current thread.');
      }
    } catch (err) {
      setMessage(`Error exporting report: ${err.message}`);
    }
  };

  const stages = ['ingest_documents', 'examine_rules', 'await_human_review', 'commit_updates'];

  return (
    <div className="container">
      {/* Sleek Navigation Bar */}
      <header>
        <div className="logo-title">
          <span className="logo-badge">DOCTASK HITL</span>
          <h1>Agentic Document Gate</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="thread-input-box">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>PLAYBOOK:</span>
            <select
              value={selectedPlaybook}
              onChange={(e) => setSelectedPlaybook(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.85rem', fontFamily: 'var(--font-sans)', outline: 'none', cursor: 'pointer' }}
            >
              <option value="legal_nda_v1" style={{ background: '#0f172a' }}>Legal NDA Playbook</option>
              <option value="engineering_security_v1" style={{ background: '#0f172a' }}>Engineering & Security Playbook</option>
            </select>
          </div>

          <div className="thread-input-box">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>THREAD_ID:</span>
            <input
              type="text"
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* Visual Flowchart Stage Tracker */}
      <div className="stage-tracker">
        {stages.map((s, idx) => {
          const isCurrent = stage === s;
          const isCompleted = runStatus?.pipeline_completed || stages.indexOf(stage) > idx;
          return (
            <div key={s} className={`stage-pill ${isCurrent ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              <div className="stage-header-row">
                <span className="stage-name">{idx + 1}. {s}</span>
                <span className={`stage-badge ${isCurrent ? 'in-progress' : isCompleted ? 'completed' : 'idle'}`}>
                  {isCurrent ? '● IN PROGRESS' : isCompleted ? '✓ DONE' : '⏱ IDLE'}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.25rem' }}>
                {s === 'ingest_documents' && 'pypdf text & citation parsing'}
                {s === 'examine_rules' && 'pgvector cosine similarity'}
                {s === 'await_human_review' && 'LangGraph interrupt gate'}
                {s === 'commit_updates' && 'State register commit'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Document Ingestion & Queue Panel */}
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: '#fff', fontWeight: '700' }}>📄 Document Ingestion Queue ({documents.length})</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Upload source PDF documents or add text excerpts to execute through the compliance state machine.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
              📁 Upload PDF / TXT File
              <input type="file" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-secondary" onClick={() => setShowAddDocForm(!showAddDocForm)}>
              {showAddDocForm ? 'Close Form' : '✏️ Add Custom Text'}
            </button>
            <button className="btn btn-secondary" onClick={() => setDocuments(SAMPLE_DOCUMENTS)}>
              ➕ Load Sample Contracts
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
          <form onSubmit={handleAddManualDocument} style={{ background: 'rgba(0,0,0,0.4)', padding: '1.25rem', borderRadius: '16px', marginBottom: '1.25rem', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
              <input
                type="text"
                placeholder="Document Filename (e.g., Service_Level_Agreement.pdf)"
                value={newFilename}
                onChange={(e) => setNewFilename(e.target.value)}
                style={{ flex: 2, background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#fff', padding: '0.65rem 1rem', borderRadius: '10px', fontFamily: 'var(--font-sans)', outline: 'none' }}
                required
              />
              <select
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                style={{ flex: 1, background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#fff', padding: '0.65rem 1rem', borderRadius: '10px', fontFamily: 'var(--font-sans)', outline: 'none' }}
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
              style={{ width: '100%', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#fff', padding: '0.65rem 1rem', borderRadius: '10px', fontFamily: 'var(--font-sans)', marginBottom: '0.75rem', outline: 'none' }}
              required
            />
            <button type="submit" className="btn btn-approve" style={{ fontSize: '0.85rem' }}>
              + Add Document to Queue
            </button>
          </form>
        )}

        {/* Queued Document Cards Grid */}
        {documents.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', background: 'rgba(0,0,0,0.25)', borderRadius: '16px', border: '1px dashed var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Queue is currently empty. Click <strong>📁 Upload PDF / TXT File</strong> to process your own documents, or click <strong>➕ Load Sample Contracts</strong>.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {documents.map((doc) => (
              <div key={doc.id} className="doc-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <span style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    📄 {doc.filename}
                  </span>
                  <button
                    onClick={() => handleRemoveDocument(doc.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', fontSize: '0.9rem' }}
                    title="Remove Document"
                  >
                    ✖
                  </button>
                </div>
                <div style={{ fontSize: '0.825rem', color: '#cbd5e1', lineHeight: '1.45', marginBottom: '0.75rem', height: '2.9em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  "{doc.content}"
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ background: 'rgba(255,255,255,0.08)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                    DEPT: {doc.metadata?.department || 'General'}
                  </span>
                  <span style={{ background: 'rgba(255,255,255,0.08)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                    SIZE: {doc.content.length} chars
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Control Bar */}
      <div style={{ marginBottom: '2.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={handleIngest} disabled={loading || documents.length === 0} style={{ padding: '0.85rem 1.75rem', fontSize: '1rem' }}>
          {loading ? '⚡ Processing Pipeline...' : `▶ Run Compliance Pipeline on ${documents.length} Document(s)`}
        </button>
        <button className="btn btn-secondary" onClick={fetchStatus}>
          🔄 Refresh State
        </button>
        {runStatus && (
          <button className="btn btn-approve" onClick={handleExportDeliverable} style={{ background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-cyan))' }}>
            📥 Download Grounded Deliverable (.md)
          </button>
        )}
        {message && <span style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem', fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{message}</span>}
      </div>

      {/* Human Approval Gate Panel */}
      <h2 style={{ fontSize: '1.35rem', fontWeight: '800', marginBottom: '1.25rem', color: '#fff' }}>Pending Human Approvals (HITL Gate)</h2>
      {pendingApprovals.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: '1.05rem', fontWeight: '600', color: '#fff', marginBottom: '0.4rem' }}>No items currently pending approval for thread <code>{threadId}</code>.</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Upload a document above and click "Run Compliance Pipeline" to pause execution at the Human Review Gate.</p>
        </div>
      ) : (
        <div className="card-grid">
          {pendingApprovals.map((item) => {
            const currentDecision = decisions[item.id] || 'APPROVED';
            return (
              <div key={item.id} className="review-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="card-tag">{item.item_type}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ITEM_ID: {item.id}</span>
                </div>
                
                <div style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#e2e8f0' }}>
                  <strong style={{ color: '#fff' }}>Finding:</strong> {item.description}
                  <br />
                  <strong style={{ color: '#fff' }}>Proposed Action:</strong> {item.proposed_action}
                </div>

                {/* Visual Text Diff Block */}
                {(item.original_text || item.proposed_text) && (
                  <div style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.825rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Visual Wording Diff</div>
                    <div style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#fca5a5', padding: '0.4rem 0.75rem', borderRadius: '6px', marginBottom: '0.4rem', borderLeft: '3px solid var(--accent-rose)' }}>
                      - {item.original_text || 'Original wording'}
                    </div>
                    <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', padding: '0.4rem 0.75rem', borderRadius: '6px', borderLeft: '3px solid var(--accent-emerald)' }}>
                      + {item.proposed_text || 'Proposed amendment wording'}
                    </div>
                  </div>
                )}

                <div className="citation-box">
                  <span>📌 Source Citation:</span>
                  <strong>{item.source_citation || 'Document Excerpt, Page 1'}</strong>
                </div>

                {/* Instant Item Trigger Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn btn-reject"
                      style={{ opacity: currentDecision === 'REJECTED' ? 1 : 0.6, fontSize: '0.8rem' }}
                      onClick={() => handleDecisionChange(item.id, 'REJECTED')}
                    >
                      {currentDecision === 'REJECTED' ? '✓ Selected Reject' : 'Select Reject'}
                    </button>
                    <button
                      className="btn btn-approve"
                      style={{ opacity: currentDecision === 'APPROVED' ? 1 : 0.6, fontSize: '0.8rem' }}
                      onClick={() => handleDecisionChange(item.id, 'APPROVED')}
                    >
                      {currentDecision === 'APPROVED' ? '✓ Selected Approve' : 'Select Approve'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <button
                      className="btn btn-reject"
                      style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
                      onClick={() => handleInstantSingleSubmit(item.id, 'REJECTED')}
                      disabled={loading}
                    >
                      ⚡ Instant Reject & Resume
                    </button>
                    <button
                      className="btn btn-approve"
                      style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
                      onClick={() => handleInstantSingleSubmit(item.id, 'APPROVED')}
                      disabled={loading}
                    >
                      ⚡ Instant Approve & Resume
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-approve" onClick={handleSubmitApprovals} disabled={loading} style={{ padding: '0.95rem 2rem', fontSize: '1.05rem', background: 'linear-gradient(135deg, #10b981, #38bdf8)' }}>
              🚀 Commit All Decisions ({pendingApprovals.length} items) & Resume Pipeline Execution
            </button>
          </div>
        </div>
      )}

      {/* Stage Execution History & Cost Analytics */}
      {runStatus && (
        <div className="glass-panel" style={{ marginTop: '3.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff' }}>📊 Stage Execution History & Cost Analytics (Behavior #10)</h3>
            <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', background: 'rgba(56, 189, 248, 0.12)', padding: '0.3rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              STATUS: {runStatus.pipeline_completed ? '✓ COMPLETED' : '● PAUSED AT GATE'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '2rem' }}>
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>EXTRACTED FACTS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--accent-cyan)', marginTop: '0.2rem' }}>{runStatus.extracted_facts_count}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>RULE FINDINGS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--accent-rose)', marginTop: '0.2rem' }}>{runStatus.rule_findings_count}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>APPROVED ITEMS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--accent-emerald)', marginTop: '0.2rem' }}>{runStatus.approved_count}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>DISMISSED ITEMS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#94a3b8', marginTop: '0.2rem' }}>{runStatus.rejected_count}</div>
            </div>
          </div>

          {/* Stage Cost Breakdown Table */}
          {runStatus.cost_metrics && runStatus.cost_metrics.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '1rem', color: '#e2e8f0' }}>Stage Breakdown (Execution Time & Token Usage)</h4>
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
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--accent-cyan)', fontWeight: '600' }}>{m.stage}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{m.execution_time_ms} ms</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{m.tokens_used}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--accent-emerald)', fontWeight: '600' }}>${m.estimated_cost_usd?.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
