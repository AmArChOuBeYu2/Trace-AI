# TRACE-AI
### AI-Powered Digital Forensic platform for AI-Generated Media Detection, Provenance Verification, Source Tracing & Cross-Platform Propagation Analysis

**TRACE-AI** is a forensic intelligence platform designed for the **Chandigarh Police Hackathon (Track 4)**. It accepts suspicious digital media, extracts technical forensic parameters, checks metadata and provenance, identifies similar discovered sources on the web, tracks propagation chains, and constructs a narrative shift log to produce a certified, auditable police forensic case file.

---

## 1. Core Architecture & Workflow
Instead of a simple "fake/real" classification model, **TRACE-AI** operates a detailed multi-layer analysis pipeline:

```
SUSPICIOUS MEDIA 
  ↓
[1] Cryptographic SHA-256 Hashing & Perceptual Hashing (pHash)
  ↓
[2] Technical Metadata Extraction & EXIF Tag Inspection
  ↓
[3] C2PA Content Credentials Provenance Verification
  ↓
[4] Local Forensics: Error Level Analysis (ELA), Noise Maps, Blur Scores
  ↓
[5] Multimodal OCR Text & Audio Transcript Extraction
  ↓
[6] AI Analysis: Semantic reasoning, image splice maps, and voice signatures
  ↓
[7] Source Tracing: Discovered duplicate and modified media indexing
  ↓
[8] Propagation Graph: React Flow canvas of cross-platform reposts/edits
  ↓
[9] TRACE-PLIM Scoring: Weighted overall integrity assessment & audit trails
```

---

## 2. Technical Stack
- **Frontend:** Next.js, React Flow (interactive graphs), Recharts (risk indicators), Tailwind CSS, TypeScript.
- **Backend:** Python, FastAPI, SQLAlchemy.
- **Forensics / Image Processing:** OpenCV, Pillow, exifread, imagehash.
- **Database / Storage:** Supabase PostgreSQL & Storage (Optional) / Zero-config local **SQLite** & File System (Fallback).
- **AI Core:** Gemini 2.5 Flash API (Multimodal OCR & Vision Reasoning).

---

## 3. Environment Configurations (`.env`)
Create a `.env` file in the root workspace directory:
```bash
# Supabase Persistence (Optional - Falls back to SQLite automatically if empty)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Gemini AI Vision (Optional - Activates rule-based offline diagnostics if empty)
GEMINI_API_KEY=your_gemini_api_key

# Web Search API (Optional - Simulates news/social crawls if empty)
SOURCE_SEARCH_API_KEY=your_tavily_search_api_key
```

---

## 4. Quickstart Guide

### Step 1: Initialize Database & Upload Folder
```bash
# Install Python dependencies
pip install -r backend/requirements.txt

# Run SQLite setup script
python scripts/setup_db.py
```

### Step 2: Start backend dev server
```bash
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
API docs will be available at: [http://localhost:8000/docs](http://localhost:8000/docs)

### Step 3: Start Next.js frontend
```bash
cd frontend
npm install
npm run dev
```
Open your browser at: [http://localhost:3000](http://localhost:3000)

---

## 5. Sandboxed Demo Mode
If you do not have Gemini or Supabase credentials set up, you can click on **Demo Workspace** directly from the sidebar. 
This loads a preloaded, complex investigation involving a **Viral Ballot Tampering Claim** in Sector 17, showcasing:
- Real Error Level Analysis (ELA) visual comparisons.
- Interactive React Flow charts mapping cross-platform repost pathways.
- Chronological timeline events showing narrative changes (Contextual -> Sensationalized -> Accusatory).
- Auditable operations log for forensic chain of custody verification.
