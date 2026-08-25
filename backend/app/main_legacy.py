import os
import shutil
import uuid
import json
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import subprocess
from backend.app.config import settings
from backend.app.database import db_manager
from backend.app.schemas import InvestigationCreate, InvestigationResponse, SourceCandidateCreate
from backend.app.services.forensic_service import ForensicService
from backend.app.services.ai_analysis_service import ai_analysis_service
from backend.app.services.ocr_service import OCRService
from backend.app.services.source_tracing_service import SourceTracingService
from backend.app.services.propagation_service import PropagationService
from backend.app.services.report_service import ReportService

app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup validation diagnostics
@app.on_event("startup")
def startup_validation():
    # 1. Inject C:\ffmpeg\bin into PATH if present
    ffmpeg_bin_dir = r"C:\ffmpeg\bin"
    if os.path.exists(ffmpeg_bin_dir):
        if ffmpeg_bin_dir not in os.environ["PATH"]:
            os.environ["PATH"] += os.pathsep + ffmpeg_bin_dir
            print(f"[STATUS] Injected {ffmpeg_bin_dir} into execution PATH.")
            
    # 2. Run formal environment diagnostics check
    from backend.tests.run_diagnostics import run_diagnostics_check
    run_diagnostics_check()

# Mount uploads folder as static files directory

app.mount("/static/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="static")

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "database": "supabase" if db_manager.use_supabase else "sqlite",
        "gemini_active": bool(settings.GEMINI_API_KEY)
    }

# --- INVESTIGATIONS ---
@app.post("/api/investigations", response_model=InvestigationResponse)
def create_investigation(payload: InvestigationCreate):
    inv = db_manager.create_investigation(
        title=payload.title,
        description=payload.description,
        case_number=payload.case_number,
        status=payload.status,
        risk_level=payload.risk_level
    )
    if not inv:
         raise HTTPException(status_code=400, detail="Failed to create investigation")
    db_manager.create_audit_event(inv.get("id"), "INVESTIGATION_CREATED", f"Investigation case '{payload.title}' was initialized.")
    return inv

@app.get("/api/investigations", response_model=List[InvestigationResponse])
def list_investigations():
    return db_manager.list_investigations()

