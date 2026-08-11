# Task 2 Submission: Repository Architectural Decision Record (ADR) Agent

**Assigned Build (Difficulty Band S2)**: DevTools - Agent that maintains a decision record from repository activity.

---

## 🌟 Overview & Capabilities

This agent watches git repository commits, pull request discussions, and commit messages to automatically maintain a single, consolidated **Architectural Decision Record (`DECISIONS.md`)** document.

### Features
1. **Noise Filtering**: Uses rule-based filters to discard routine edits (formatting, typos, minor comments) and extract only durable architectural decisions.
2. **Superseding & Status Updates**: Updates existing decision records and marks old decisions as superseded rather than duplicating lines.
3. **Citations & Weekly Digest**: Generates exact citations pointing to git commit hashes (`commit 2ffac42`) and appends a weekly digest summary.
4. **Dry-Run Mode (`--dry-run`)**: Allows previewing decision records before writing changes.
5. **Stopping Rule**: Built with explicit loop termination criteria so it never recursively re-triggers on its own generated output.

---

## 🚀 Execution Guide

### 1. Run in Dry-Run Preview Mode (No Files Modified)
```bash
python builds/repo_decision_agent/adr_agent.py --dry-run
```

### 2. Generate / Update `DECISIONS.md`
```bash
python builds/repo_decision_agent/adr_agent.py
```

---

## 📐 Credit Line
*Built for the SuperDocs Engineer Task by Nikhil Patwardhan.*
