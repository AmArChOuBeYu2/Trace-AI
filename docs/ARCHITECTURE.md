# TRACE-AI Architecture Specification

This document details the system design, API routing, and component interfaces of the TRACE-AI forensic platform.

## Monorepo Layout
```
/
├── backend/            # FastAPI python server
│   ├── app/
│   │   ├── main.py     # Endpoint router
│   │   ├── database.py # Supabase / SQLite layer
│   │   ├── models.py   # Database schemas
│   │   └── services/   # Independent service components
├── frontend/           # Next.js typescript client
│   ├── app/            # App Router pages
│   ├── components/     # Flow diagrams and score widget
│   └── lib/
```

## Data Management & API Flow
1. **Case Creation:** `POST /api/investigations` creates a case.
2. **Media Upload:** `POST /api/media/upload` stores the file safely to the local folder or Supabase storage, calculates SHA-256 and perceptual hashes on client and server.
3. **Forensic Run:** `POST /api/media/{id}/analyze` starts a background thread running:
   - Metadata headers reading.
   - Error Level Analysis (ELA) generation.
   - Multimodal OCR scanning.
   - Gemini Vision assessments.
   - Similar web link searches.
4. **Graph Construction:** Graph nodes and relationships are calculated chronologically and sent to React Flow via `GET /api/investigations/{id}/graph`.
5. **Dynamic Scoring:** PLIM weighted formulas combine forensic certainty indicators dynamically in the client state.
