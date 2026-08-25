# TRACE-AI Deployment Manual & Vercel Multi-Service Guide

This document outlines the architecture, configuration, and verification steps required for deploying both the Next.js frontend and FastAPI backend.

---

## 1. System Architecture

To avoid request/response payload limits on Vercel (4.5 MB maximum), the media ingestion workflow is optimized to upload directly to storage:

```
[Browser Client]
   |
   +-- 1. POST /api/backend/api/investigations/{id}/signed-upload-url --> [FastAPI Backend]
   |                                                                          | (Generates url & token)
   <------------------ 2. Signed Upload URL response ------------------------+
   |
   +-- 3. PUT Binary Payload directly (Bypasses Vercel Limit) ----------> [Supabase Storage]
   |
   +-- 4. POST /api/backend/api/investigations/{id}/media-register ----> [FastAPI Backend]
                                                                              | (Downloads & analyzes file)
```

---

## 2. Infrastructure Status & Blocker Report

### FRONTEND: READY
- Next.js application compiles cleanly and builds successfully in production mode (`npm run build` succeeds).
- Centralized `API_BASE_URL` reads dynamically from Vercel configuration environment variables.

### BACKEND: BLOCKED ON VERCEL (RECOMMENDED HOST: VPS/VM)
- **FastAPI ASGI Discoverability**: Discoverable via `api/backend/index.py` for routing.
- **Serverless Time Limits**: Vercel Serverless Functions have a maximum execution time limit (10s on Hobby, 60s on Pro). Background forensics tasks (narrative sweeps, video hashing, Tavily lookups) exceed this and will trigger `504 Gateway Timeout` errors.

### FFMPEG & FFPROBE: BLOCKED ON VERCEL
- **Binary Availability Blocker**: Vercel Serverless runtime does **NOT** package `ffmpeg` or `ffprobe`. 
- **Package Size Blocker**: Static FFmpeg binaries (75MB+ each) committed directly exceed Vercel's strict deployment bundle sizes (50MB zipped / 250MB uncompressed).

### SUPABASE STORAGE DIRECT UPLOAD: READY
- Configured direct-to-storage upload using presigned upload URLs. Files upload directly from the client to the private storage bucket.

### API ROUTING: READY
- Configured same-origin API routes using `vercel.json` rewrites:
  - `/` $\rightarrow$ `/frontend` (Next.js)
  - `/api/backend/*` $\rightarrow$ `/api/backend/index.py` (FastAPI Serverless Function)

---

## 3. Recommended Production Architecture

To deploy TRACE-AI securely in production without hitting serverless blockers:

1. **Deploy Frontend on Vercel**:
   - Framework Preset: `Next.js`
   - Build Command: `npm run build`
   - Env Var: `NEXT_PUBLIC_API_BASE_URL` = `https://api.trace-ai.yourdomain.com`

2. **Deploy Backend on VPS/VM (AWS EC2 / DigitalOcean / Render)**:
   - Operating System: Linux (Ubuntu 22.04 LTS)
   - System dependency: `apt-get install ffmpeg`
   - Env Var:
     * `SUPABASE_URL` = `<Supabase Project Endpoint>`
     * `SUPABASE_ANON_KEY` = `<Supabase Client Key>`
     * `SUPABASE_SERVICE_ROLE_KEY` = `<Supabase Admin Secret>`
     * `GEMINI_API_KEY` = `<Google AI Studio Key>`
     * `ALLOWED_ORIGINS` = `https://trace-ai.vercel.app` (Your frontend URL)

---

## 4. Supabase Storage Configuration
1. Create a bucket named `media`.
2. Keep the bucket **Private** (never make it public).
3. Ensure RLS policies permit signed uploads or utilize backend-generated presigned upload tokens.
