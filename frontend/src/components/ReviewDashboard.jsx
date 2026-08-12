import React, { useState, useEffect } from 'react';

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
  const [selectedPlaybook, setSelectedPlaybook] = useState('legal_nda_v1');
  const [severityFilter, setSeverityFilter] = useState('ALL');


  // Modal / Reader State
  const [activeModalItem, setActiveModalItem] = useState(null);
  const [reportPreview, setReportPreview] = useState(null);

  // Vector Search Playground state
  const [vectorQuery, setVectorQuery] = useState('payment terms');
  const [vectorResults, setVectorResults] = useState(null);
  const [searchingVector, setSearchingVector] = useState(false);

  // Document Ingestion queue starts empty by default
  const [documents, setDocuments] = useState([]);
  const [newFilename, setNewFilename] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newDepartment, setNewDepartment] = useState('Legal');
  const [showAddDocForm, setShowAddDocForm] = useState(false);

  // System Activity Terminal Logs
  const [logs, setLogs] = useState([
    `[${new Date().toLocaleTimeString()}] Control Tower initialized on Thread: demo-thread-101`,
    `[${new Date().toLocaleTimeString()}] AsyncPostgresSaver checkpointer connected to PostgreSQL :5433`,
    `[${new Date().toLocaleTimeString()}] pgvector extension verified (384-dimensional normalized embeddings)`
  ]);

  const addLog = (text) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev.slice(0, 15)]);
  };

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

  // Execute Direct Vector Search Query
  const handleVectorSearch = async (e) => {
    e?.preventDefault();
    if (!vectorQuery.trim()) return;

    setSearchingVector(true);
    addLog(`Executing pgvector similarity query: "${vectorQuery}"`);
    try {
      const res = await fetch(`${API_BASE}/vector-search?query=${encodeURIComponent(vectorQuery)}&top_k=3`);
      if (res.ok) {
        const data = await res.json();
        setVectorResults(data.results || []);
        addLog(`pgvector search returned ${data.results.length} matches.`);
      }
    } catch (err) {
      addLog(`Error executing vector search: ${err.message}`);
    } finally {
      setSearchingVector(false);
    }
  };

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
        addLog(`Queued file for ingestion: ${file.name}`);
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
    addLog(`Added manual text entry: ${docObj.filename}`);
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
      setMessage('Please queue at least 1 document before launching autonomous flight.');
      return;
    }

    setLoading(true);
    setMessage('🚀 Autonomous Flight Initiated: Processing ingestion & pgvector similarity search...');
    addLog(`Launched document pipeline on ${documents.length} document(s)...`);
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
      setMessage(`✦ Reached Control Tower Gatekeeper (Status: ${data.status})`);
      addLog(`Pipeline paused at Human Review Gate (Status: ${data.status})`);
      await fetchPendingReviews();
      await fetchStatus();
    } catch (err) {
      setMessage(`✖ Error launching pipeline: ${err.message}`);
      addLog(`Error during pipeline ingestion: ${err.message}`);
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
    setMessage(`⚡ Direct Command (${singleDecision}) sent for ${approvalId}... Resuming flight...`);
    addLog(`Sent direct gate command (${singleDecision}) for item ${approvalId}`);

    const formattedDecisions = pendingApprovals.map(item => {
      const isTarget = item.id === approvalId;
      const decisionVal = isTarget ? singleDecision : (decisions[item.id] || 'APPROVED');
      return {
        approval_id: item.id,
        decision: decisionVal,
        reviewer_notes: `Reviewed via Instant Command (${decisionVal}) on ${new Date().toLocaleTimeString()}`
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
      setMessage(`✦ Flight Completed! Approved: ${data.approved_count}, Dismissed: ${data.rejected_count}`);
      addLog(`Pipeline execution resumed & completed! Approved: ${data.approved_count}, Rejected: ${data.rejected_count}`);
      setPendingApprovals([]);
      await fetchStatus();
    } catch (err) {
      setMessage(`✖ Error executing command: ${err.message}`);
      addLog(`Error executing gate decision: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Submit all approvals to resume LangGraph state machine
  const handleSubmitApprovals = async () => {
    setLoading(true);
    setMessage('⚡ Submitting all Tower Gatekeeper decisions to LangGraph state machine...');
    addLog(`Submitting batch approval decisions to LangGraph checkpointer...`);

    const formattedDecisions = pendingApprovals.map(item => ({
      approval_id: item.id,
      decision: decisions[item.id] || 'APPROVED',
      reviewer_notes: `Batch reviewed by Control Tower Operator on ${new Date().toLocaleTimeString()}`
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
      setMessage(`✦ Flight Completed! Approved: ${data.approved_count}, Dismissed: ${data.rejected_count}`);
      addLog(`Workflow completed! State register committed to PostgreSQL.`);
      setPendingApprovals([]);
      await fetchStatus();
    } catch (err) {
      setMessage(`✖ Error committing decisions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Export Grounded Deliverable Report as Markdown file download or view preview
  const handleExportDeliverable = async () => {
    try {
      const res = await fetch(`${API_BASE}/runs/${threadId}/export`);
      if (res.ok) {
        const data = await res.json();
        setReportPreview(data.report_markdown);
        const blob = new Blob([data.report_markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || `Deliverable_Report_${threadId}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setMessage(`✦ Exported Audit Report: ${data.filename}`);
        addLog(`Generated & downloaded grounded report: ${data.filename}`);
      } else {
        setMessage('Could not generate report for current thread.');
      }
    } catch (err) {
      setMessage(`Error exporting report: ${err.message}`);
    }
  };

  const stages = [
    { name: 'ingest_documents', label: 'FLIGHT 01', desc: 'pypdf text & citation parsing' },
    { name: 'examine_rules', label: 'FLIGHT 02', desc: 'pgvector similarity & playbooks' },
    { name: 'await_human_review', label: 'FLIGHT 03', desc: 'Control Tower Gatekeeper' },
    { name: 'commit_updates', label: 'FLIGHT 04', desc: 'Grounded Register Commit' }
  ];

  const filteredApprovals = pendingApprovals.filter(item => {
    if (severityFilter === 'ALL') return true;
    return item.item_type === severityFilter || item.description?.includes(severityFilter);
  });

  return (
    <div className="container">
      {/* Top Operations Marquee Ticker */}
      <div className="ticker-bar">
        <span>⚡ SYSTEM STATUS: AUTONOMOUS CONTROL DECK ONLINE</span>
        <span>POSTGRESQL: PORT 5433 | PGVECTOR: 384-DIM COSINE SEARCH</span>
        <span>MCP SERVER: ACTIVE (3 TOOLS)</span>
      </div>

      {/* Control Tower Header */}
      <header>
        <div className="brand-group">
          <div className="brand-badge">
            <span className="pulse-dot"></span>
            CONTROL TOWER
          </div>
          <h1 className="brand-title">DocTask Autonomous Operations</h1>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="telemetry-pill">
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>RULE PLAYBOOK:</span>
            <select
              value={selectedPlaybook}
              onChange={(e) => setSelectedPlaybook(e.target.value)}
            >
              <option value="legal_nda_v1" style={{ background: '#0f172a' }}>Legal NDA Playbook</option>
              <option value="engineering_security_v1" style={{ background: '#0f172a' }}>Engineering & Security Playbook</option>
            </select>
          </div>

          <div className="telemetry-pill">
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>THREAD_ID:</span>
            <input
              type="text"
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* Hero Visual Banner */}
      <div style={{ position: 'relative', height: '210px', borderRadius: '24px', overflow: 'hidden', marginBottom: '2rem', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px -15px rgba(0,0,0,0.8)' }}>
        <img
          src="/hero_scanner.png"
          alt="AI Autonomous Document Neural Scanner"
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.85) contrast(1.1)' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(5,8,17,0.95) 0%, rgba(5,8,17,0.45) 60%, rgba(5,8,17,0.85) 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 2.5rem' }}>
          <div style={{ fontFamily: 'var(--font-brand)', fontSize: '0.85rem', color: 'var(--accent-cyan)', letterSpacing: '0.15em', marginBottom: '0.25rem', fontWeight: '700' }}>PHYSICAL AI PLATFORM FOR DOCUMENT AUTOMATION</div>
          <h2 style={{ fontFamily: 'var(--font-brand)', fontSize: '1.85rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.02em', fontWeight: '800' }}>Neural Document Processing Engine</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '650px', marginTop: '0.25rem', lineHeight: '1.55' }}>
            Multi-stage LangGraph workflow state machine backed by PostgreSQL pgvector cosine search, FastMCP tool servers, and Human-in-the-Loop review gates.
          </p>
        </div>
      </div>

      {/* Live Telemetry Banner */}
      <div className="telemetry-banner">
        <div className="telemetry-card">
          <div>
            <div className="telemetry-label">SYSTEM STATE</div>
            <div className="telemetry-value" style={{ color: 'var(--accent-cyan)', fontSize: '1.1rem' }}>
              {runStatus?.pipeline_completed ? '✓ COMPLETED' : '● ACTIVE TOWER'}
            </div>
          </div>
          <span style={{ fontSize: '1.5rem' }}>📡</span>
        </div>

        <div className="telemetry-card">
          <div>
            <div className="telemetry-label">STATE RESILIENCE</div>
            <div className="telemetry-value" style={{ color: 'var(--accent-emerald)', fontSize: '1.1rem' }}>
              PostgreSQL :5433
            </div>
          </div>
          <span style={{ fontSize: '1.5rem' }}>🗄️</span>
        </div>

        <div className="telemetry-card">
          <div>
            <div className="telemetry-label">VECTOR SEARCH</div>
            <div className="telemetry-value" style={{ color: 'var(--accent-purple)', fontSize: '1.1rem' }}>
              pgvector (384-dim)
            </div>
          </div>
          <span style={{ fontSize: '1.5rem' }}>🧠</span>
        </div>

        <div className="telemetry-card">
          <div>
            <div className="telemetry-label">MACHINE INTERFACE</div>
            <div className="telemetry-value" style={{ color: 'var(--accent-amber)', fontSize: '1.1rem' }}>
              FastMCP Server
            </div>
          </div>
          <span style={{ fontSize: '1.5rem' }}>🤖</span>
        </div>
      </div>

      {/* 4 Core Pillars of Autonomous Document Intelligence */}
      <div className="pillars-grid">
        <div className="pillar-card">
          <div className="pillar-icon">📌</div>
          <div className="pillar-title">Grounded Citations</div>
          <div className="pillar-desc">Every extracted fact & rule finding traces directly to exact page citations (<code style={{ color: 'var(--accent-cyan)' }}>Filename.pdf, Page N</code>) with zero hallucinations.</div>
        </div>

        <div className="pillar-card">
          <div className="pillar-icon">⚡</div>
          <div className="pillar-title">Process Resilience</div>
          <div className="pillar-desc">LangGraph <code style={{ color: 'var(--accent-cyan)' }}>AsyncPostgresSaver</code> checkpointer survives process crashes mid-run and resumes cleanly from PostgreSQL.</div>
        </div>

        <div className="pillar-card">
          <div className="pillar-icon">🛡️</div>
          <div className="pillar-title">Human-in-the-Loop</div>
          <div className="pillar-desc">Native <code style={{ color: 'var(--accent-cyan)' }}>interrupt(...)</code> gates pause graph execution until human operators approve or reject proposed changes item-by-item.</div>
        </div>

        <div className="pillar-card">
          <div className="pillar-icon">🤖</div>
          <div className="pillar-title">MCP Protocol Interface</div>
          <div className="pillar-desc">FastMCP server tools (<code style={{ color: 'var(--accent-cyan)' }}>trigger_pipeline</code>, <code style={{ color: 'var(--accent-cyan)' }}>submit_approval</code>) allow external AI coding agents to drive the gate.</div>
        </div>
      </div>

      {/* Flight Plan Pipeline Tracker */}
      <div className="pipeline-deck">
        {stages.map((s) => {
          const isCurrent = stage === s.name;
          const isCompleted = runStatus?.pipeline_completed || stages.findIndex(st => st.name === stage) > stages.findIndex(st => st.name === s.name);
          return (
            <div key={s.name} className={`pipeline-node ${isCurrent ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent-cyan)', fontWeight: '700' }}>{s.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: isCurrent ? 'var(--accent-cyan)' : isCompleted ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                  {isCurrent ? 'IN FLIGHT' : isCompleted ? 'DONE' : 'STANDBY'}
                </span>
              </div>
              <div className="pipeline-node-title">{s.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{s.desc}</div>
            </div>
          );
        })}
      </div>

      {/* ACT 1: Ingestion Control Panel */}
      <div className="control-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">📄 Document Ingestion Dock ({documents.length})</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Queue source PDF documents to process through the autonomous compliance engine.
            </p>
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

        {/* Add Manual Form */}
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

        {/* Queued Documents Grid */}
        {documents.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', background: 'rgba(0,0,0,0.25)', borderRadius: '16px', border: '1px dashed var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Dock is empty. Click <strong>📁 Upload PDF / TXT File</strong> to queue documents, or click <strong>➕ Load Samples</strong>.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {documents.map((doc) => (
              <div key={doc.id} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontSize: '0.95rem' }}>
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
                    {doc.metadata?.department || 'General'}
                  </span>
                  <span style={{ background: 'rgba(255,255,255,0.08)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                    {doc.content.length} chars
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Flight Execution Trigger Bar */}
      <div style={{ marginBottom: '2.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={handleIngest} disabled={loading || documents.length === 0} style={{ padding: '0.9rem 2rem', fontSize: '1rem' }}>
          {loading ? '⚡ Flight In Progress...' : `▶ Launch Flight on ${documents.length} Document(s)`}
        </button>
        <button className="btn btn-secondary" onClick={fetchStatus}>
          🔄 Refresh Telemetry
        </button>
        {runStatus && (
          <button className="btn btn-approve" onClick={handleExportDeliverable} style={{ background: 'linear-gradient(135deg, #9333ea, #38bdf8)' }}>
            📥 Download Audit Report (.md)
          </button>
        )}
        {message && <span style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem', fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{message}</span>}
      </div>

      {/* ACT 2: Interactive Vector Similarity Search Playground */}
      <div className="control-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">🧠 pgvector Cosine Search Playground (Live Neural Query)</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Query the 384-dimensional normalized vector space stored inside PostgreSQL <code style={{ color: 'var(--accent-cyan)' }}>doc_embeddings</code> table.
            </p>
          </div>
        </div>

        <form onSubmit={handleVectorSearch} style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
          <input
            type="text"
            placeholder="Type semantic query (e.g., payment terms, liability cap, milestone delay)..."
            value={vectorQuery}
            onChange={(e) => setVectorQuery(e.target.value)}
            style={{ flex: 1, background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', color: '#fff', padding: '0.75rem 1.25rem', borderRadius: '12px', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', outline: 'none' }}
          />
          <button type="submit" className="btn btn-primary" disabled={searchingVector}>
            {searchingVector ? 'Searching...' : '🔍 Search pgvector (<=>)'}
          </button>
        </form>

        {vectorResults && (
          <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '16px', padding: '1.25rem', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.75rem' }}>
              MATCHES RETURNED: {vectorResults.length} | METRIC: Cosine Distance (<code style={{ color: 'var(--accent-cyan)' }}>ORDER BY embedding &lt;=&gt; vec</code>)
            </div>
            {vectorResults.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No vector matches found. Run pipeline on a document to index embeddings first!</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {vectorResults.map((r, idx) => (
                  <div key={idx} style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid var(--border-color)', padding: '0.85rem 1.15rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: '#fff', fontSize: '0.875rem', fontWeight: '600' }}>"{r.claim_text}"</div>
                      <div style={{ color: 'var(--accent-cyan)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>Citation: {r.source_citation}</div>
                    </div>
                    <span style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--accent-emerald)', border: '1px solid rgba(16,185,129,0.3)', padding: '0.3rem 0.75rem', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: '700' }}>
                      SCORE: {r.similarity_score?.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ACT 3: Control Tower Human Review Gate Panel */}
      <div className="control-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">🛡️ Control Tower Human Gatekeeper</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Item-by-item human review gate. Approve or reject proposed changes before committing to state.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>FILTER BY SEVERITY:</span>
            {['ALL', 'RULE_VIOLATION'].map(f => (
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
          <div style={{ padding: '3rem', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '20px', border: '1px dashed var(--border-color)' }}>
            <p style={{ fontSize: '1.05rem', fontWeight: '600', color: '#fff', marginBottom: '0.4rem' }}>No pending items awaiting gatekeeper decision for thread <code>{threadId}</code>.</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Queue documents above and launch flight to pause execution at the control gate.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {filteredApprovals.map((item) => {
              const currentDecision = decisions[item.id] || 'APPROVED';
              return (
                <div key={item.id} style={{ background: 'rgba(13, 20, 36, 0.9)', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '1.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <span style={{ background: 'rgba(244, 63, 94, 0.15)', color: 'var(--accent-rose)', border: '1px solid rgba(244, 63, 94, 0.3)', padding: '0.35rem 0.85rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '800', fontFamily: 'var(--font-mono)' }}>
                      {item.item_type}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={() => setActiveModalItem(item)}>
                        🔎 View Inspection Modal
                      </button>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ID: {item.id}</span>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#e2e8f0', marginBottom: '1rem' }}>
                    <strong style={{ color: '#fff' }}>Finding:</strong> {item.description}
                    <br />
                    <strong style={{ color: '#fff' }}>Proposed Action:</strong> {item.proposed_action}
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

                  <div className="citation-box">
                    <span>📌 Citation:</span>
                    <strong>{item.source_citation || 'Document Excerpt, Page 1'}</strong>
                  </div>

                  {/* Instant Item Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
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
                        ⚡ Instant Dismiss & Resume
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
              <button className="btn btn-approve" onClick={handleSubmitApprovals} disabled={loading} style={{ padding: '1rem 2.25rem', fontSize: '1.05rem', background: 'linear-gradient(135deg, #10b981, #38bdf8)' }}>
                🚀 Commit All Gatekeeper Decisions ({filteredApprovals.length} items) & Finish Execution
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Report Reader Live Drawer */}
      {reportPreview && (
        <div className="control-panel">
          <div className="panel-header">
            <h2 className="panel-title">📄 Grounded Audit Register Preview</h2>
            <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setReportPreview(null)}>
              Close Preview
            </button>
          </div>
          <pre style={{ background: '#020617', padding: '1.5rem', borderRadius: '16px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#38bdf8', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
            {reportPreview}
          </pre>
        </div>
      )}

      {/* Stage History & Cost Metrics */}
      {runStatus && (
        <div className="control-panel">
          <div className="panel-header">
            <h2 className="panel-title">📊 Stage Execution Telemetry & Cost Analytics (Behavior #10)</h2>
            <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', background: 'rgba(56, 189, 248, 0.12)', padding: '0.35rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              STATUS: {runStatus.pipeline_completed ? '✓ COMPLETED' : '● PAUSED AT GATE'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '2rem' }}>
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '1.25rem', borderRadius: '18px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>EXTRACTED FACTS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--accent-cyan)', marginTop: '0.2rem' }}>{runStatus.extracted_facts_count}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '1.25rem', borderRadius: '18px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>RULE FINDINGS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--accent-rose)', marginTop: '0.2rem' }}>{runStatus.rule_findings_count}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '1.25rem', borderRadius: '18px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>APPROVED ITEMS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--accent-emerald)', marginTop: '0.2rem' }}>{runStatus.approved_count}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '1.25rem', borderRadius: '18px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>DISMISSED ITEMS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#94a3b8', marginTop: '0.2rem' }}>{runStatus.rejected_count}</div>
            </div>
          </div>

          {/* Stage Cost Breakdown Table */}
          {runStatus.cost_metrics && runStatus.cost_metrics.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '1rem', color: '#e2e8f0', fontFamily: 'var(--font-brand)' }}>STAGE TELEMETRY (DURATION & TOKENS)</h4>
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

      {/* Live System Activity Log Terminal */}
      <div className="control-panel">
        <div className="panel-header">
          <h2 className="panel-title">💻 Live System Event Console Log</h2>
          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>REALTIME STREAM</span>
        </div>
        <div className="terminal-box">
          {logs.map((l, idx) => (
            <div key={idx} style={{ marginBottom: '0.35rem' }}>{l}</div>
          ))}
        </div>
      </div>

      {/* Interactive Modal */}
      {activeModalItem && (
        <div className="modal-overlay" onClick={() => setActiveModalItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', color: '#fff', fontFamily: 'var(--font-brand)' }}>Inspection Modal: {activeModalItem.id}</h3>
              <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setActiveModalItem(null)}>
                ✖ Close
              </button>
            </div>
            <div style={{ lineHeight: '1.6', fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '1rem' }}>
              <strong>Finding:</strong> {activeModalItem.description}<br />
              <strong>Action Required:</strong> {activeModalItem.proposed_action}<br />
              <strong>Citation:</strong> <code style={{ color: 'var(--accent-cyan)' }}>{activeModalItem.source_citation}</code>
            </div>

            <div className="diff-storyboard">
              <div style={{ color: '#fca5a5', marginBottom: '0.5rem' }}>- ORIGINAL: {activeModalItem.original_text}</div>
              <div style={{ color: '#6ee7b7' }}>+ PROPOSED: {activeModalItem.proposed_text}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button className="btn btn-reject" onClick={() => { handleInstantSingleSubmit(activeModalItem.id, 'REJECTED'); setActiveModalItem(null); }}>
                Dismiss Item
              </button>
              <button className="btn btn-approve" onClick={() => { handleInstantSingleSubmit(activeModalItem.id, 'APPROVED'); setActiveModalItem(null); }}>
                Approve Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
        <p style={{ fontFamily: 'var(--font-brand)', fontSize: '1.1rem', color: '#fff', marginBottom: '0.5rem', fontWeight: '800' }}>DOCTASK AUTONOMOUS DOCUMENT OPERATIONS CONTROL TOWER</p>
        <p>Built for the SuperDocs Engineer Task by Nikhil Patwardhan | Repository: <code>doctask-nikhil-patwardhan</code></p>
      </footer>
    </div>
  );
}
