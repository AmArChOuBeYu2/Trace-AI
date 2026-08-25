import os
import shutil
import uuid
import json
from typing import List, Optional
from pydantic import BaseModel
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
origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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
    try:
        run_diagnostics_check()
    except Exception as e:
        print(f"[WARNING] Startup diagnostics validation check failed: {e}")

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

# --- MEDIA UPLOAD & HARDENING ---
def validate_uploaded_file(file_bytes: bytes, filename: str, mime_type: str):
    # Validate extension & MIME type basic check
    ext = os.path.splitext(filename)[1].lower()
    allowed_exts = [".jpg", ".jpeg", ".png", ".gif", ".mp4", ".avi", ".mov", ".mkv", ".wav", ".mp3"]
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Unsupported file extension: {ext}")
        
    if not (mime_type.startswith("image/") or mime_type.startswith("video/") or mime_type.startswith("audio/")):
        raise HTTPException(status_code=400, detail=f"Unsupported media MIME type: {mime_type}")
        
    # Magic number validation (first 12 bytes)
    header = file_bytes[:12]
    
    # Block executables
    if header.startswith(b"MZ") or header.startswith(b"\x7fELF"):
        raise HTTPException(status_code=400, detail="Executable binaries are strictly prohibited.")
        
    is_jpeg = header.startswith(b"\xff\xd8\xff")
    is_png = header.startswith(b"\x89PNG\r\n\x1a\n")
    is_gif = header.startswith(b"GIF8")
    is_mp4 = b"ftyp" in header[4:12]
    is_avi = header.startswith(b"RIFF") and header[8:12] == b"AVI "
    is_wav = header.startswith(b"RIFF") and header[8:12] == b"WAVE"
    is_mp3 = header.startswith(b"ID3") or header.startswith(b"\xff\xfb") or header.startswith(b"\xff\xf3") or header.startswith(b"\xff\xf2")
    
    # Match the magic signature of common formats
    matched = False
    if mime_type.startswith("image/jpeg") and is_jpeg: matched = True
    elif mime_type.startswith("image/png") and is_png: matched = True
    elif mime_type.startswith("image/gif") and is_gif: matched = True
    elif mime_type.startswith("video/mp4") and is_mp4: matched = True
    elif mime_type.startswith("video/x-msvideo") and is_avi: matched = True
    elif mime_type.startswith("audio/wav") and is_wav: matched = True
    elif mime_type.startswith("audio/mpeg") and is_mp3: matched = True
    elif mime_type.startswith("image/") or mime_type.startswith("video/") or mime_type.startswith("audio/"):
        # Allow default signature verification bypass for other specific subtypes (like .mov, .mkv) if basic startswith checks pass, 
        # but block execution files (which were checked above)
        matched = True
        
    if not matched:
        raise HTTPException(
            status_code=400, 
            detail="File signature validation failed. The content does not match the file extension/MIME type."
        )

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
    
    # Read and validate bytes before saving to disk
    file_bytes = await file.read()
    size_bytes = len(file_bytes)
    mime_type = file.content_type or "application/octet-stream"
    
    validate_uploaded_file(file_bytes, filename, mime_type)
    
    try:
        with open(filepath, "wb") as buffer:
            buffer.write(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File save failed: {e}")
        
    # Generate hashes
    sha256 = ForensicService.calculate_sha256(filepath)
    
    # Calculate Perceptual hash for image
    media_category = "image" if mime_type.startswith("image/") else "video" if mime_type.startswith("video/") else "audio" if mime_type.startswith("audio/") else "unknown"
    p_hash = ForensicService.calculate_perceptual_hash(filepath, media_category)
    
    # Upload original to Supabase private storage
    storage_path = f"investigations/{investigation_id}/{safe_filename}"
    try:
        db_manager.upload_media_to_supabase(file_bytes, storage_path, mime_type)
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
    
    # Validate size (100MB limit)
    MAX_SIZE = 100 * 1024 * 1024
    file_bytes = await file.read()
    size_bytes = len(file_bytes)
    if size_bytes > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 100MB.")
        
    # File validation
    filename = file.filename
    validate_uploaded_file(file_bytes, filename, mime_type)
    
    # Generate safe local file name and save
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

class SignedUploadUrlRequest(BaseModel):
    filename: str
    mime_type: str

class MediaRegisterRequest(BaseModel):
    storage_path: str
    filename: str
    mime_type: str
    size_bytes: int

@app.post("/api/investigations/{inv_id}/signed-upload-url")
def get_signed_upload_url(
    inv_id: str,
    req: SignedUploadUrlRequest
):
    # Validate investigation
    inv = db_manager.get_investigation(inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
        
    safe_filename = f"{uuid.uuid4()}_{os.path.basename(req.filename)}"
    storage_path = f"investigations/{inv_id}/{safe_filename}"
    
    if db_manager.use_supabase:
        try:
            # We can request a signed upload URL via Supabase Storage API
            res = db_manager.supabase_client.storage.from_("media").create_signed_upload_url(storage_path)
            # This returns {"url": ..., "token": ...} or similar dict/object
            if isinstance(res, dict):
                url = res.get("url")
                token = res.get("token")
            else:
                url = getattr(res, "url", None)
                token = getattr(res, "token", None)
                
            return {
                "url": url,
                "token": token,
                "storage_path": storage_path,
                "provider": "supabase"
            }
        except Exception as e:
            print(f"[ERROR] failed to create signed upload url: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to generate signed upload URL: {e}")
    else:
        # Local development fallback
        return {
            "url": f"http://localhost:8000/api/investigations/{inv_id}/media-direct-fallback?storage_path={storage_path}",
            "token": "local-dev-token",
            "storage_path": storage_path,
            "provider": "local"
        }

@app.post("/api/investigations/{inv_id}/media-register")
async def register_investigation_media(
    inv_id: str,
    req: MediaRegisterRequest,
    background_tasks: BackgroundTasks
):
    # Validate investigation
    inv = db_manager.get_investigation(inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
        
    # Download file bytes from Supabase storage to a temporary file
    if db_manager.use_supabase:
        try:
            file_bytes = db_manager.supabase_client.storage.from_("media").download(req.storage_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to retrieve file from Supabase storage: {e}")
    else:
        # Local development fallback
        local_path = os.path.join(settings.UPLOAD_DIR, os.path.basename(req.storage_path))
        if not os.path.exists(local_path):
            raise HTTPException(status_code=404, detail=f"Local file not found at {local_path}")
        with open(local_path, "rb") as f:
            file_bytes = f.read()

    # Create a temporary file to run extraction
    import tempfile
    suffix = os.path.splitext(req.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(file_bytes)
        temp_filepath = temp_file.name

    try:
        # Calculate hashes
        sha256 = ForensicService.calculate_sha256(temp_filepath)
        media_category = "image" if req.mime_type.startswith("image/") else "video" if req.mime_type.startswith("video/") else "audio" if req.mime_type.startswith("audio/") else "unknown"
        p_hash = ForensicService.calculate_perceptual_hash(temp_filepath, media_category)
        
        # Create DB entry
        asset = db_manager.create_media_asset(
            investigation_id=inv_id,
            filename=req.filename,
            mime_type=req.mime_type,
            storage_path=req.storage_path,
            sha256=sha256,
            size_bytes=req.size_bytes,
            perceptual_hash=p_hash
        )
        
        db_manager.create_audit_event(
            inv_id, 
            "MEDIA_UPLOADED", 
            f"Media asset '{req.filename}' registered. SHA-256 generated: {sha256}",
            metadata_json={"media_id": asset.get("id"), "size_bytes": req.size_bytes}
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
            run_analysis_pipeline_background_with_cleanup,
            run.get("id"),
            asset.get("id"),
            temp_filepath,
            req.mime_type,
            inv_id
        )
        
        return {
            "media_asset": asset,
            "analysis_run": run
        }
    except Exception as e:
        try:
            os.unlink(temp_filepath)
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Registration and analysis launch failed: {e}")

def run_analysis_pipeline_background_with_cleanup(run_id: str, media_id: str, filepath: str, mime_type: str, inv_id: str):
    try:
        run_analysis_pipeline_background(run_id, media_id, filepath, mime_type, inv_id)
    finally:
        try:
            os.unlink(filepath)
            print(f"[STATUS] Cleaned up temporary pipeline file {filepath}")
        except Exception as e:
            print(f"[STATUS] Warning: Failed to clean up temporary file {filepath}: {e}")

@app.post("/api/investigations/{inv_id}/media-direct-fallback")
async def local_direct_upload_fallback(
    inv_id: str,
    storage_path: str,
    file: UploadFile = File(...)
):
    # For local dev direct upload fallback
    file_bytes = await file.read()
    local_path = os.path.join(settings.UPLOAD_DIR, os.path.basename(storage_path))
    with open(local_path, "wb") as f:
        f.write(file_bytes)
    return {"status": "success", "storage_path": storage_path}


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
        
        if media_category == "video":
            db_manager.create_audit_event(inv_id, "FRAME_ANALYSIS_STARTED", "Video frame extraction and temporal verification started.")
            
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
                    finding=f"Sampled Frame {f['frame_number']} at {f['timestamp']}s.",
                    severity="info",
                    confidence="high",
                    method="OpenCV video frame sampler",
                    evidence=f
                )
            db_manager.create_audit_event(inv_id, "FRAME_ANALYSIS_COMPLETED", "Video frame extraction and temporal hashing completed.")
        elif media_category == "audio":
            result = ForensicService.run_audio_forensics(filepath)
            findings.extend(result["findings"])
            metadata = result["metadata"]
            
        db_manager.create_audit_event(inv_id, "METADATA_EXTRACTED", f"Extracted forensic signals for media asset {os.path.basename(filepath)}")
        
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
        db_manager.create_audit_event(inv_id, "AI_ANALYSIS_STARTED", "Multimodal content and visual forensics request sent to Gemini.")
        try:
            ai_res = ai_analysis_service.analyze_media(
                filepath,
                mime_type,
                ocr_text,
                metadata,
                sampled_frames=sampled_frames
            )
            
            if ai_res.get("ai_status") == "UNAVAILABLE":
                findings.append({
                    "category": "ai_analysis",
                    "evidence_level": "CONCLUSION",
                    "finding": "AI-assisted analysis temporarily unavailable.",
                    "severity": "info",
                    "confidence": "low",
                    "method": "Gemini Multimodal Forensics",
                    "model": "gemini-2.5-flash",
                    "evidence": ai_res
                })
                db_manager.create_audit_event(inv_id, "AI_ANALYSIS_UNAVAILABLE", f"AI analysis skipped: {ai_res.get('reason')}")
            else:
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
                    "model": "gemini-2.5-flash",
                    "evidence": ai_res
                })
                
                db_manager.create_audit_event(inv_id, "AI_ANALYSIS_COMPLETED", f"Vision assessment pipeline finished. Found {len(ai_res.get('indicators', []))} indicators.")
        except Exception as ai_err:
            print(f"[AI ERROR] Gemini analysis failed: {ai_err}")
            db_manager.create_audit_event(inv_id, "AI_ANALYSIS_FAILED", f"Gemini Vision call failed: {ai_err}")
            ai_res = {
                "ai_status": "UNAVAILABLE",
                "reason": f"Exception in visual pipeline: {ai_err}",
                "indicators": [],
                "ai_generation_likelihood": None,
                "manipulation_likelihood": None,
                "confidence": None,
                "summary": "AI-assisted analysis temporarily unavailable."
            }
            findings.append({
                "category": "ai_analysis",
                "evidence_level": "CONCLUSION",
                "finding": "AI-assisted analysis temporarily unavailable.",
                "severity": "info",
                "confidence": "low",
                "method": "Gemini Multimodal Forensics",
                "model": "gemini-2.5-flash",
                "evidence": ai_res
            })

        # 5b. Content / Influence Intent Analysis (Structured Intent Classification)
        try:
            content_res = ai_analysis_service.analyze_content_influence(
                filepath,
                mime_type,
                ocr_text,
                metadata,
                sampled_frames=sampled_frames
            )
            
            if content_res.get("ai_status") == "UNAVAILABLE":
                findings.append({
                    "category": "content_analysis",
                    "evidence_level": "CONCLUSION",
                    "finding": "AI intent classification temporarily unavailable.",
                    "severity": "info",
                    "confidence": "low",
                    "method": "Gemini Multimodal Content Classification",
                    "model": "gemini-2.5-flash",
                    "evidence": content_res
                })
            else:
                findings.append({
                    "category": "content_analysis",
                    "evidence_level": "CONCLUSION",
                    "finding": f"Communication intent classified as {content_res.get('classification')} (Confidence: {content_res.get('confidence')}).",
                    "severity": "medium" if content_res.get("classification") in ["POLITICAL", "PERSUASIVE"] else "info",
                    "confidence": content_res.get("confidence", "medium"),
                    "method": "Gemini Multimodal Content Classification",
                    "model": "gemini-2.5-flash",
                    "evidence": content_res
                })
                
                # Merge claims/phrases from Gemini content results for web search query creation
                if content_res.get("entities") or content_res.get("text_elements"):
                    extracted_phrases = content_res.get("text_elements", {}).get("distinctive_phrases", [])
                    if extracted_phrases:
                        if "distinctive_phrases" not in entities_claims:
                            entities_claims["distinctive_phrases"] = []
                        for phrase in extracted_phrases:
                            if phrase not in entities_claims["distinctive_phrases"]:
                                entities_claims["distinctive_phrases"].append(phrase)
                                
                    extracted_claims = content_res.get("text_elements", {}).get("spoken_claims", [])
                    if extracted_claims:
                        if "claims" not in entities_claims:
                            entities_claims["claims"] = []
                        if isinstance(extracted_claims, list):
                            for claim in extracted_claims:
                                if claim not in entities_claims["claims"]:
                                    entities_claims["claims"].append(claim)
                        elif isinstance(extracted_claims, str) and extracted_claims not in entities_claims["claims"]:
                            entities_claims["claims"].append(extracted_claims)
        except Exception as cont_err:
            print(f"[CONTENT ANALYSIS ERROR] Content analysis failed: {cont_err}")
            content_res = {
                "ai_status": "UNAVAILABLE",
                "reason": f"Exception in intent pipeline: {cont_err}",
                "classification": "UNCLEAR",
                "confidence": "low",
                "supporting_evidence": "AI content analysis temporarily unavailable due to service interruption.",
                "limitations": "No connection to multimodal AI services.",
                "entities": {
                    "people": [], "organizations": [], "locations": [], "dates": [], "products": [], "events": []
                },
                "text_elements": {
                    "visible_text": ocr_text or "", "spoken_claims": "", "slogans": [], "hashtags": [], "distinctive_phrases": []
                }
            }
            findings.append({
                "category": "content_analysis",
                "evidence_level": "CONCLUSION",
                "finding": "AI intent classification temporarily unavailable.",
                "severity": "info",
                "confidence": "low",
                "method": "Gemini Multimodal Content Classification",
                "model": "gemini-2.5-flash",
                "evidence": content_res
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

        # 6. Source Discovery Tracing (Tavily + LangSearch)
        # Generate multiple search queries from claims and stylistic indicators
        queries = []
        if entities_claims:
            # 1. Distinctive phrases / slogans
            for phrase in entities_claims.get("distinctive_phrases", []):
                if phrase and phrase not in queries:
                    queries.append(phrase)
            for slogan in entities_claims.get("slogans", []):
                if slogan and slogan not in queries:
                    queries.append(slogan)
            # 2. Specific short claims
            for claim in entities_claims.get("claims", []):
                if claim and len(claim) < 120 and claim not in queries:
                    queries.append(claim)
            # 3. Entity combined parameters
            ent = entities_claims.get("entities", {})
            people = ent.get("people", [])
            orgs = ent.get("organizations", [])
            locs = ent.get("locations", [])
            if (people or orgs) and locs:
                subj = people[0] if people else orgs[0]
                queries.append(f"{subj} {locs[0]}")

        # Capping at top 3 queries
        queries = [q for q in queries if q.strip()][:3]
        if not queries:
            if ocr_text and "OCR extraction unavailable" not in ocr_text:
                queries.append(ocr_text[:100])
            else:
                fn_base = os.path.splitext(os.path.basename(filepath))[0]
                queries.append(fn_base.replace("_", " ").replace("-", " "))

        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        candidates = loop.run_until_complete(SourceTracingService.search_sources(queries, inv_id))
        
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
        
        # 8. Authoritative PLIM scoring update
        try:
            from backend.app.services.plim_service import plim_service
            plim_res = plim_service.calculate_plim_analysis(inv_id)
            overall_score = plim_res.get("overall_score")
            if overall_score is not None:
                if overall_score > 70:
                    risk_level_str = "critical"
                elif overall_score > 40:
                    risk_level_str = "medium"
                else:
                    risk_level_str = "low"
            else:
                risk_level_str = "insufficient"
            db_manager.update_investigation(inv_id, {"risk_level": risk_level_str})
        except Exception as e_plim:
            print(f"[PIPELINE PLIM ERROR] Failed to calculate and update risk level: {e_plim}")
            
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
    findings = db_manager.get_forensic_findings_by_run(run.get("id"))
    
    # Securely sign frame/ELA urls in evidence
    for f in findings:
        if f.get("evidence"):
            try:
                ev = json.loads(f["evidence"])
                if isinstance(ev, dict):
                    modified = False
                    if "frame_path" in ev and ev["frame_path"]:
                        path_key = ev["frame_path"].replace("/static/uploads/", "")
                        ev["frame_path"] = db_manager.get_media_signed_url(path_key)
                        modified = True
                    if "storage_path" in ev and ev["storage_path"]:
                        path_key = ev["storage_path"].replace("/static/uploads/", "")
                        ev["storage_path"] = db_manager.get_media_signed_url(path_key)
                        modified = True
                    if "ela_image_path" in ev and ev["ela_image_path"]:
                        path_key = ev["ela_image_path"].replace("/static/uploads/", "")
                        ev["ela_image_path"] = db_manager.get_media_signed_url(path_key)
                        modified = True
                    if modified:
                        f["evidence"] = json.dumps(ev)
            except Exception as e:
                print(f"[API] Error signing finding URLs: {e}")
                
    return findings

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
    ffmpeg_ok = bool(shutil.which("ffmpeg") or (os.name == "nt" and os.path.exists(r"C:\ffmpeg\bin\ffmpeg.exe")))
    ffprobe_ok = bool(shutil.which("ffprobe") or (os.name == "nt" and os.path.exists(r"C:\ffmpeg\bin\ffprobe.exe")))
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


# --- NOTES, INTENT, ASSESSMENT & HEALTH ENDPOINTS ---
class NotesPayload(BaseModel):
    note: str
    author: str = "System Operator"

class IntentPayload(BaseModel):
    intent: str

@app.get("/api/media/{media_id}/access-url")
def get_media_access_url(media_id: str):
    asset = db_manager.get_media_asset(media_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    
    signed_url = db_manager.get_media_signed_url(asset.get("storage_path"))
    return {
        "media_id": media_id,
        "url": signed_url,
        "expires_in": 3600,
        "mime_type": asset.get("mime_type"),
        "filename": asset.get("filename")
    }

@app.get("/api/investigations/{inv_id}/assessment")
def get_investigation_assessment(inv_id: str):
    try:
        from backend.app.services.plim_service import plim_service
        analysis = plim_service.calculate_plim_analysis(inv_id)
        return analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate assessment: {e}")

@app.get("/api/investigations/{inv_id}/notes")
def get_investigation_notes(inv_id: str):
    note_data = db_manager.get_analyst_note(inv_id)
    return note_data

@app.post("/api/investigations/{inv_id}/notes")
def save_investigation_notes(inv_id: str, payload: NotesPayload):
    note_data = db_manager.save_analyst_note(inv_id, payload.note, payload.author)
    db_manager.create_audit_event(
        investigation_id=inv_id,
        event_type="ANALYST_NOTE_UPDATED",
        description=f"Analyst investigation notes updated by {payload.author}."
    )
    return {"status": "saved", "data": note_data}

@app.post("/api/investigations/{inv_id}/intent")
def save_investigation_intent(inv_id: str, payload: IntentPayload):
    # Store analyst intent override
    inv = db_manager.get_investigation(inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
        
    try:
        db_manager.update_investigation(inv_id, {"analyst_intent": payload.intent})
    except Exception as e:
        print(f"[MAIN] Direct analyst_intent update failed: {e}. Serializing in description fallback.")
        note_data = db_manager.get_analyst_note(inv_id)
        note_text = note_data.get("note", "")
        now = datetime.utcnow()
        serialized = json.dumps({
            "note": note_text,
            "author": note_data.get("author", "System Operator"),
            "analyst_intent": payload.intent,
            "updated_at": now.isoformat(),
            "created_at": note_data.get("created_at") or now.isoformat()
        })
        db_manager.update_investigation(inv_id, {"description": serialized})
        
    db_manager.create_audit_event(
        investigation_id=inv_id,
        event_type="ANALYST_INTENT_UPDATED",
        description=f"Analyst intent override calibrated: {payload.intent}."
    )
    return {"status": "saved", "intent": payload.intent}

@app.get("/api/gemini/health")
@app.get("/api/health/gemini")
def get_gemini_health():
    from datetime import datetime
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return {
            "provider": "gemini",
            "status": "FAILED_CONFIGURATION",
            "model": "gemini-2.5-flash",
            "last_checked": datetime.utcnow().isoformat() + "Z",
            "error_code": "MISSING_KEY"
        }
    
    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=api_key)
        res = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="State 'OK' if online.",
            config=types.GenerateContentConfig(
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
            )
        )
        if res.text:
            return {
                "provider": "gemini",
                "status": "CONNECTED",
                "model": "gemini-2.5-flash",
                "last_checked": datetime.utcnow().isoformat() + "Z",
                "error_code": None
            }
    except Exception as e:
        err_msg = str(e)
        print(f"[HEALTH] Gemini connection test error: {err_msg}")
        if "API_KEY_INVALID" in err_msg or "INVALID_ARGUMENT" in err_msg or "API key not valid" in err_msg or "400" in err_msg or "403" in err_msg:
            return {
                "provider": "gemini",
                "status": "FAILED_AUTH",
                "model": "gemini-2.5-flash",
                "last_checked": datetime.utcnow().isoformat() + "Z",
                "error_code": "INVALID_KEY"
            }
        elif "503" in err_msg or "UNAVAILABLE" in err_msg or "overloaded" in err_msg or "demand" in err_msg:
            return {
                "provider": "gemini",
                "status": "TEMPORARILY_UNAVAILABLE",
                "model": "gemini-2.5-flash",
                "last_checked": datetime.utcnow().isoformat() + "Z",
                "error_code": "503"
            }
        else:
            return {
                "provider": "gemini",
                "status": "FAILED",
                "model": "gemini-2.5-flash",
                "last_checked": datetime.utcnow().isoformat() + "Z",
                "error_code": "UNKNOWN_ERROR"
            }
            
    return {
        "provider": "gemini",
        "status": "FAILED",
        "model": "gemini-2.5-flash",
        "last_checked": datetime.utcnow().isoformat() + "Z",
        "error_code": "EMPTY_RESPONSE"
    }

