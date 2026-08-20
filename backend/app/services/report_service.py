import os
import json
from datetime import datetime
from backend.app.config import settings
from backend.app.database import db_manager
from backend.app.services.plim_service import plim_service

class ReportService:
    @staticmethod
    def generate_report_content(investigation_id: str) -> dict:
        """
        Compiles all investigation details into a single structured master report.
        """
        inv = db_manager.get_investigation(investigation_id)
        if not inv:
            raise Exception("Investigation not found")
            
        assets = db_manager.get_media_assets_by_investigation(investigation_id)
        asset = assets[0] if assets else None
        
        run = None
        findings = []
        c2pa = None
        if asset:
            run = db_manager.get_latest_analysis_run(asset.get("id"))
            if run:
                findings = db_manager.get_forensic_findings_by_run(run.get("id"))
            c2pa = db_manager.get_c2pa_record_by_media(asset.get("id"))
            
        candidates = db_manager.get_source_candidates(investigation_id)
        nodes = db_manager.get_propagation_nodes(investigation_id)
        edges = db_manager.get_propagation_edges(investigation_id)
        narratives = db_manager.get_narrative_versions(investigation_id)
        audit_trail = db_manager.get_audit_events(investigation_id)
        
        # 1. Fetch TRACE-PLIM analysis
        plim_analysis = plim_service.calculate_plim_analysis(investigation_id)
        
        # 2. Build chronological timeline
        timeline_events = []
        
        # Geolocation / EXIF Creation Date
        if asset and run:
            # Check metadata finding
            meta_finding = next((f for f in findings if f.get("category") == "metadata"), None)
            if meta_finding and meta_finding.get("evidence"):
                try:
                    ev_meta = json.loads(meta_finding["evidence"])
                    creation_date = ev_meta.get("creation_date")
                    if creation_date:
                        timeline_events.append({
                            "timestamp": creation_date,
                            "type": "Observed",
                            "event": "Original media capture timestamp extracted from metadata.",
                            "reference": asset.get("filename")
                        })
                except:
                    pass
                    
        # Source Candidates
        for cand in candidates:
            pub_time = cand.get("publication_time")
            disc_time = cand.get("discovered_time")
            
            if pub_time:
                pub_str = pub_time.isoformat() if isinstance(pub_time, datetime) else str(pub_time)
                timeline_events.append({
                    "timestamp": pub_str,
                    "type": "Observed",
                    "event": f"Discovered public publication instance on platform '{cand.get('platform', 'Web')}'.",
                    "reference": cand.get("url")
                })
            else:
                disc_str = disc_time.isoformat() if isinstance(disc_time, datetime) else str(disc_time)
                timeline_events.append({
                    "timestamp": disc_str,
                    "type": "Estimated",
                    "event": f"Estimated publication window based on search discovery crawl.",
                    "reference": cand.get("url")
                })
                
        # Propagation Nodes
        for n in nodes:
            node_time = n.get("timestamp")
            if node_time:
                node_time_str = node_time.isoformat() if isinstance(node_time, datetime) else str(node_time)
                timeline_events.append({
                    "timestamp": node_time_str,
                    "type": "Observed",
                    "event": f"Propagation node spread on platform '{n.get('platform')}': {n.get('label')}.",
                    "reference": n.get("url") or "Graph Node"
                })
                
        # Sort timeline chronologically
        def parse_date(event):
            t = event["timestamp"]
            try:
                if "Z" in t:
                    t = t.replace("Z", "")
                if "T" in t:
                    return datetime.fromisoformat(t)
                return datetime.strptime(t, "%Y:%m:%d %H:%M:%S")
            except:
                return datetime.min
                
        timeline_events.sort(key=parse_date)
        
        # 3. Compile report dataset
        return {
            "case_info": {
                "case_id": inv.get("id"),
                "case_number": inv.get("case_number") or "N/A",
                "title": inv.get("title"),
                "description": inv.get("description"),
                "status": inv.get("status"),
                "created_at": inv.get("created_at"),
                "report_timestamp": datetime.utcnow().isoformat() + "Z",
                "system_version": settings.VERSION
            },
            "media_info": {
                "filename": asset.get("filename") if asset else "None",
                "mime_type": asset.get("mime_type") if asset else "None",
                "size_bytes": asset.get("size_bytes") if asset else 0,
                "sha256": asset.get("sha256") if asset else "None",
                "perceptual_hash": asset.get("perceptual_hash") if asset else "None"
            },
            "c2pa": {
                "status": c2pa.get("status") if c2pa else "NOT_PRESENT",
                "issuer": c2pa.get("issuer") if c2pa else None,
                "claim": c2pa.get("claim") if c2pa else None,
                "verification_result": c2pa.get("verification_result") if c2pa else "No C2PA verification data available."
            },
            "trace_plim": plim_analysis,
            "forensic_findings": findings,
            "source_candidates": [
                {
                    "title": c.get("title"),
                    "url": c.get("url"),
                    "domain": c.get("domain"),
                    "platform": c.get("platform"),
                    "publication_time": c.get("publication_time"),
                    "similarity_score": c.get("similarity_score"),
                    "confidence": c.get("confidence")
                } for c in candidates
            ],
            "timeline": timeline_events,
            "propagation_graph": {
                "node_count": len(nodes),
                "edge_count": len(edges),
                "platforms": list(set(n.get("platform") for n in nodes))
            },
            "confidence_levels": {
                "overall_confidence": run.get("confidence") if run else "medium",
                "evidence_integrity": "high" if c2pa and c2pa.get("status") == "VERIFIED" else "medium"
            },
            "limitations": [
                "This report relies on probabilistic machine learning models which may exhibit false positives/negatives.",
                "Absence of C2PA manifest does not prove manipulation.",
                "Search engine indexes may not catalog ephemeral content (e.g., chat apps) or private spaces."
            ],
            "evidence_references": [c.get("url") for c in candidates if c.get("url")],
            "audit_trail": audit_trail
        }
        
    @staticmethod
    def generate_pdf_report(investigation_id: str) -> str:
        """
        Compiles the report JSON, saves to local uploads directory, and uploads to Supabase storage.
        """
        report_data = ReportService.generate_report_content(investigation_id)
        
        filename = f"report_{investigation_id}_{int(datetime.utcnow().timestamp())}.json"
        report_dir = os.path.join(settings.UPLOAD_DIR, "reports")
        os.makedirs(report_dir, exist_ok=True)
        report_path_abs = os.path.join(report_dir, filename)
        
        # Write local JSON file
        with open(report_path_abs, "w") as f:
            json.dump(report_data, f, indent=2)
            
        report_path_rel = f"/static/uploads/reports/{filename}"
        
        # Upload report JSON directly to Supabase storage private bucket
        try:
            with open(report_path_abs, "rb") as f_bytes:
                db_manager.upload_media_to_supabase(
                    file_bytes=f_bytes.read(),
                    storage_path=f"reports/{filename}",
                    mime_type="application/json"
                )
            print(f"[REPORTS] Successfully uploaded report {filename} to Supabase storage.")
        except Exception as e_upload:
            print(f"[REPORTS] Failed to upload report to Supabase storage: {e_upload}")
        
        # Save record in database
        db_manager.create_report(investigation_id, report_path_rel)
        db_manager.create_audit_event(investigation_id, "REPORT_GENERATED", f"Forensic report created at path {report_path_rel}")
        
        return report_path_rel

report_service = ReportService()
