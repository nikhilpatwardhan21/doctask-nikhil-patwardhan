import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000/api/v1';

export default function ReviewDashboard() {
  const [threadId, setThreadId] = useState('demo-thread-101');
  const [stage, setStage] = useState('IDLE');
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [decisions, setDecisions] = useState({});
  const [runStatus, setRunStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

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

  // Start ingestion workflow
  const handleIngest = async () => {
    setLoading(true);
    setMessage('Ingesting documents and running rule check engine...');
    try {
      const payload = {
        thread_id: threadId,
        documents: [
          {
            id: 'doc-001',
            filename: 'Vendor_Contract_Amendment_v2.pdf',
            content: 'Section 4.2: Payment terms extended to Net 60. Confidentiality clause updated.',
            mime_type: 'application/pdf',
            metadata: { department: 'Legal', year: 2026 }
          },
          {
            id: 'doc-002',
            filename: 'Project_Status_Report_Q2.pdf',
            content: 'Milestone 3 delayed by 2 weeks due to third-party API integration.',
            mime_type: 'application/pdf',
            metadata: { department: 'Engineering' }
          }
        ]
      };
      
      const res = await fetch(`${API_BASE}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      setMessage(`Workflow reached Human Review Gate (Status: ${data.status})`);
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
        <div>
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

      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button className="btn btn-approve" onClick={handleIngest} disabled={loading}>
          {loading ? 'Processing...' : '▶ Start Pipeline Run'}
        </button>
        <button className="btn btn-reject" onClick={fetchStatus}>
          🔄 Refresh State
        </button>
        {message && <span style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>{message}</span>}
      </div>

      {/* Human Approval Cards */}
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Pending Human Approvals</h2>
      {pendingApprovals.length === 0 ? (
        <div className="empty-state">
          <p>No items currently pending approval for thread <code>{threadId}</code>.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Click "Start Pipeline Run" to process documents through the state machine.</p>
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
                    Source Citation: Vendor_Contract_Amendment_v2.pdf, Section 4.2
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
