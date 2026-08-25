import os
import json
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app.config import settings
from backend.app.models import (
    Base, Investigation, MediaAsset, AnalysisRun, ForensicFinding,
    C2PARecord, SourceCandidate, PropagationNode, PropagationEdge,
    NarrativeVersion, Report, AuditEvent
)

# SQLite Session Setup
engine = create_engine(
    f"sqlite:///{settings.SQLITE_DB_PATH}", 
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Auto-create tables for SQLite on import/initialization
Base.metadata.create_all(bind=engine)

class DBManager:
    def __init__(self):
        # Allow use of service role or anon key for backend administrative queries
        self.use_supabase = bool(settings.SUPABASE_URL and (settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY))
        self.supabase_client = None
        
        if self.use_supabase:
            try:
                from supabase import create_client
                db_key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
                self.supabase_client = create_client(settings.SUPABASE_URL, db_key)
                
                # Execute validation query to check schema cache and confirm table migrations exist
                self.supabase_client.table("investigations").select("id").limit(1).execute()
                print("[DATABASE] Connected to Supabase PostgreSQL. Schema verified.")
            except Exception as e:
                err_msg = str(e)
                if "PGRST205" in err_msg or "Could not find the table" in err_msg:
                    print("\n" + "!"*80)
                    print("[DATABASE] WARNING: Supabase tables not found in schema cache!")
                    print("[DATABASE] Please execute the SQL migration script: 'scripts/migration.sql'")
                    print("[DATABASE] inside your Supabase dashboard SQL Editor to deploy schemas.")
                    print("!"*80 + "\n")
                else:
                    print(f"[DATABASE] Supabase connection check failed: {e}")
                
                print("[DATABASE] CRITICAL: Supabase connection failed while SUPABASE_URL is configured. Halting startup to prevent SQLite fallback in production.")
                raise RuntimeError(f"Database connection failed: {e}")

    # --- STORAGE HELPERS ---
    def upload_media_to_supabase(self, file_bytes: bytes, storage_path: str, mime_type: str) -> bool:
        """
        Uploads file bytes to the private Supabase storage bucket 'media'.
        """
        if not self.use_supabase:
            return False
        try:
            # Upload using the Supabase storage SDK client
            self.supabase_client.storage.from_("media").upload(
                path=storage_path,
                file=file_bytes,
                file_options={"content-type": mime_type}
            )
            return True
        except Exception as e:
            # If conflict (file already exists), that is fine, return True
            if "Duplicate" in str(e) or "already exists" in str(e) or "409" in str(e):
                return True
            print(f"[DATABASE] Storage upload error: {e}")
            return False

    def get_media_signed_url(self, storage_path: str, expires_in: int = 3600) -> str:
        """
        Creates a private signed access URL for a storage object.
        """
        if not self.use_supabase:
            import os
            return f"/static/uploads/{os.path.basename(storage_path)}"
        try:
            res = self.supabase_client.storage.from_("media").create_signed_url(
                path=storage_path,
                expires_in=expires_in
            )
            if isinstance(res, dict) and "signedURL" in res:
                return res["signedURL"]
            elif hasattr(res, "signed_url"):
                return res.signed_url
            return res.get("signedURL", f"https://{settings.SUPABASE_URL}/storage/v1/object/sign/media/{storage_path}")
        except Exception as e:
            import os
            print(f"[DATABASE] Signed URL creation failed: {e}")
            return f"/static/uploads/{os.path.basename(storage_path)}"

    def _get_sqlite_db(self):
        db = SessionLocal()
        try:
            return db
        except Exception:
            db.close()
            raise

    # Help serialization of datetime objects
    def _to_json_compatible(self, data):
        if isinstance(data, dict):
            return {k: self._to_json_compatible(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._to_json_compatible(v) for v in data]
        elif isinstance(data, datetime):
            return data.isoformat()
        return data

    # --- INVESTIGATIONS ---
    def create_investigation(self, title: str, description: str = "", case_number: str = None, status: str = "active", risk_level: str = "low"):
        now = datetime.utcnow()
        if self.use_supabase:
            payload = {
                "title": title,
                "description": description,
                "case_number": case_number,
                "status": status,
                "risk_level": risk_level,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
            res = self.supabase_client.table("investigations").insert(payload).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            inv = Investigation(title=title, description=description, case_number=case_number, status=status, risk_level=risk_level, created_at=now, updated_at=now)
            db.add(inv)
            db.commit()
            db.refresh(inv)
            data = self._model_to_dict(inv)
            db.close()
            return data

    def get_investigation(self, inv_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("investigations").select("*").eq("id", inv_id).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
            data = self._model_to_dict(inv) if inv else None
            db.close()
            return data

    def list_investigations(self):
        if self.use_supabase:
            res = self.supabase_client.table("investigations").select("*").order("created_at", desc=True).execute()
            return res.data
        else:
            db = self._get_sqlite_db()
            invs = db.query(Investigation).order_by(Investigation.created_at.desc()).all()
            data = [self._model_to_dict(x) for x in invs]
            db.close()
            return data

    def update_investigation(self, inv_id: str, updates: dict):
        updates["updated_at"] = datetime.utcnow().isoformat() if self.use_supabase else datetime.utcnow()
        if self.use_supabase:
            res = self.supabase_client.table("investigations").update(updates).eq("id", inv_id).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            inv = db.query(Investigation).filter(Investigation.id == inv_id).first()
            if inv:
                for k, v in updates.items():
                    setattr(inv, k, v)
                db.commit()
                db.refresh(inv)
                data = self._model_to_dict(inv)
            else:
                data = None
            db.close()
            return data

    # --- MEDIA ASSETS ---
    def create_media_asset(self, investigation_id: str, filename: str, mime_type: str, storage_path: str, sha256: str, size_bytes: int, perceptual_hash: str = None):
        now = datetime.utcnow()
        if self.use_supabase:
            payload = {
                "investigation_id": investigation_id,
                "filename": filename,
                "mime_type": mime_type,
                "storage_path": storage_path,
                "sha256": sha256,
                "size_bytes": size_bytes,
                "perceptual_hash": perceptual_hash,
                "created_at": now.isoformat()
            }
            res = self.supabase_client.table("media_assets").insert(payload).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            asset = MediaAsset(
                investigation_id=investigation_id, filename=filename, mime_type=mime_type,
                storage_path=storage_path, sha256=sha256, size_bytes=size_bytes,
                perceptual_hash=perceptual_hash, created_at=now
            )
            db.add(asset)
            db.commit()
            db.refresh(asset)
            data = self._model_to_dict(asset)
            db.close()
            return data

    def get_media_asset(self, asset_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("media_assets").select("*").eq("id", asset_id).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            asset = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
            data = self._model_to_dict(asset) if asset else None
            db.close()
            return data

    def get_media_assets_by_investigation(self, inv_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("media_assets").select("*").eq("investigation_id", inv_id).execute()
            return res.data
        else:
            db = self._get_sqlite_db()
            assets = db.query(MediaAsset).filter(MediaAsset.investigation_id == inv_id).all()
            data = [self._model_to_dict(x) for x in assets]
            db.close()
            return data

    # --- ANALYSIS RUNS ---
    def create_analysis_run(self, investigation_id: str, media_asset_id: str):
        now = datetime.utcnow()
        if self.use_supabase:
            payload = {
                "investigation_id": investigation_id,
                "media_asset_id": media_asset_id,
                "status": "pending",
                "started_at": now.isoformat()
            }
            res = self.supabase_client.table("analysis_runs").insert(payload).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            run = AnalysisRun(investigation_id=investigation_id, media_asset_id=media_asset_id, status="pending", started_at=now)
            db.add(run)
            db.commit()
            db.refresh(run)
            data = self._model_to_dict(run)
            db.close()
            return data

    def update_analysis_run(self, run_id: str, status: str, summary: str = None):
        now = datetime.utcnow()
        updates = {"status": status, "completed_at": now.isoformat() if self.use_supabase else now}
        if summary:
            updates["summary"] = summary
        if self.use_supabase:
            res = self.supabase_client.table("analysis_runs").update(updates).eq("id", run_id).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            run = db.query(AnalysisRun).filter(AnalysisRun.id == run_id).first()
            if run:
                for k, v in updates.items():
                    setattr(run, k, v)
                db.commit()
                db.refresh(run)
                data = self._model_to_dict(run)
            else:
                data = None
            db.close()
            return data

    def get_analysis_run(self, run_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("analysis_runs").select("*").eq("id", run_id).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            run = db.query(AnalysisRun).filter(AnalysisRun.id == run_id).first()
            data = self._model_to_dict(run) if run else None
            db.close()
            return data

    def get_latest_analysis_run(self, media_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("analysis_runs").select("*").eq("media_asset_id", media_id).order("started_at", desc=True).limit(1).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            run = db.query(AnalysisRun).filter(AnalysisRun.media_asset_id == media_id).order_by(AnalysisRun.started_at.desc()).first()
            data = self._model_to_dict(run) if run else None
            db.close()
            return data

    # --- FORENSIC FINDINGS ---
    def create_forensic_finding(self, analysis_run_id: str, category: str, evidence_level: str, finding: str, severity: str = "info", confidence: str = "medium", method: str = None, model: str = None, evidence: dict = None):
        now = datetime.utcnow()
        evidence_str = json.dumps(evidence) if evidence else None
        if self.use_supabase:
            payload = {
                "analysis_run_id": analysis_run_id,
                "category": category,
                "evidence_level": evidence_level,
                "finding": finding,
                "severity": severity,
                "confidence": confidence,
                "method": method,
                "model": model,
                "evidence": evidence_str,
                "created_at": now.isoformat()
            }
            res = self.supabase_client.table("forensic_findings").insert(payload).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            item = ForensicFinding(
                analysis_run_id=analysis_run_id, category=category, evidence_level=evidence_level,
                finding=finding, severity=severity, confidence=confidence, method=method,
                model=model, evidence=evidence_str, created_at=now
            )
            db.add(item)
            db.commit()
            db.refresh(item)
            data = self._model_to_dict(item)
            db.close()
            return data

    def get_forensic_findings_by_run(self, run_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("forensic_findings").select("*").eq("analysis_run_id", run_id).execute()
            return res.data
        else:
            db = self._get_sqlite_db()
            items = db.query(ForensicFinding).filter(ForensicFinding.analysis_run_id == run_id).all()
            data = [self._model_to_dict(x) for x in items]
            db.close()
            return data

    # --- C2PA ---
    def create_c2pa_record(self, media_asset_id: str, status: str, issuer: str = None, claim: str = None, verification_result: str = None, raw_summary: str = None):
        now = datetime.utcnow()
        if self.use_supabase:
            payload = {
                "media_asset_id": media_asset_id,
                "status": status,
                "issuer": issuer,
                "claim": claim,
                "verification_result": verification_result,
                "raw_summary": raw_summary,
                "created_at": now.isoformat()
            }
            res = self.supabase_client.table("c2pa_records").insert(payload).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            rec = C2PARecord(
                media_asset_id=media_asset_id, status=status, issuer=issuer, claim=claim,
                verification_result=verification_result, raw_summary=raw_summary, created_at=now
            )
            db.add(rec)
            db.commit()
            db.refresh(rec)
            data = self._model_to_dict(rec)
            db.close()
            return data

    def get_c2pa_record_by_media(self, media_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("c2pa_records").select("*").eq("media_asset_id", media_id).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            rec = db.query(C2PARecord).filter(C2PARecord.media_asset_id == media_id).first()
            data = self._model_to_dict(rec) if rec else None
            db.close()
            return data

    # --- SOURCE CANDIDATES ---
    def create_source_candidate(self, investigation_id: str, url: str, domain: str, title: str = None, platform: str = "web", publication_time: str = None, discovery_method: str = "search", similarity_score: float = 1.0, confidence: str = "medium", evidence: str = None):
        now = datetime.utcnow()
        pub_time = None
        if publication_time:
            try:
                pub_time = datetime.fromisoformat(publication_time.replace("Z", "+00:00")) if not self.use_supabase else publication_time
            except Exception:
                pub_time = None
                
        if self.use_supabase:
            payload = {
                "investigation_id": investigation_id,
                "url": url,
                "domain": domain,
                "title": title,
                "platform": platform,
                "publication_time": publication_time,
                "discovered_time": now.isoformat(),
                "discovery_method": discovery_method,
                "similarity_score": similarity_score,
                "confidence": confidence,
                "evidence": evidence
            }
            res = self.supabase_client.table("source_candidates").insert(payload).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            candidate = SourceCandidate(
                investigation_id=investigation_id, url=url, domain=domain, title=title,
                platform=platform, publication_time=pub_time, discovered_time=now,
                discovery_method=discovery_method, similarity_score=similarity_score,
                confidence=confidence, evidence=evidence
            )
            db.add(candidate)
            db.commit()
            db.refresh(candidate)
            data = self._model_to_dict(candidate)
            db.close()
            return data

    def get_source_candidates(self, inv_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("source_candidates").select("*").eq("investigation_id", inv_id).execute()
            return res.data
        else:
            db = self._get_sqlite_db()
            items = db.query(SourceCandidate).filter(SourceCandidate.investigation_id == inv_id).all()
            data = [self._model_to_dict(x) for x in items]
            db.close()
            return data

    # --- PROPAGATION NODES ---
    def create_propagation_node(self, investigation_id: str, node_type: str, label: str, url: str = None, platform: str = "web", timestamp: str = None, media_hash: str = None, confidence: str = "high"):
        ts_val = None
        if timestamp:
            try:
                ts_val = datetime.fromisoformat(timestamp.replace("Z", "+00:00")) if not self.use_supabase else timestamp
            except Exception:
                ts_val = None
        if self.use_supabase:
            payload = {
                "investigation_id": investigation_id,
                "node_type": node_type,
                "label": label,
                "url": url,
                "platform": platform,
                "timestamp": timestamp,
                "media_hash": media_hash,
                "confidence": confidence
            }
            res = self.supabase_client.table("propagation_nodes").insert(payload).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            node = PropagationNode(
                investigation_id=investigation_id, node_type=node_type, label=label,
                url=url, platform=platform, timestamp=ts_val, media_hash=media_hash, confidence=confidence
            )
            db.add(node)
            db.commit()
            db.refresh(node)
            data = self._model_to_dict(node)
            db.close()
            return data

    def get_propagation_nodes(self, inv_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("propagation_nodes").select("*").eq("investigation_id", inv_id).execute()
            return res.data
        else:
            db = self._get_sqlite_db()
            items = db.query(PropagationNode).filter(PropagationNode.investigation_id == inv_id).all()
            data = [self._model_to_dict(x) for x in items]
            db.close()
            return data

    # --- PROPAGATION EDGES ---
    def create_propagation_edge(self, investigation_id: str, source_node_id: str, target_node_id: str, relationship: str, confidence: str = "medium", evidence: str = None):
        if self.use_supabase:
            payload = {
                "investigation_id": investigation_id,
                "source_node_id": source_node_id,
                "target_node_id": target_node_id,
                "relationship": relationship,
                "confidence": confidence,
                "evidence": evidence
            }
            res = self.supabase_client.table("propagation_edges").insert(payload).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            edge = PropagationEdge(
                investigation_id=investigation_id, source_node_id=source_node_id,
                target_node_id=target_node_id, relationship=relationship,
                confidence=confidence, evidence=evidence
            )
            db.add(edge)
            db.commit()
            db.refresh(edge)
            data = self._model_to_dict(edge)
            db.close()
            return data

    def get_propagation_edges(self, inv_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("propagation_edges").select("*").eq("investigation_id", inv_id).execute()
            return res.data
        else:
            db = self._get_sqlite_db()
            items = db.query(PropagationEdge).filter(PropagationEdge.investigation_id == inv_id).all()
            data = [self._model_to_dict(x) for x in items]
            db.close()
            return data

    # --- NARRATIVE VERSIONS ---
    def create_narrative_version(self, investigation_id: str, node_id: str, text: str, summary: str = None, change_type: str = "observed", confidence: str = "medium"):
        if self.use_supabase:
            payload = {
                "investigation_id": investigation_id,
                "node_id": node_id,
                "text": text,
                "summary": summary,
                "change_type": change_type,
                "confidence": confidence
            }
            res = self.supabase_client.table("narrative_versions").insert(payload).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            version = NarrativeVersion(
                investigation_id=investigation_id, node_id=node_id, text=text,
                summary=summary, change_type=change_type, confidence=confidence
            )
            db.add(version)
            db.commit()
            db.refresh(version)
            data = self._model_to_dict(version)
            db.close()
            return data

    def get_narrative_versions(self, inv_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("narrative_versions").select("*").eq("investigation_id", inv_id).execute()
            return res.data
        else:
            db = self._get_sqlite_db()
            items = db.query(NarrativeVersion).filter(NarrativeVersion.investigation_id == inv_id).all()
            data = [self._model_to_dict(x) for x in items]
            db.close()
            return data

    # --- AUDIT EVENTS ---
    def create_audit_event(self, investigation_id: str, event_type: str, description: str, user_id: str = "system", metadata_json: dict = None):
        now = datetime.utcnow()
        meta_str = json.dumps(metadata_json) if metadata_json else None
        if self.use_supabase:
            payload = {
                "investigation_id": investigation_id,
                "event_type": event_type,
                "description": description,
                "user_id": user_id,
                "timestamp": now.isoformat(),
                "metadata_json": meta_str
            }
            res = self.supabase_client.table("audit_events").insert(payload).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            event = AuditEvent(
                investigation_id=investigation_id, event_type=event_type, description=description,
                user_id=user_id, timestamp=now, metadata_json=meta_str
            )
            db.add(event)
            db.commit()
            db.refresh(event)
            data = self._model_to_dict(event)
            db.close()
            return data

    def get_audit_events(self, inv_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("audit_events").select("*").eq("investigation_id", inv_id).order("timestamp", desc=True).execute()
            return res.data
        else:
            db = self._get_sqlite_db()
            items = db.query(AuditEvent).filter(AuditEvent.investigation_id == inv_id).order_by(AuditEvent.timestamp.desc()).all()
            data = [self._model_to_dict(x) for x in items]
            db.close()
            return data

    # --- REPORTS ---
    def create_report(self, investigation_id: str, report_path: str):
        now = datetime.utcnow()
        if self.use_supabase:
            payload = {
                "investigation_id": investigation_id,
                "report_path": report_path,
                "created_at": now.isoformat()
            }
            res = self.supabase_client.table("reports").insert(payload).execute()
            return res.data[0] if res.data else None
        else:
            db = self._get_sqlite_db()
            rep = Report(investigation_id=investigation_id, report_path=report_path, created_at=now)
            db.add(rep)
            db.commit()
            db.refresh(rep)
            data = self._model_to_dict(rep)
            db.close()
            return data

    def get_reports_by_investigation(self, inv_id: str):
        if self.use_supabase:
            res = self.supabase_client.table("reports").select("*").eq("investigation_id", inv_id).execute()
            return res.data
        else:
            db = self._get_sqlite_db()
            items = db.query(Report).filter(Report.investigation_id == inv_id).all()
            data = [self._model_to_dict(x) for x in items]
            db.close()
            return data

    def save_analyst_note(self, investigation_id: str, note_text: str, author: str = "System Operator"):
        now = datetime.utcnow()
        payload = {
            "investigation_id": investigation_id,
            "note": note_text,
            "author": author,
            "updated_at": now.isoformat()
        }
        
        if self.use_supabase:
            try:
                # Check if analyst_notes table is accessible
                res_check = self.supabase_client.table("analyst_notes").select("id").limit(1).execute()
                existing = self.supabase_client.table("analyst_notes").select("id").eq("investigation_id", investigation_id).execute()
                if existing.data:
                    res = self.supabase_client.table("analyst_notes").update(payload).eq("investigation_id", investigation_id).execute()
                else:
                    db_payload = {
                        **payload,
                        "created_at": now.isoformat()
                    }
                    res = self.supabase_client.table("analyst_notes").insert(db_payload).execute()
                return res.data[0] if res.data else None
            except Exception as e:
                print(f"[DATABASE] Supabase analyst_notes table error: {e}. Falling back to description column.")
                serialized = json.dumps({
                    "note": note_text,
                    "author": author,
                    "updated_at": now.isoformat(),
                    "created_at": now.isoformat()
                })
                self.update_investigation(investigation_id, {"description": serialized})
                return {"investigation_id": investigation_id, "note": note_text, "author": author, "updated_at": now.isoformat()}
        else:
            db = self._get_sqlite_db()
            try:
                from backend.app.models import AnalystNote
                existing = db.query(AnalystNote).filter(AnalystNote.investigation_id == investigation_id).first()
                if existing:
                    existing.note = note_text
                    existing.author = author
                    existing.updated_at = now
                else:
                    new_note = AnalystNote(investigation_id=investigation_id, note=note_text, author=author, created_at=now, updated_at=now)
                    db.add(new_note)
                db.commit()
                note_db = db.query(AnalystNote).filter(AnalystNote.investigation_id == investigation_id).first()
                data = self._model_to_dict(note_db)
                db.close()
                return data
            except Exception as e:
                db.close()
                print(f"[DATABASE] SQLite analyst_notes error: {e}")
                return None

    def get_analyst_note(self, investigation_id: str):
        if self.use_supabase:
            try:
                res = self.supabase_client.table("analyst_notes").select("*").eq("investigation_id", investigation_id).execute()
                if res.data:
                    return res.data[0]
            except Exception as e:
                print(f"[DATABASE] Supabase analyst_notes fetch fallback: {e}")
                
            inv = self.get_investigation(investigation_id)
            if inv and inv.get("description"):
                try:
                    data = json.loads(inv["description"])
                    if isinstance(data, dict) and "note" in data:
                        return data
                except:
                    pass
            return {"note": "", "author": "System Operator", "updated_at": None, "created_at": None}
        else:
            db = self._get_sqlite_db()
            try:
                from backend.app.models import AnalystNote
                note_db = db.query(AnalystNote).filter(AnalystNote.investigation_id == investigation_id).first()
                data = self._model_to_dict(note_db) if note_db else None
                db.close()
                if data:
                    return data
            except Exception as e:
                db.close()
                print(f"[DATABASE] SQLite analyst_notes fetch error: {e}")
            
            inv = self.get_investigation(investigation_id)
            if inv and inv.get("description"):
                try:
                    data = json.loads(inv["description"])
                    if isinstance(data, dict) and "note" in data:
                        return data
                except:
                    pass
            return {"note": "", "author": "System Operator", "updated_at": None, "created_at": None}

    # Helper method to convert SQLAlchemy models to dicts
    def _model_to_dict(self, model_obj):
        if not model_obj:
            return None
        data = {}
        for col in model_obj.__table__.columns:
            val = getattr(model_obj, col.name)
            if isinstance(val, datetime):
                data[col.name] = val.isoformat()
            else:
                data[col.name] = val
        return data

db_manager = DBManager()
