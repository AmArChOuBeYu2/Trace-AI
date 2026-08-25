import json
import os
import asyncio
from datetime import datetime, timezone

from fastapi import BackgroundTasks
from backend.app.config import settings
from backend.app.database import db_manager
from backend.app.services.gemini_runtime import gemini_runtime
from backend.app.services.ai_analysis_service import ai_analysis_service
from backend.app.services.forensic_service import ForensicService
from backend.app.services.ocr_service import OCRService
from backend.app.services.source_tracing_service import SourceTracingService
from backend.app.services.propagation_service import PropagationService

from backend.app import main_legacy as legacy

app = legacy.app


def _replace_endpoint(path: str, endpoint):
    for route in app.routes:
        if getattr(route, "path", None) == path and hasattr(route, "endpoint"):
            route.endpoint = endpoint


async def _resilient_upload(inv_id: str, background_tasks: BackgroundTasks, file):
    # Keep the existing upload behavior while ensuring the global pipeline
    # function resolved by the legacy route points to the resilient version.
    return await legacy.upload_investigation_media(inv_id, background_tasks, file)


def resilient_pipeline(run_id: str, media_id: str, filepath: str, mime_type: str, inv_id: str):
    try:
        media_category = "image" if mime_type.startswith("image/") else "video" if mime_type.startswith("video/") else "audio"
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
            for frame in result.get("frames", []):
                rel_frame = frame["storage_path"].replace("/static/uploads/", "")
                frame_abs = os.path.join(settings.UPLOAD_DIR, rel_frame)
                sampled_frames.append(frame_abs)
                db_manager.create_forensic_finding(
                    analysis_run_id=run_id,
                    category="temporal",
                    evidence_level="OBSERVED",
                    finding=f"Sampled Frame {frame['frame_index']} at {frame['timestamp_s']}s.",
                    severity="info",
                    confidence="high",
                    method="OpenCV video frame sampler",
                    evidence={"frame_path": frame["storage_path"], "brightness": frame["brightness"], "variance": frame["variance"], "perceptual_hash": frame.get("perceptual_hash"), "average_hash": frame.get("average_hash")},
                )
        else:
            result = ForensicService.run_audio_forensics(filepath)
            findings.extend(result["findings"])
            metadata = result["metadata"]

        db_manager.create_audit_event(inv_id, "METADATA_EXTRACTED", f"Extracted forensic signals for media asset {os.path.basename(filepath)}")
        db_manager.create_audit_event(inv_id, "FRAME_ANALYSIS_COMPLETED", "Video frame extraction and temporal hashing completed.")

        from backend.app.services.c2pa_service import c2pa_service
        c2pa_res = c2pa_service.inspect_c2pa(filepath)
        db_manager.create_c2pa_record(media_asset_id=media_id, status=c2pa_res["status"], issuer=c2pa_res["issuer"], claim=c2pa_res["claim"], verification_result=c2pa_res["verification_result"], raw_summary=json.dumps(c2pa_res["raw_summary"]))
        db_manager.create_audit_event(inv_id, "C2PA_CHECKED", f"C2PA credentials scanned. Status: {c2pa_res['status']}.")

        ocr_text = None
        if media_category in ["image", "video"]:
            ocr_result = OCRService.extract_text(filepath, mime_type)
            ocr_text = ocr_result.get("text")
            if ocr_text and ocr_result.get("confidence", 0.0) > 0.0:
                findings.append({"category": "ocr", "evidence_level": "OBSERVED", "finding": f"Extracted visual text: '{ocr_text[:80]}...'", "severity": "info", "confidence": "high" if ocr_result.get("confidence", 0) > 0.8 else "medium", "method": "OCR Engine", "evidence": ocr_result})
                db_manager.create_audit_event(inv_id, "OCR_COMPLETED", "OCR text parsing run successfully.")

        entities_claims = {}
        if ocr_text and "OCR extraction unavailable" not in ocr_text:
            entities_claims = OCRService.extract_entities_and_claims(ocr_text)
            for idx, claim in enumerate(entities_claims.get("claims", [])):
                db_manager.create_narrative_version(investigation_id=inv_id, node_id=f"claim_{idx}", text=claim, summary=f"Extracted claim {idx+1}", change_type="observed")

        ai_res = ai_analysis_service.analyze_media(filepath, mime_type, ocr_text, metadata, sampled_frames=sampled_frames)
        if ai_res.get("ai_status") == "AVAILABLE":
            for indicator in ai_res.get("indicators", []):
                findings.append(indicator)
            findings.append({
                "category": "ai_analysis",
                "evidence_level": "CONCLUSION",
                "finding": f"AI likelihood: {int(ai_res.get('ai_generation_likelihood', 0)*100)}%, Editing trace likelihood: {int(ai_res.get('manipulation_likelihood', 0)*100)}%.",
                "severity": "high" if ai_res.get("manipulation_likelihood", 0) > 0.6 or ai_res.get("ai_generation_likelihood", 0) > 0.6 else "medium",
                "confidence": ai_res.get("confidence", "medium"),
                "method": "Gemini Multimodal Forensics",
                "model": ai_res.get("model"),
                "evidence": ai_res,
            })
            db_manager.create_audit_event(inv_id, "AI_ANALYSIS_COMPLETED", f"Gemini vision assessment completed using {ai_res.get('model')}.")
            summary = ai_res.get("summary", "Analysis completed successfully.")
        else:
            db_manager.create_audit_event(inv_id, "AI_ANALYSIS_UNAVAILABLE", "AI-assisted analysis temporarily unavailable.", metadata_json={"reason": ai_res.get("reason"), "error_code": ai_res.get("error_code")})
            summary = "Technical forensic analysis completed. AI-assisted analysis temporarily unavailable."

        for finding in findings:
            db_manager.create_forensic_finding(analysis_run_id=run_id, category=finding.get("category"), evidence_level=finding.get("evidence_level"), finding=finding.get("finding"), severity=finding.get("severity", "info"), confidence=finding.get("confidence", "medium"), method=finding.get("method"), model=finding.get("model"), evidence=finding.get("evidence"))

        search_query = "election commission"
        if entities_claims and entities_claims.get("distinctive_phrases"):
            search_query = entities_claims["distinctive_phrases"][0]
        elif ocr_text and "OCR extraction unavailable" not in ocr_text:
            search_query = ocr_text[:100]
        else:
            search_query = os.path.splitext(os.path.basename(filepath))[0].replace("_", " ").replace("-", " ")

        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            candidates = loop.run_until_complete(SourceTracingService.search_sources(search_query, inv_id))
        finally:
            loop.close()

        for candidate in candidates:
            db_manager.create_source_candidate(investigation_id=inv_id, url=candidate.get("url"), domain=candidate.get("domain"), title=candidate.get("title"), platform=candidate.get("platform"), publication_time=candidate.get("publication_time"), discovery_method=candidate.get("discovery_method"), similarity_score=candidate.get("similarity_score"), confidence=candidate.get("confidence"), evidence=candidate.get("evidence"))

        db_manager.create_audit_event(inv_id, "SOURCE_SEARCH_COMPLETED", "Source discovery completed.")
        PropagationService.generate_propagation_graph(inv_id)
        db_manager.create_audit_event(inv_id, "PROPAGATION_GRAPH_CREATED", "Propagation graph auto-generated.")
        db_manager.update_analysis_run(run_id, "completed", summary)
    except Exception as exc:
        print(f"[PIPELINE ERROR] Analysis run failed: {exc}")
        db_manager.update_analysis_run(run_id, "failed", f"Failed: {exc}")
        db_manager.create_audit_event(inv_id, "ANALYSIS_FAILED", f"Errors during pipeline processing: {exc}")


legacy.run_analysis_pipeline_background = resilient_pipeline


def health_check():
    return {"status": "healthy", "database": "supabase" if db_manager.use_supabase else "sqlite", "gemini": gemini_runtime.health()}


def gemini_health_check():
    return gemini_runtime.check()

_replace_endpoint("/api/health", health_check)
app.add_api_route("/api/health/gemini", gemini_health_check, methods=["GET"])