@app.get("/api/investigations/{inv_id}", response_model=InvestigationResponse)
def get_investigation(inv_id: str):
    inv = db_manager.get_investigation(inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return inv

# --- MEDIA UPLOAD ---
@app.post("/api/media/upload")
async def upload_media(
    investigation_id: str = Form(...),
    file: UploadFile = File(...)
):
    # Validate investigation
    inv = db_manager.get_investigation(investigation_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
        
    # File validation
    filename = file.filename
    safe_filename = f"{uuid.uuid4()}_{os.path.basename(filename)}"
    filepath = os.path.join(settings.UPLOAD_DIR, safe_filename)
    
    try:
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File save failed: {e}")
        
    # Generate hashes
    sha256 = ForensicService.calculate_sha256(filepath)
    size_bytes = os.path.getsize(filepath)
    
    # Determine MIME
    mime_type = file.content_type or "application/octet-stream"
    
    # Calculate Perceptual hash for image
    media_category = "image" if mime_type.startswith("image/") else "video" if mime_type.startswith("video/") else "audio" if mime_type.startswith("audio/") else "unknown"
    p_hash = ForensicService.calculate_perceptual_hash(filepath, media_category)
    
    # Upload original to Supabase private storage
    storage_path = f"investigations/{investigation_id}/{safe_filename}"
    try:
        with open(filepath, "rb") as f_bytes:
            db_manager.upload_media_to_supabase(f_bytes.read(), storage_path, mime_type)
    except Exception as e_upload:
        print(f"[STORAGE] Supabase upload failed: {e_upload}")

    # Create DB entry
    asset = db_manager.create_media_asset(
        investigation_id=investigation_id,
        filename=filename,
        mime_type=mime_type,
        storage_path=storage_path, # relative storage path
        sha256=sha256,
        size_bytes=size_bytes,
        perceptual_hash=p_hash
    )
    
    db_manager.create_audit_event(
        investigation_id, 
        "MEDIA_UPLOADED", 
        f"Media asset '{filename}' uploaded. SHA-256 generated: {sha256}",
        metadata_json={"media_id": asset.get("id"), "size_bytes": size_bytes}
    )
    
    return asset

@app.post("/api/investigations/{inv_id}/media")
async def upload_investigation_media(
    inv_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    # Validate investigation
    inv = db_manager.get_investigation(inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
        
    # Validate MIME type
    mime_type = file.content_type or "application/octet-stream"
    if not (mime_type.startswith("image/") or mime_type.startswith("video/") or mime_type.startswith("audio/")):
        raise HTTPException(status_code=400, detail=f"Unsupported media MIME type: {mime_type}")
        
    # Validate size (100MB limit)
    MAX_SIZE = 100 * 1024 * 1024
    file_bytes = await file.read()
    size_bytes = len(file_bytes)
    if size_bytes > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 100MB.")
        
    # Generate safe local file name and save
    filename = file.filename
    safe_filename = f"{uuid.uuid4()}_{os.path.basename(filename)}"
    filepath = os.path.join(settings.UPLOAD_DIR, safe_filename)
    try:
        with open(filepath, "wb") as buffer:
            buffer.write(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file locally: {e}")
        
    # Calculate hashes
    sha256 = ForensicService.calculate_sha256(filepath)
    media_category = "image" if mime_type.startswith("image/") else "video" if mime_type.startswith("video/") else "audio" if mime_type.startswith("audio/") else "unknown"
    p_hash = ForensicService.calculate_perceptual_hash(filepath, media_category)
    
    # Upload original to Supabase private storage
    storage_path = f"investigations/{inv_id}/{safe_filename}"
    db_manager.upload_media_to_supabase(file_bytes, storage_path, mime_type)

    # Create DB entry
    asset = db_manager.create_media_asset(
        investigation_id=inv_id,
        filename=filename,
        mime_type=mime_type,
        storage_path=storage_path, # relative storage path
        sha256=sha256,
        size_bytes=size_bytes,
        perceptual_hash=p_hash
    )
    
    db_manager.create_audit_event(
        inv_id, 
        "MEDIA_UPLOADED", 
        f"Media asset '{filename}' uploaded. SHA-256 generated: {sha256}",
        metadata_json={"media_id": asset.get("id"), "size_bytes": size_bytes}
    )
    
    # Create analysis run record
    run = db_manager.create_analysis_run(inv_id, asset.get("id"))
    
    db_manager.create_audit_event(
        inv_id,
        "ANALYSIS_STARTED",
        f"Processing pipeline initiated for run {run.get('id')}."
    )
    
    # Trigger background processing
    background_tasks.add_task(
        run_analysis_pipeline_background,
        run.get("id"),
        asset.get("id"),
        filepath,
        mime_type,
        inv_id
    )
    
    return {
        "media_asset": asset,
        "analysis_run": run
    }

@app.get("/api/investigations/{inv_id}/status")
def get_investigation_status(inv_id: str):
    inv = db_manager.get_investigation(inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
        
    assets = db_manager.get_media_assets_by_investigation(inv_id)
    if not assets:
        return {
            "investigation_id": inv_id,
            "status": "pending_upload",
            "message": "No media assets uploaded yet."
        }
        
    # Retrieve the latest analysis run for the main asset
    main_asset = assets[0]
    run = db_manager.get_latest_analysis_run(main_asset.get("id"))
    if not run:
        return {
            "investigation_id": inv_id,
            "status": "pending_analysis",
            "message": "Media uploaded but analysis not started."
        }
        
    return {
        "investigation_id": inv_id,
        "status": run.get("status"),
        "started_at": run.get("started_at"),
        "completed_at": run.get("completed_at"),
        "summary": run.get("summary")
    }

@app.get("/api/media/{media_id}")
def get_media_asset(media_id: str):
    asset = db_manager.get_media_asset(media_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    return asset

@app.get("/api/investigations/{inv_id}/media")
def get_investigation_media(inv_id: str):
    inv = db_manager.get_investigation(inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return db_manager.get_media_assets_by_investigation(inv_id)


# --- PIPELINE ANALYSIS ---
def run_analysis_pipeline_background(run_id: str, media_id: str, filepath: str, mime_type: str, inv_id: str):
    try:
        # Determine Category
        media_category = "image"
        if mime_type.startswith("video/"):
            media_category = "video"
        elif mime_type.startswith("audio/"):
            media_category = "audio"
            
        # 1. Forensic Signal Extraction
        findings = []
        metadata = {}
        sampled_frames = []
        
        if media_category == "image":
            result = ForensicService.run_image_forensics(filepath)
            findings.extend(result["findings"])
            metadata = result["metadata"]
        elif media_category == "video":
            result = ForensicService.run_video_forensics(filepath)
            findings.extend(result["findings"])
            metadata = result["metadata"]
            
            # Record sampled frames absolute paths
            for f in result.get("frames", []):
                rel_frame = f["storage_path"].replace("/static/uploads/", "")
                frame_abs = os.path.join(settings.UPLOAD_DIR, rel_frame)
                sampled_frames.append(frame_abs)
                
                # Save frame details as OBSERVED findings
                db_manager.create_forensic_finding(
                    analysis_run_id=run_id,
                    category="temporal",
                    evidence_level="OBSERVED",
                    finding=f"Sampled Frame {f['frame_index']} at {f['timestamp_s']}s.",
                    severity="info",
                    confidence="high",
                    method="OpenCV video frame sampler",
                    evidence={"frame_path": f["storage_path"], "brightness": f["brightness"], "variance": f["variance"], "perceptual_hash": f.get("perceptual_hash"), "average_hash": f.get("average_hash")}
                )
        elif media_category == "audio":
            result = ForensicService.run_audio_forensics(filepath)
            findings.extend(result["findings"])
            metadata = result["metadata"]
            
        db_manager.create_audit_event(inv_id, "METADATA_EXTRACTED", f"Extracted forensic signals for media asset {os.path.basename(filepath)}")
        db_manager.create_audit_event(inv_id, "FRAME_ANALYSIS_COMPLETED", "Video frame extraction and temporal hashing completed.")
        
        # 2. C2PA Provenance validation
        from backend.app.services.c2pa_service import c2pa_service
        c2pa_res = c2pa_service.inspect_c2pa(filepath)
        db_manager.create_c2pa_record(
            media_asset_id=media_id,
            status=c2pa_res["status"],
            issuer=c2pa_res["issuer"],
            claim=c2pa_res["claim"],
            verification_result=c2pa_res["verification_result"],
            raw_summary=json.dumps(c2pa_res["raw_summary"])
        )
        db_manager.create_audit_event(inv_id, "C2PA_CHECKED", f"C2PA credentials scanned. Status: {c2pa_res['status']}.")

        # 3. OCR Text Extraction
        ocr_text = None
        if media_category in ["image", "video"]:
            ocr_result = OCRService.extract_text(filepath, mime_type)
            ocr_text = ocr_result.get("text")
            if ocr_text and ocr_result.get("confidence", 0.0) > 0.0:
                findings.append({
                    "category": "ocr",
                    "evidence_level": "OBSERVED",
                    "finding": f"Extracted visual text: '{ocr_text[:80]}...'",
                    "severity": "info",
                    "confidence": "high" if ocr_result.get("confidence", 0) > 0.8 else "medium",
                    "method": "OCR Engine",
                    "evidence": ocr_result
                })
                db_manager.create_audit_event(inv_id, "OCR_COMPLETED", "OCR text parsing run successfully.")

        # 4. Text / Claim & Entity Extraction
        entities_claims = {}
        if ocr_text and "OCR extraction unavailable" not in ocr_text:
            entities_claims = OCRService.extract_entities_and_claims(ocr_text)
            
            # Save narrative versions / claims
            for idx, claim in enumerate(entities_claims.get("claims", [])):
                db_manager.create_narrative_version(
                    investigation_id=inv_id,
                    node_id=f"claim_{idx}",
                    text=claim,
                    summary=f"Extracted claim {idx+1}",
                    change_type="observed"
                )

        # 5. Gemini Visual & AI Forensics
        ai_res = ai_analysis_service.analyze_media(
            filepath,
            mime_type,
            ocr_text,
            metadata,
            sampled_frames=sampled_frames
        )
        
        # Save AI Findings
        for ind in ai_res.get("indicators", []):
            findings.append(ind)
            
        # Add a conclusion finding for overall risk
        findings.append({
            "category": "ai_analysis",
            "evidence_level": "CONCLUSION",
            "finding": f"AI likelihood: {int(ai_res.get('ai_generation_likelihood', 0)*100)}%, Editing trace likelihood: {int(ai_res.get('manipulation_likelihood', 0)*100)}%.",
            "severity": "high" if ai_res.get('manipulation_likelihood', 0) > 0.6 or ai_res.get('ai_generation_likelihood', 0) > 0.6 else "medium",
            "confidence": ai_res.get("confidence", "medium"),
            "method": "Gemini Multimodal Forensics",
            "model": "gemini-2.5-flash" if settings.GEMINI_API_KEY else "local-rule-engine",
            "evidence": ai_res
        })
        
        # Save all findings in DB
        for f in findings:
            db_manager.create_forensic_finding(
                analysis_run_id=run_id,
                category=f.get("category"),
                evidence_level=f.get("evidence_level"),
                finding=f.get("finding"),
                severity=f.get("severity", "info"),
                confidence=f.get("confidence", "medium"),
                method=f.get("method"),
                model=f.get("model"),
                evidence=f.get("evidence")
            )
            
        db_manager.create_audit_event(inv_id, "AI_ANALYSIS_COMPLETED", "Vision assessment pipeline finished.")
        
        # 6. Source Discovery Tracing (Tavily + LangSearch)
        search_query = "election commission" # default broad backup
        if entities_claims and entities_claims.get("distinctive_phrases"):
            search_query = entities_claims["distinctive_phrases"][0]
        elif ocr_text and "OCR extraction unavailable" not in ocr_text:
            search_query = ocr_text[:100]
        else:
            fn_base = os.path.splitext(os.path.basename(filepath))[0]
            search_query = fn_base.replace("_", " ").replace("-", " ")
            
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        candidates = loop.run_until_complete(SourceTracingService.search_sources(search_query, inv_id))
        
        # Save candidates
        for cand in candidates:
            db_manager.create_source_candidate(
                investigation_id=inv_id,
                url=cand.get("url"),
                domain=cand.get("domain"),
                title=cand.get("title"),
                platform=cand.get("platform"),
                publication_time=cand.get("publication_time"),
                discovery_method=cand.get("discovery_method"),
                similarity_score=cand.get("similarity_score"),
                confidence=cand.get("confidence"),
                evidence=cand.get("evidence")
            )
            
        # 7. Rebuild propagation graph
        PropagationService.generate_propagation_graph(inv_id)
        db_manager.create_audit_event(inv_id, "PROPAGATION_GRAPH_CREATED", "Propagation graph auto-generated.")
        
        # Compile summary and complete run
        summary = ai_res.get("summary", "Analysis completed successfully.")
        db_manager.update_analysis_run(run_id, "completed", summary)
        
    except Exception as e:
        print(f"[PIPELINE ERROR] Analysis run failed: {e}")
        db_manager.update_analysis_run(run_id, "failed", f"Failed: {e}")
        db_manager.create_audit_event(inv_id, "ANALYSIS_FAILED", f"Errors during pipeline processing: {e}")

@app.post("/api/media/{media_id}/analyze")
def analyze_media(media_id: str, background_tasks: BackgroundTasks):
    asset = db_manager.get_media_asset(media_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
        
    # Get absolute filepath
    rel_path = asset.get("storage_path").replace("/static/uploads/", "")
    filepath = os.path.join(settings.UPLOAD_DIR, rel_path)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"File not found on disk at {filepath}")
        
    # Check if analysis already exists
    existing = db_manager.get_latest_analysis_run(media_id)
    if existing and existing.get("status") == "running":
        return existing
        
    # Create run
    run = db_manager.create_analysis_run(asset.get("investigation_id"), media_id)
    
    db_manager.create_audit_event(
        asset.get("investigation_id"), 
        "ANALYSIS_STARTED", 
        f"Processing pipeline initiated for run {run.get('id')}."
    )
    
    # Run background processing
    background_tasks.add_task(
        run_analysis_pipeline_background,
        run.get("id"),
        media_id,
        filepath,
        asset.get("mime_type"),
        asset.get("investigation_id")
    )
    
    return run

@app.get("/api/media/{media_id}/analysis")
def get_media_analysis(media_id: str):
    run = db_manager.get_latest_analysis_run(media_id)
    if not run:
         return {"status": "not_started"}
    return run

@app.get("/api/media/{media_id}/findings")
def get_media_findings(media_id: str):
    run = db_manager.get_latest_analysis_run(media_id)
    if not run:
         return []
    return db_manager.get_forensic_findings_by_run(run.get("id"))

@app.get("/api/media/{media_id}/provenance")
def get_media_provenance(media_id: str):
    rec = db_manager.get_c2pa_record_by_media(media_id)
    if not rec:
         return {"status": "NOT_PRESENT"}
    return rec

# --- SOURCE TRACING & GRAPH ---
@app.get("/api/investigations/{inv_id}/sources")
def get_investigation_sources(inv_id: str):
    return db_manager.get_source_candidates(inv_id)

@app.get("/api/investigations/{inv_id}/graph")
def get_investigation_graph(inv_id: str):
    return PropagationService.generate_propagation_graph(inv_id)

@app.get("/api/investigations/{inv_id}/narrative")
def get_investigation_narrative(inv_id: str):
    versions = db_manager.get_narrative_versions(inv_id)
    # If versions exist, we compare them
    analysis = ai_analysis_service.generate_narrative_evolution(versions)
    return {
        "versions": versions,
        "analysis": analysis
    }

@app.post("/api/investigations/{inv_id}/source-search")
async def trigger_source_search(inv_id: str, keywords: str = Form(...)):
    db_manager.create_audit_event(inv_id, "SOURCE_SEARCH_EXECUTED", f"Manual web keywords search triggered for '{keywords}'.")
    candidates = await SourceTracingService.search_sources(keywords, inv_id)
    
    stored = []
    for cand in candidates:
        res = db_manager.create_source_candidate(
            investigation_id=inv_id,
            url=cand.get("url"),
            domain=cand.get("domain"),
            title=cand.get("title"),
            platform=cand.get("platform"),
            publication_time=cand.get("publication_time"),
            discovery_method=cand.get("discovery_method"),
            similarity_score=cand.get("similarity_score"),
            confidence=cand.get("confidence"),
            evidence=cand.get("evidence")
        )
        stored.append(res)
        
    # Rebuild graph
    PropagationService.generate_propagation_graph(inv_id)
    
    return stored

@app.get("/api/investigations/{inv_id}/audit")
def get_investigation_audit(inv_id: str):
    return db_manager.get_audit_events(inv_id)

# --- REPORT GENERATION ---
@app.post("/api/investigations/{inv_id}/report")
def create_investigation_report(inv_id: str):
    report_path = ReportService.generate_pdf_report(inv_id)
    return {"report_path": report_path}

@app.get("/api/investigations/{inv_id}/report")
def get_investigation_report(inv_id: str):
    reps = db_manager.get_reports_by_investigation(inv_id)
    if not reps:
        raise HTTPException(status_code=404, detail="No report generated yet")
    # Return latest report JSON data
    report_rel_path = reps[-1].get("report_path")
    report_abs_path = os.path.join(settings.UPLOAD_DIR, report_rel_path.replace("/static/uploads/", ""))
    
    if os.path.exists(report_abs_path):
        with open(report_abs_path, "r") as f:
            return json.load(f)
    else:
        raise HTTPException(status_code=404, detail="Report file not found on disk")


# --- SETTINGS DIAGNOSTICS & WEIGHTS PERSISTENCE ---
from pydantic import BaseModel

class WeightsPayload(BaseModel):
    media_manipulation: int
    metadata_inconsistency: int
    propagation_anomaly: int
    narrative_evolution: int

@app.get("/api/settings/diagnostics")
def get_settings_diagnostics():
    import shutil
    ffmpeg_ok = bool(shutil.which("ffmpeg") or os.path.exists(r"C:\ffmpeg\bin\ffmpeg.exe"))
    ffprobe_ok = bool(shutil.which("ffprobe") or os.path.exists(r"C:\ffmpeg\bin\ffprobe.exe"))
    return {
        "gemini": "connected" if settings.GEMINI_API_KEY else "disconnected",
        "supabase": "connected" if db_manager.use_supabase else "disconnected",
        "langsearch": "connected" if os.getenv("LANGSEARCH_API_KEY") else "disconnected",
        "tavily": "connected" if os.getenv("SOURCE_SEARCH_API_KEY") else "disconnected",
        "ffmpeg": "connected" if ffmpeg_ok else "disconnected",
        "ffprobe": "connected" if ffprobe_ok else "disconnected"
    }

@app.get("/api/settings/weights")
def get_settings_weights():
    weights_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "risk_weights.json")
    if os.path.exists(weights_file):
        try:
            with open(weights_file, "r") as f:
                return json.load(f)
        except:
            pass
    return {
        "media_manipulation": 35,
        "metadata_inconsistency": 20,
        "propagation_anomaly": 20,
        "narrative_evolution": 25
    }

@app.post("/api/settings/weights")
def save_settings_weights(payload: WeightsPayload):
    total = (payload.media_manipulation + payload.metadata_inconsistency + 
             payload.propagation_anomaly + payload.narrative_evolution)
    if total != 100:
        raise HTTPException(status_code=400, detail="Weights must sum to exactly 100%")
        
    weights_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "risk_weights.json")
    try:
        with open(weights_file, "w") as f:
            json.dump(payload.dict(), f)
        return {"status": "saved", "weights": payload.dict()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to persist configuration: {str(e)}")

