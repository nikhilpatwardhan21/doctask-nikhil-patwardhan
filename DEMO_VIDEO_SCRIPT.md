# 🎬 Task 4 Demo Video Script (3-Minute Walkthrough)

**Project Name**: DocTask - Autonomous Agentic System  
**Candidate**: Nikhil Patwardhan  
**Target Video Duration**: 2 mins 45 secs – 3 mins  

---

## ⏱️ Video Walkthrough Outline

### Scene 1: Introduction & Architecture (0:00 – 0:30)
- **Visual**: Show browser at `http://localhost:3000` displaying the DocTask dashboard.
- **Voiceover**:
  > *"Hi, I'm Nikhil Patwardhan, and this is DocTask—an autonomous, state-resilient agentic document intelligence system built for the SuperDocs Engineer Task.*
  > *DocTask solves 'The Analyst That Never Sleeps' problem by ingesting mixed document piles, extracting grounded facts with exact page citations, evaluating compliance playbooks, and pausing at a Human-in-the-Loop review gate before committing final deliverable registers.*
  > *It is built with Python, FastAPI, LangGraph for orchestration, PostgreSQL with pgvector on port 5433, and React."*

### Scene 2: Document Ingestion & Visible Workflow Stages (0:30 – 1:15)
- **Visual**: 
  1. Click **`📁 Upload PDF / TXT File`** or **`➕ Load Samples`**.
  2. Click **`▶ Run Agentic Pipeline`**.
  3. Show the workflow progress bar move from `ingest_documents` → `examine_rules` → **`await_human_review`**.
- **Voiceover**:
  > *"Here we queue source documents—like vendor contracts, project status reports, or resumes. When we launch the pipeline, we see Behavior #1 in action: visible workflow stages moving from document ingestion to playbook examination, and then pausing cleanly at the Human Review Gate.*
  > *The system extracts facts and anchors every finding to verifiable page-level citations like 'Filename.pdf, Page 1', satisfying Behavior #5."*

### Scene 3: Human-in-the-Loop Review Gate & Deliverable Export (1:15 – 2:00)
- **Visual**:
  1. Show the review cards with **Wording Diffs** (`- Original` / `+ Proposed`).
  2. Click **`✓ Approve Finding`** on item 1, **`✖ Reject Finding`** on item 2.
  3. Click **`🚀 Commit All Decisions`**.
  4. Click **`📥 Export Grounded Deliverable Report (.MD)`** and open the exported Markdown file.
- **Voiceover**:
  > *"At the Human Review Gate (Behavior #3), a person holds the gate item-by-item. Notice the wording diff cards showing original vs proposed text amendments.*
  > *We can approve what's right and reject what's wrong. Once committed, the system outputs a grounded compliance register report where every approved amendment and dismissed finding traces directly to its source citation."*

### Scene 4: Keyless Tests & Task 2 ADR Agent (2:00 – 2:45)
- **Visual**:
  1. Switch to terminal and run `pytest backend/tests/test_pipeline.py -v`. Show 3/3 PASSED in < 1 second.
  2. Run `python builds/repo_decision_agent/adr_agent.py --dry-run`. Show generated ADR records in `DECISIONS.md`.
- **Voiceover**:
  > *"For Behavior #7, we have real keyless integration tests that run without live API keys. They test process crash recovery via PostgreSQL AsyncPostgresSaver checkpointers, concurrent run isolation, and prompt injection defense.*
  > *Finally, here is Task 2: our assigned Repository ADR Agent. It watches git commit activity, filters architectural decisions from noise, and maintains continuous decision records in DECISIONS.md.*
  > *Thank you for watching!"*

---

## 📌 Recording Checklist

- [ ] Clear 1080p screen capture (browser tab + PowerShell terminal).
- [ ] Clear voiceover audio.
- [ ] No API keys or secrets on screen.
- [ ] Include "SuperDocs Task Submission" in YouTube / Drive video title.
