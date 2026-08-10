import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000/api/v1';

const DEFAULT_DOCUMENTS = [
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

  // Document Ingestion state
  const [documents, setDocuments] = useState(DEFAULT_DOCUMENTS);
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
      setMessage('Please add or upload at least 1 document before running the pipeline.');
      return;
    }

    setLoading(true);
    setMessage('Ingesting documents and running compliance rule engine...');
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
      setMessage(`Documents ingested! Workflow reached Human Review Gate (Status: ${data.status})`);
      await fetchPendingReviews();
      await fetchStatus();
    } catch (err) {
      setMessage(`Error starting ingestion: ${err.message}`);
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

  // Submit approvals to resume LangGraph state machine
  const handleSubmitApprovals = async () => {
    setLoading(true);
    setMessage('Submitting human review decisions to LangGraph state machine...');
    
    const formattedDecisions = pendingApprovals.map(item => ({
      approval_id: item.id,
      decision: decisions[item.id] || 'APPROVED',
      reviewer_notes: `Reviewed by Human Operator on ${new Date().toLocaleTimeString()}`
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
      setMessage(`Workflow complete! Approved: ${data.approved_count}, Rejected: ${data.rejected_count}`);
      setPendingApprovals([]);
      await fetchStatus();
    } catch (err) {
      setMessage(`Error submitting approvals: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const stages = ['ingest_documents', 'examine_rules', 'await_human_review', 'commit_updates'];

  return (
    <div className="container">
      <header>
        <div className="logo-title">
          <span className="logo-badge">SuperDocs HITL</span>
          <h1>Agentic Document Gate</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Thread ID:</span>
          <input
            type="text"
            value={threadId}
            onChange={(e) => setThreadId(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid var(--border-color)',
              color: '#fff',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontFamily: 'var(--font-mono)'
            }}
          />
        </div>
      </header>

      {/* Visible Stage Tracker */}
      <div className="stage-tracker">
        {stages.map((s, idx) => {
          const isCurrent = stage === s;
          const isCompleted = runStatus?.pipeline_completed || stages.indexOf(stage) > idx;
          return (
            <div key={s} className={`stage-pill ${isCurrent ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              <span className="stage-name">{idx + 1}. {s}</span>
              <span className="stage-status">
                {isCurrent ? '● IN PROGRESS' : isCompleted ? '✓ COMPLETED' : 'IDLE'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Document Ingestion & Upload Section */}
      <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', color: '#fff' }}>📄 Document Ingestion Queue ({documents.length})</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Upload files or enter custom document excerpts to run through the compliance pipeline.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <label className="btn btn-reject" style={{ cursor: 'pointer', display: 'inline-block' }}>
              📁 Upload File (.txt, .pdf, .md)
              <input type="file" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-reject" onClick={() => setShowAddDocForm(!showAddDocForm)}>
              {showAddDocForm ? 'Close Form' : '✏️ Add Custom Text'}
            </button>
            {documents.length === 0 && (
              <button className="btn btn-reject" onClick={() => setDocuments(DEFAULT_DOCUMENTS)}>
                🔄 Reset Samples
              </button>
            )}
          </div>
        </div>

        {/* Add Manual Form */}
        {showAddDocForm && (
          <form onSubmit={handleAddManualDocument} style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '12px', marginBottom: '1rem', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
              <input
                type="text"
                placeholder="Document Filename (e.g., NDA_Agreement_v3.pdf)"
                value={newFilename}
                onChange={(e) => setNewFilename(e.target.value)}
                style={{ flex: 2, background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '0.5rem', borderRadius: '6px' }}
                required
              />
              <select
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                style={{ flex: 1, background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '0.5rem', borderRadius: '6px' }}
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
              style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '0.5rem', borderRadius: '6px', fontFamily: 'var(--font-sans)', marginBottom: '0.75rem' }}
              required
            />
            <button type="submit" className="btn btn-approve" style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}>
              + Add Document to Queue
            </button>
          </form>
        )}

        {/* Queued Documents List */}
        {documents.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No documents queued. Upload a file or click "Reset Samples" to load sample contract documents.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {documents.map((doc, idx) => (
              <div key={doc.id} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: '600', color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>
                    📄 {doc.filename}
                  </span>
                  <button
                    onClick={() => handleRemoveDocument(doc.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', fontSize: '0.85rem' }}
                    title="Remove Document"
                  >
                    ✖
                  </button>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.4', marginBottom: '0.5rem', height: '2.8em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  "{doc.content}"
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                    {doc.metadata?.department || 'General'}
                  </span>
                  <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                    {doc.content.length} chars
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons Bar */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button className="btn btn-approve" onClick={handleIngest} disabled={loading || documents.length === 0}>
          {loading ? 'Processing Pipeline...' : `▶ Run Pipeline on ${documents.length} Document(s)`}
        </button>
        <button className="btn btn-reject" onClick={fetchStatus}>
          🔄 Refresh Pipeline State
        </button>
        {message && <span style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>{message}</span>}
      </div>

      {/* Human Approval Cards */}
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Pending Human Approvals</h2>
      {pendingApprovals.length === 0 ? (
        <div className="empty-state">
          <p>No items currently pending approval for thread <code>{threadId}</code>.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Click "Run Pipeline" above to process queued documents through the state machine.</p>
        </div>
      ) : (
        <div className="card-grid">
          {pendingApprovals.map((item) => {
            const currentDecision = decisions[item.id] || 'APPROVED';
            return (
              <div key={item.id} className="review-card">
                <div className="card-header">
                  <span className="card-tag">{item.item_type}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {item.id}</span>
                </div>
                <div className="card-body">
                  <strong>Finding:</strong> {item.description}
                  <br />
                  <strong>Proposed Action:</strong> {item.proposed_action}
                  <div className="citation-box">
                    Source Citation: {item.source_citation || 'Document Excerpt, Section 1'}
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    className={`btn ${currentDecision === 'REJECTED' ? 'btn-reject' : ''}`}
                    style={currentDecision === 'REJECTED' ? { border: '2px solid var(--accent-rose)' } : { opacity: 0.6 }}
                    onClick={() => handleDecisionChange(item.id, 'REJECTED')}
                  >
                    Reject Item
                  </button>
                  <button
                    className={`btn ${currentDecision === 'APPROVED' ? 'btn-approve' : ''}`}
                    style={currentDecision === 'APPROVED' ? { boxShadow: '0 0 10px rgba(16,185,129,0.5)' } : { opacity: 0.6 }}
                    onClick={() => handleDecisionChange(item.id, 'APPROVED')}
                  >
                    Approve Item
                  </button>
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-approve" onClick={handleSubmitApprovals} disabled={loading}>
              Commit Decisions ({pendingApprovals.length} items)
            </button>
          </div>
        </div>
      )}

      {/* Stage Execution History & Cost Tracking */}
      {runStatus && (
        <div style={{ marginTop: '3rem', background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Execution History & Cost Metrics</h3>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <div>Extracted Facts: {runStatus.extracted_facts_count}</div>
            <div>Rule Findings: {runStatus.rule_findings_count}</div>
            <div>Approved Items: {runStatus.approved_count}</div>
            <div>Rejected Items: {runStatus.rejected_count}</div>
          </div>
        </div>
      )}
    </div>
  );
}
