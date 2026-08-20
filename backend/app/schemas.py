from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class InvestigationBase(BaseModel):
    title: str
    description: Optional[str] = ""
    case_number: Optional[str] = None
    status: Optional[str] = "active"
    risk_level: Optional[str] = "low"

class InvestigationCreate(InvestigationBase):
    pass

class InvestigationResponse(InvestigationBase):
    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True

class MediaAssetResponse(BaseModel):
    id: str
    investigation_id: str
    filename: str
    mime_type: str
    storage_path: str
    sha256: str
    perceptual_hash: Optional[str] = None
    size_bytes: int
    created_at: str

    class Config:
        from_attributes = True

class ForensicFindingResponse(BaseModel):
    id: str
    analysis_run_id: str
    category: str
    evidence_level: str
    finding: str
    severity: str
    confidence: str
    method: Optional[str] = None
    model: Optional[str] = None
    evidence: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True

class SourceCandidateCreate(BaseModel):
    url: str
    domain: str
    title: Optional[str] = None
    platform: Optional[str] = "web"
    publication_time: Optional[str] = None
    discovery_method: str
    similarity_score: Optional[float] = 1.0
    confidence: Optional[str] = "medium"
    evidence: Optional[str] = None

class SourceCandidateResponse(SourceCandidateCreate):
    id: str
    investigation_id: str
    discovered_time: str

    class Config:
        from_attributes = True

class AuditEventResponse(BaseModel):
    id: str
    investigation_id: Optional[str] = None
    user_id: str
    event_type: str
    description: str
    timestamp: str
    metadata_json: Optional[str] = None

    class Config:
        from_attributes = True
