from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime
import uuid

Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

class Investigation(Base):
    __tablename__ = "investigations"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    case_number = Column(String(50), unique=True, nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="active") # active, completed, archived
    risk_level = Column(String(50), default="low") # low, medium, high, critical
    analyst_intent = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MediaAsset(Base):
    __tablename__ = "media_assets"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    storage_path = Column(Text, nullable=False)
    sha256 = Column(String(64), nullable=False)
    perceptual_hash = Column(String(64), nullable=True)
    size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False)
    media_asset_id = Column(String(36), ForeignKey("media_assets.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), default="pending") # pending, running, completed, failed
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    summary = Column(Text, nullable=True)

class ForensicFinding(Base):
    __tablename__ = "forensic_findings"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    analysis_run_id = Column(String(36), ForeignKey("analysis_runs.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(100), nullable=False) # metadata, compression, visual, temporal, audio, ocr
    evidence_level = Column(String(50), nullable=False) # OBSERVED, INFERRED, CONCLUSION
    finding = Column(Text, nullable=False)
    severity = Column(String(50), default="info") # info, low, medium, high, critical
    confidence = Column(String(50), default="medium") # low, medium, high, conclusive
    method = Column(String(100), nullable=True)
    model = Column(String(100), nullable=True)
    evidence = Column(Text, nullable=True) # JSON string with detail parameters
    created_at = Column(DateTime, default=datetime.utcnow)

class C2PARecord(Base):
    __tablename__ = "c2pa_records"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    media_asset_id = Column(String(36), ForeignKey("media_assets.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), nullable=False) # VERIFIED, PRESENT_BUT_UNVERIFIED, NOT_PRESENT, INVALID, UNAVAILABLE
    issuer = Column(String(255), nullable=True)
    claim = Column(Text, nullable=True)
    verification_result = Column(Text, nullable=True)
    raw_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class SourceCandidate(Base):
    __tablename__ = "source_candidates"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False)
    url = Column(Text, nullable=False)
    domain = Column(String(255), nullable=False)
    title = Column(String(255), nullable=True)
    platform = Column(String(100), default="web") # social_media, news_outlet, blog, unknown
    publication_time = Column(DateTime, nullable=True)
    discovered_time = Column(DateTime, default=datetime.utcnow)
    discovery_method = Column(String(100), nullable=False) # web_search, ocr_matching, hash_matching
    similarity_score = Column(Float, default=1.0)
    confidence = Column(String(50), default="medium") # low, medium, high
    evidence = Column(Text, nullable=True)

class PropagationNode(Base):
    __tablename__ = "propagation_nodes"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False)
    node_type = Column(String(50), nullable=False) # source, repost, modification, amplifier
    label = Column(String(255), nullable=False)
    url = Column(Text, nullable=True)
    platform = Column(String(100), nullable=False)
    timestamp = Column(DateTime, nullable=True)
    media_hash = Column(String(64), nullable=True)
    confidence = Column(String(50), default="high")

class PropagationEdge(Base):
    __tablename__ = "propagation_edges"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False)
    source_node_id = Column(String(36), nullable=False)
    target_node_id = Column(String(36), nullable=False)
    relationship = Column(String(100), nullable=False) # reposted, modified, linked, quoted
    confidence = Column(String(50), default="medium")
    evidence = Column(Text, nullable=True)

class NarrativeVersion(Base):
    __tablename__ = "narrative_versions"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False)
    node_id = Column(String(36), nullable=True)
    text = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    change_type = Column(String(100), default="observed") # contextual, assertive, accusatory, sensationalized
    confidence = Column(String(50), default="medium")

class Report(Base):
    __tablename__ = "reports"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False)
    report_path = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class AuditEvent(Base):
    __tablename__ = "audit_events"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(String(255), nullable=True)
    event_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    metadata_json = Column(Text, nullable=True)

class AnalystNote(Base):
    __tablename__ = "analyst_notes"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False)
    note = Column(Text, nullable=False)
    author = Column(String(255), default="System Operator")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
