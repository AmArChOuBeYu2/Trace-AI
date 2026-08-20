"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  FileText, 
  ShieldCheck, 
  Activity, 
  FileImage, 
  TrendingUp, 
  Clock, 
  History,
  AlertTriangle,
  Globe,
  Sliders,
  Play,
  Download,
  AlertCircle,
  Loader2,
  FileSearch,
  UserCheck,
  CheckCircle,
  XCircle,
  CornerRightDown
} from "lucide-react";
import PropagationFlow from "./propagation-flow";

interface Finding {
  id: string;
  category: string;
  evidence_level: string;
  finding: string;
  severity: string;
  confidence: string;
  method?: string;
  model?: string;
  evidence?: string;
}

interface SourceCandidate {
  id: string;
  url: string;
  domain: string;
  title: string;
  platform: string;
  publication_time: string;
  discovered_time: string;
  discovery_method: string;
  similarity_score: number;
  confidence: string;
  evidence: string;
}

interface NarrativeVersion {
  id: string;
  text: string;
  summary: string;
  change_type: string;
  node_id?: string;
}

interface AuditLog {
  id: string;
  event_type: string;
  description: string;
  timestamp: string;
}

interface WorkspaceData {
  investigation: {
    id: string;
    title: string;
    description: string;
    case_number: string | null;
    status: string;
    risk_level: string;
    created_at: string;
  };
  media: {
    id: string;
    filename: string;
    mime_type: string;
    storage_path: string;
    sha256: string;
    size_bytes: number;
    perceptual_hash?: string;
  } | null;
  findings: Finding[];
  c2pa: {
    status: string;
    issuer?: string;
    claim?: string;
    verification_result?: string;
  };
  sources: SourceCandidate[];
  graph: {
    nodes: any[];
    edges: any[];
  };
  narrative: {
    versions: NarrativeVersion[];
    analysis: {
      evolution_pattern?: string;
      summary?: string;
      intensity_score?: number;
      shifts?: any[];
    };
  };
  audit: AuditLog[];
}

interface WorkspaceProps {
  data: WorkspaceData;
  isDemo?: boolean;
  onManualSearch?: (keywords: string) => Promise<void>;
  onRefresh?: () => void;
}

export default function InvestigationWorkspace({ data, isDemo = false, onManualSearch, onRefresh }: WorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "findings" | "provenance" | "sources" | "propagation" | "narrative" | "plim" | "reports">("overview");
  
  // Custom weights for dynamic PLIM recalculation
  const [wManip, setWManip] = useState(35);
  const [wMeta, setWMeta] = useState(20);
  const [wProp, setWProp] = useState(20);
  const [wNarr, setWNarr] = useState(25);
  
  // Custom states
  const [notes, setNotes] = useState("Forensic parameters initialized. Case file evidence trails registered.");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  
  // Lightbox modal for video frame inspection
  const [selectedFrame, setSelectedFrame] = useState<any>(null);
  
  // Source Tracing provider filter
  const [providerFilter, setProviderFilter] = useState<"all" | "langsearch" | "tavily">("all");
  
  // Selected Timeline event details
  const [selectedTimelineEvent, setSelectedTimelineEvent] = useState<any>(null);
  
  // Show all sources toggle state
  const [showAllSources, setShowAllSources] = useState(false);

  // Status variables
  const currentStatus = data.investigation.status.toLowerCase();
  const isRunning = currentStatus === "pending" || currentStatus === "running";

  // 1. Live Pipeline Polling if the investigation status is pending/running
  useEffect(() => {
    if (!isRunning || isDemo || !onRefresh) return;
    
    const interval = setInterval(() => {
      onRefresh();
    }, 1500);

    return () => clearInterval(interval);
  }, [isRunning, isDemo, onRefresh]);

  const getMediaUrl = (path: string) => {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    return `http://localhost:8000${path.startsWith("/") ? "" : "/"}${path}`;
  };

  // 2. Dynamic PLIM Calculations
  const calculateDynamicScore = () => {
    let manip = 10.0;
    let meta = 10.0;
    let prop = 10.0;
    let narr = 10.0;

    const elaFinding = data.findings.find(f => f.category === "compression");
    if (elaFinding && elaFinding.evidence) {
      try {
        const ev = JSON.parse(elaFinding.evidence);
        manip = ev.ela_anomaly_score || 10.0;
      } catch {}
    }
    
    const metaHigh = data.findings.some(f => f.category === "metadata" && (f.severity === "high" || f.severity === "critical"));
    const metaMed = data.findings.some(f => f.category === "metadata" && f.severity === "medium");
    if (metaHigh) meta = 85.0;
    else if (metaMed) meta = 45.0;

    if (data.sources.length > 2) prop = 80.0;
    else if (data.sources.length > 0) prop = 35.0;

    if (data.narrative.versions.length > 1) {
      narr = (data.narrative.analysis.intensity_score || 0.5) * 100.0;
    }

    const totalWeight = wManip + wMeta + wProp + wNarr;
    const normManip = wManip / (totalWeight || 1);
    const normMeta = wMeta / (totalWeight || 1);
    const normProp = wProp / (totalWeight || 1);
    const normNarr = wNarr / (totalWeight || 1);

    const overall = (manip * normManip) + (meta * normMeta) + (prop * normProp) + (narr * normNarr);
    return {
      overall: Math.min(Math.max(overall, 10.0), 100.0),
      manip,
      meta,
      prop,
      narr
    };
  };

  const scores = calculateDynamicScore();

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery || !onManualSearch) return;
    setSearching(true);
    try {
      await onManualSearch(searchQuery);
    } catch (err) {
      console.error(err);
    }
    setSearching(false);
  };

  const getRiskBadgeColor = (score: number) => {
    if (score > 70) return "text-red-700 border-red-200 bg-red-50";
    if (score > 40) return "text-amber-700 border-amber-200 bg-amber-50";
    return "text-emerald-700 border-emerald-200 bg-emerald-50";
  };

  // Export report PDF/JSON data
  const handleExportReport = async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/investigations/${data.investigation.id}/report`, {
        method: "POST"
      });
      if (res.ok) {
        const rep = await res.json();
        // Trigger file download
        const fullUrl = `http://localhost:8000${rep.report_path}`;
        window.open(fullUrl, "_blank");
      }
    } catch (e) {
      alert("Failed to export forensic report.");
    }
  };

  // --- Pipeline Steps Progress Mapping (Screen 3) ---
  const auditTypes = data.audit.map(a => a.event_type);
  const getPipelineSteps = () => {
    const isFailed = currentStatus === "failed";
    const statusOf = (completeEvent: string, startEvent?: string) => {
      if (auditTypes.includes(completeEvent)) return "completed";
      if (isFailed) return "failed";
      if (startEvent && auditTypes.includes(startEvent)) return "processing";
      if (currentStatus === "running") return "processing";
      return "pending";
    };

    return [
      { id: "ingestion", label: "Media Ingestion", status: "completed" },
      { id: "metadata", label: "Metadata Analysis", status: statusOf("METADATA_EXTRACTED", "ANALYSIS_STARTED") },
      { id: "c2pa", label: "C2PA Inspection", status: statusOf("C2PA_CHECKED", "ANALYSIS_STARTED") },
      { id: "frames", label: "Frame Analysis", status: statusOf("FRAME_ANALYSIS_COMPLETED", "METADATA_EXTRACTED") },
      { id: "ai", label: "Gemini Multimodal Analysis", status: statusOf("AI_ANALYSIS_COMPLETED", "C2PA_CHECKED") },
      { id: "source", label: "Source Discovery", status: statusOf("SOURCE_SEARCH_COMPLETED", "AI_ANALYSIS_COMPLETED") },
      { id: "propagation", label: "Propagation Analysis", status: statusOf("PROPAGATION_GRAPH_CREATED", "SOURCE_SEARCH_COMPLETED") },
      { id: "plim", label: "TRACE-PLIM Assessment", status: currentStatus === "completed" ? "completed" : isFailed ? "failed" : "pending" }
    ];
  };

  const steps = getPipelineSteps();

  // --- Timeline Chronological Sorting (Screen 9) ---
  const getSortedTimeline = () => {
    const events: any[] = [];
    
    // EXIF metadata creation date
    const metaFinding = data.findings.find(f => f.category === "metadata");
    if (metaFinding?.evidence) {
      try {
        const ev = JSON.parse(metaFinding.evidence);
        if (ev.creation_date) {
          events.push({
            timestamp: ev.creation_date,
            type: "Observed",
            event: "EXIF Timestamp capture date.",
            evidence: `Camera capture date tag matches exactly: ${ev.creation_date}`,
            platform: ev.camera_make || "Original Camera Capture"
          });
        }
      } catch {}
    }

    // Source Candidates discovery and publication dates
    data.sources.forEach(cand => {
      if (cand.publication_time) {
        events.push({
          timestamp: cand.publication_time,
          type: "Observed",
          event: `Published public instance.`,
          evidence: `Indexed public entry title: "${cand.title}"`,
          platform: cand.platform,
          url: cand.url
        });
      } else if (cand.discovered_time) {
        events.push({
          timestamp: cand.discovered_time,
          type: "Estimated",
          event: `Estimated publication crawl window.`,
          evidence: `Crawl discover timestamp logged. URL: ${cand.url}`,
          platform: cand.platform,
          url: cand.url
        });
      }
    });

    // Propagation nodes
    data.graph.nodes.forEach(node => {
      if (node.data?.timestamp) {
        events.push({
          timestamp: node.data.timestamp,
          type: "Observed",
          event: `Propagation node spread: ${node.data.label}`,
          evidence: `Platform path logged: ${node.data.platform}`,
          platform: node.data.platform,
          url: node.data.url
        });
      }
    });

    // Sort chronologically
    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  };

  const timelineEvents = getSortedTimeline();

  // --- Filtering source candidates (Screen 8) ---
  const filteredSources = data.sources.filter(s => {
    if (providerFilter === "all") return true;
    return s.discovery_method.toLowerCase().includes(providerFilter);
  });

  // --- SCREEN 3: Running Pipeline Progress View ---
  if (isRunning) {
    const latestLog = data.audit[0]?.description || "Initializing pipelines...";
    return (
      <div className="p-8 max-w-xl mx-auto space-y-8 flex-1 bg-slate-50 flex flex-col justify-center min-h-[80vh]">
        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-[#1b365d] animate-spin" />
            <h3 className="text-xl font-bold text-slate-800">Processing Media Evidence</h3>
            <p className="text-slate-500 text-sm max-w-sm">
              TRACE-AI is parsing headers, running ELA compression plots, and matching narrative propagation.
            </p>
          </div>

          <div className="border-t border-slate-100 pt-6 text-left space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Analysis Pipeline</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {steps.map((s, idx) => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-mono">0{idx + 1}.</span>
                    <span className="font-semibold text-slate-700">{s.label}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                    s.status === "completed" 
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                      : s.status === "processing" 
                        ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse" 
                        : "bg-slate-100 text-slate-400 border-slate-200"
                  }`}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs font-mono text-left space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Latest Log Action</span>
            <p className="text-[#1b365d] truncate leading-normal">{latestLog}</p>
          </div>
        </div>
      </div>
    );
  }

  // --- SCREEN 3: Failed Pipeline View ---
  if (currentStatus === "failed") {
    return (
      <div className="p-8 max-w-md mx-auto space-y-6 flex-1 bg-slate-50 flex flex-col justify-center min-h-[70vh]">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-6 shadow-sm">
          <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-full w-fit mx-auto">
            <XCircle className="w-12 h-12" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-800">Forensic Pipeline Failure</h3>
            <p className="text-slate-500 text-xs leading-relaxed">
              An error occurred while calculating hashes, querying search providers, or executing Gemini.
            </p>
          </div>
          {data.audit.find(a => a.event_type === "ANALYSIS_FAILED") && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-left font-mono text-xs text-red-700">
              {data.audit.find(a => a.event_type === "ANALYSIS_FAILED")?.description}
            </div>
          )}
          <button 
            onClick={() => onRefresh && onRefresh()}
            className="w-full bg-[#1b365d] hover:bg-[#152a4a] text-white font-bold py-2.5 rounded-lg text-sm transition-all shadow-sm"
          >
            Retry Pipeline Analysis
          </button>
          <Link href="/dashboard" className="block text-xs font-semibold text-slate-500 hover:underline">
            Return to Operations Center
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
      
      {/* Workspace Sub Header (Screens 4) */}
      <div className="bg-white border-b border-slate-200 px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold text-[#1b365d]">
              {data.investigation.case_number || `CASE-${data.investigation.id.substring(0,8).toUpperCase()}`}
            </span>
            {isDemo && (
              <span className="bg-[#1b365d]/10 text-[#1b365d] border border-[#1b365d]/20 px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider">
                SANDBOX DEMO WORKSPACE
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-800">{data.investigation.title}</h2>
          <p className="text-xs text-slate-500 line-clamp-1">{data.investigation.description || "No description set."}</p>
        </div>

        {/* Forensic Summary Panel */}
        <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="text-right">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">TRACE-PLIM Analytical Score</p>
            <p className="text-lg font-bold font-mono text-slate-800">{scores.overall.toFixed(1)}%</p>
          </div>
          <div className={`px-2.5 py-1 rounded text-xs font-bold uppercase border ${getRiskBadgeColor(scores.overall)}`}>
            {scores.overall > 70 ? "Critical Risk" : scores.overall > 40 ? "Medium Risk" : "Low Risk"}
          </div>
        </div>
      </div>

      {/* Workspace Tabs Panel */}
      <div className="bg-white border-b border-slate-200 px-8 flex overflow-x-auto gap-2 select-none shadow-sm">
        {[
          { id: "overview", label: "Media Overview", icon: FileImage },
          { id: "findings", label: "Forensic Findings", icon: Activity },
          { id: "provenance", label: "EXIF & C2PA", icon: ShieldCheck },
          { id: "sources", label: "Source Candidates", icon: Globe },
          { id: "propagation", label: "Propagation Graph", icon: TrendingUp },
          { id: "narrative", label: "Source Timeline", icon: Clock },
          { id: "plim", label: "TRACE-PLIM Assessment", icon: Sliders },
          { id: "reports", label: "Report & Audit", icon: FileText }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold tracking-wide border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                isActive 
                  ? "border-[#1b365d] text-[#1b365d]" 
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab Views Content */}
      <div className="p-8 flex-1 overflow-y-auto">
        
        {/* OVERVIEW TAB (Screen 4) */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-fade-in">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Analytical Score</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <h4 className="text-3xl font-extrabold text-slate-800 font-mono">{scores.overall.toFixed(1)}%</h4>
                  <span className="text-[10px] text-slate-500">Risk rating</span>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AI Assessment</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <h4 className="text-3xl font-extrabold text-slate-800 font-mono">
                    {Math.round((data.findings.find(f => f.category === "ai_analysis")?.evidence ? 
                      JSON.parse(data.findings.find(f => f.category === "ai_analysis")!.evidence!).ai_generation_likelihood : 0.0) * 100)}%
                  </h4>
                  <span className="text-[10px] text-slate-500">AI Likelihood</span>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Source Candidates</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <h4 className="text-3xl font-extrabold text-slate-800 font-mono">{data.sources.length}</h4>
                  <span className="text-[10px] text-slate-500">Indexed urls</span>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Propagation Nodes</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <h4 className="text-3xl font-extrabold text-slate-800 font-mono">{data.graph.nodes.length}</h4>
                  <span className="text-[10px] text-slate-500">Spread channels</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Media Preview Box */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-base text-slate-800">Media Preview</h3>
                  <p className="text-slate-500 text-xs">Immutable original representation of the case evidence asset.</p>
                </div>
                {data.media ? (
                  <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 flex items-center justify-center min-h-[300px] mt-4 relative overflow-hidden group">
                    {data.media.mime_type.startsWith("image/") ? (
                      <img 
                        src={getMediaUrl(data.media.storage_path)} 
                        alt="Suspicious Media" 
                        className="max-h-[350px] object-contain rounded"
                      />
                    ) : (
                      <video 
                        src={getMediaUrl(data.media.storage_path)} 
                        controls 
                        className="max-h-[350px] w-full object-contain rounded"
                      />
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-lg p-12 text-center text-slate-400 border border-slate-200 mt-4">
                    No media uploaded yet.
                  </div>
                )}
              </div>

              {/* Key Findings Ledger (Screen 4 Key Findings) */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
                <div>
                  <h3 className="font-bold text-base text-slate-800">Key Findings</h3>
                  <p className="text-slate-500 text-xs">Evaluations mapped to precision categories.</p>
                </div>
                
                {data.findings.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No forensic findings discovered.</p>
                ) : (
                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {data.findings.map((f, idx) => (
                      <div key={f.id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5 hover:border-slate-300 transition-all">
                        <div className="flex justify-between items-center">
                          <span className={`px-2 py-0.5 rounded text-[8px] uppercase font-bold border ${
                            f.evidence_level === "OBSERVED" 
                              ? "bg-blue-50 text-blue-700 border-blue-200" 
                              : f.evidence_level === "INFERRED"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-red-50 text-red-700 border-red-200"
                          }`}>
                            {f.evidence_level}
                          </span>
                          <span className="font-mono text-slate-400 text-[9px] uppercase">{f.category}</span>
                        </div>
                        <p className="font-medium text-slate-700">{f.finding}</p>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Method: {f.method || "Inspection"}</span>
                          <span>Confidence: {f.confidence}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 5: Media Forensics tab */}
        {activeTab === "findings" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            {/* Technical Verification Info */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div>
                <h3 className="font-bold text-base text-slate-800">Media Evidence Index</h3>
                <p className="text-slate-500 text-xs">Cryptographic parameters and container file properties.</p>
              </div>

              {data.media ? (
                <div className="space-y-4 text-xs">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">SHA-256 Checksum</span>
                    <p className="font-mono text-[#1b365d] break-all select-all font-bold text-sm bg-white p-2.5 rounded border border-slate-200">
                      {data.media.sha256}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">File size</span>
                      <span className="text-slate-700 font-mono font-bold text-sm">
                        {`${(data.media.size_bytes / 1024 / 1024).toFixed(2)} MB`}
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">MIME format</span>
                      <span className="text-slate-700 font-mono font-bold text-sm">{data.media.mime_type}</span>
                    </div>
                  </div>

                  {/* Video Codec Specifications */}
                  {data.media.mime_type.startsWith("video/") && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">ffprobe Stream Parameters</span>
                      {(() => {
                        const metaFinding = data.findings.find(f => f.category === "metadata");
                        if (metaFinding?.evidence) {
                          try {
                            const ev = JSON.parse(metaFinding.evidence);
                            return (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
                                <div>
                                  <span className="text-[9px] text-slate-400 block">Resolution</span>
                                  <span className="text-slate-700 font-bold">{ev.width}x{ev.height}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-slate-400 block">Framerate</span>
                                  <span className="text-slate-700 font-bold">{ev.fps?.toFixed(1) || "N/A"} FPS</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-slate-400 block">Duration</span>
                                  <span className="text-slate-700 font-bold">{ev.duration_s?.toFixed(1) || "N/A"}s</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-slate-400 block">Video Codec</span>
                                  <span className="text-slate-700 font-bold uppercase">{ev.codec || "unknown"}</span>
                                </div>
                              </div>
                            );
                          } catch {}
                        }
                        return <p className="text-slate-400">Stream details not parsed yet.</p>;
                      })()}
                    </div>
                  )}

                  {/* Representative Frames Gallery for Video */}
                  {data.media.mime_type.startsWith("video/") && (
                    <div className="space-y-3 pt-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Representative sampled frames</span>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {data.findings
                          .filter(f => f.category === "temporal" && f.evidence)
                          .map((f, idx) => {
                            try {
                              const ev = JSON.parse(f.evidence!);
                              return (
                                <div 
                                  key={idx} 
                                  onClick={() => setSelectedFrame({ ...ev, finding: f.finding })}
                                  className="group border border-slate-200 rounded-lg overflow-hidden bg-slate-50 cursor-pointer hover:border-[#1b365d] transition-all"
                                >
                                  <img 
                                    src={getMediaUrl(ev.frame_path)} 
                                    alt={`Frame ${idx}`} 
                                    className="h-16 w-full object-cover group-hover:scale-105 transition-all"
                                  />
                                  <div className="p-1.5 text-center text-[9px] font-mono text-slate-500">
                                    Frame {ev.frame_path.split("frame_")[1]?.split(".jpg")[0]}
                                  </div>
                                </div>
                              );
                            } catch {
                              return null;
                            }
                          })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No media uploaded.</p>
              )}
            </div>

            {/* Error Level Analysis (ELA) */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm h-fit">
              <div>
                <h3 className="font-bold text-base text-slate-800">Error Level Analysis (ELA)</h3>
                <p className="text-slate-500 text-xs">Resaved compression differences mapping.</p>
              </div>

              {(() => {
                const compFinding = data.findings.find(f => f.category === "compression");
                if (compFinding?.evidence) {
                  try {
                    const ev = JSON.parse(compFinding.evidence);
                    return (
                      <div className="space-y-4">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex justify-center">
                          <img 
                            src={getMediaUrl(ev.ela_image_path)} 
                            alt="ELA Compression Mapping" 
                            className="max-h-[180px] object-contain rounded"
                          />
                        </div>
                        <p className="text-xs text-slate-600 leading-normal">
                          Lighter pixels highlight regions that undergo differential changes during compression cycles, hinting at localized image editing or layer splicing.
                        </p>
                      </div>
                    );
                  } catch {}
                }
                return (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    ELA mapping is not available for this media category.
                  </p>
                );
              })()}
            </div>

            {/* Lightbox frame modal */}
            {selectedFrame && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h4 className="font-bold text-slate-800 text-sm">Sampled Video Frame Inspection</h4>
                    <button 
                      onClick={() => setSelectedFrame(null)}
                      className="text-slate-400 hover:text-slate-700 text-xs font-bold font-mono"
                    >
                      CLOSE [X]
                    </button>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 flex justify-center max-h-[250px] overflow-hidden">
                    <img 
                      src={getMediaUrl(selectedFrame.frame_path)} 
                      alt="Sampled Frame" 
                      className="object-contain max-h-[240px]"
                    />
                  </div>
                  <div className="text-xs space-y-3 font-mono">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                        <span className="text-[9px] text-slate-400 block font-sans">BRIGHTNESS</span>
                        <span className="text-slate-800 font-bold">{selectedFrame.brightness?.toFixed(2)}</span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                        <span className="text-[9px] text-slate-400 block font-sans">PIXEL VARIANCE</span>
                        <span className="text-slate-800 font-bold">{selectedFrame.variance?.toFixed(2)}</span>
                      </div>
                    </div>
                    {selectedFrame.perceptual_hash && (
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200 space-y-1">
                        <span className="text-[9px] text-slate-400 block font-sans">FRAME PERCEPTUAL HASH (pHash)</span>
                        <span className="text-[#1b365d] font-bold select-all break-all">{selectedFrame.perceptual_hash}</span>
                      </div>
                    )}
                    {selectedFrame.average_hash && (
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200 space-y-1">
                        <span className="text-[9px] text-slate-400 block font-sans">FRAME AVERAGE HASH (aHash)</span>
                        <span className="text-[#1b365d] font-bold select-all break-all">{selectedFrame.average_hash}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SCREEN 6: Forensic Findings Tab */}
        {activeTab === "findings" && (
          <div className="space-y-6 animate-fade-in">
            {/* Treated in Overview Tab or we can render details here if overview tab switches */}
          </div>
        )}

        {/* SCREEN 7: C2PA & Metadata tab */}
        {activeTab === "provenance" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            
            {/* EXIF Data Panel */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
              <div>
                <h3 className="font-bold text-base text-slate-800">EXIF Headers Index</h3>
                <p className="text-slate-500 text-xs">Discovered metadata parameters and capture hardware signatures.</p>
              </div>
              
              {(() => {
                const metaFinding = data.findings.find(f => f.category === "metadata");
                if (!metaFinding) {
                  return <p className="text-xs text-slate-400 py-4 text-center">No metadata headers discovered in file stream.</p>;
                }
                
                let software = "N/A";
                let creationDate = "N/A";
                let make = "N/A";
                let model = "N/A";
                
                try {
                  const ev = JSON.parse(metaFinding.evidence || "{}");
                  software = ev.software || "N/A";
                  creationDate = ev.creation_date || "N/A";
                  make = ev.camera_make || "N/A";
                  model = ev.camera_model || "N/A";
                } catch {}

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-100 pb-2">
                          <th className="pb-2">Metadata Tag</th>
                          <th className="pb-2">Header Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        <tr>
                          <td className="py-2.5 text-slate-400 font-semibold">Camera Capture Make</td>
                          <td className="py-2.5">{make}</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 text-slate-400 font-semibold">Camera Model</td>
                          <td className="py-2.5">{model}</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 text-slate-400 font-semibold">Editing Software</td>
                          <td className={`py-2.5 font-bold ${software !== "N/A" ? "text-red-600" : ""}`}>
                            {software}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2.5 text-slate-400 font-semibold">Capture Timestamp</td>
                          <td className="py-2.5">{creationDate}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* C2PA Provenance credentials status (Screen 7) */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div>
                <h3 className="font-bold text-base text-slate-800">C2PA Credentials</h3>
                <p className="text-slate-500 text-xs">Verify manifest records and digital signing certificates.</p>
              </div>
              
              <div className="space-y-4">
                <div className={`p-4 rounded-lg border ${
                  data.c2pa.status === "VERIFIED" 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                    : data.c2pa.status === "PRESENT_UNVERIFIED"
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : data.c2pa.status === "INVALID"
                        ? "bg-red-50 border-red-200 text-red-700"
                        : "bg-slate-50 border-slate-200 text-slate-700"
                }`}>
                  <div className="flex items-start gap-2.5 text-xs">
                    <ShieldCheck className="w-5 h-5 shrink-0" />
                    <div>
                      <p className="font-bold uppercase tracking-wide">Status: {data.c2pa.status}</p>
                      <p className="text-slate-600 mt-1 leading-normal">
                        {data.c2pa.verification_result}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-500 leading-relaxed bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <span className="font-bold block text-slate-600 mb-1">C2PA Status Definitions:</span>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><b>VERIFIED:</b> Cryptographic signatures are present and validated against root stores.</li>
                    <li><b>PRESENT_UNVERIFIED:</b> Manifest signatures are present but lack trusted chains.</li>
                    <li><b>INVALID:</b> manifest signature check failed.</li>
                    <li><b>NOT_PRESENT:</b> No content credentials manifest was detected.</li>
                  </ul>
                </div>

                <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] leading-relaxed rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    <b>Important Rule:</b> The absence of C2PA Content Credentials must <b>NOT</b> be presented as proof of manipulation. Most media items shared online strip manifests.
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* SCREEN 8: Source Tracing Tab */}
        {activeTab === "sources" && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 animate-fade-in">
            {/* Provider Filter */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm h-fit">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Provider Filter</span>
              <div className="flex flex-col gap-2 text-xs">
                {[
                  { id: "all", label: "All Providers" },
                  { id: "langsearch", label: "LangSearch API" },
                  { id: "tavily", label: "Tavily Search" }
                ].map(p => (
                  <button 
                    key={p.id}
                    onClick={() => setProviderFilter(p.id as any)}
                    className={`px-3 py-2 rounded-lg font-bold border text-left transition-all ${
                      providerFilter === p.id 
                        ? "bg-[#1b365d] text-white border-[#1b365d]" 
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Manual search form */}
              <div className="border-t border-slate-100 pt-4 space-y-3 mt-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Manual Keyword Search</span>
                <form onSubmit={handleSearchSubmit} className="space-y-3">
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Keywords..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#1b365d]"
                  />
                  <button 
                    type="submit"
                    disabled={searching || !searchQuery}
                    className="w-full bg-slate-100 border border-slate-200 hover:bg-slate-200 text-[#1b365d] font-bold py-2 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {searching ? <Loader2 className="w-3 animate-spin" /> : null}
                    <span>Submit Query</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Deduplicated Source Candidates (Screen 8) */}
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
              <div>
                <h3 className="font-bold text-base text-slate-800">Source Candidates</h3>
                <p className="text-slate-500 text-xs">Identified public instances matching forensic claims.</p>
              </div>

              {filteredSources.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">No matching source candidates discovered.</p>
              ) : (
                <div className="space-y-4">
                  {(showAllSources ? filteredSources : filteredSources.slice(0, 5)).map((cand, idx) => (
                    <div key={cand.id || idx} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 hover:border-slate-300 transition-all text-xs">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-slate-400">Similarity: {Math.round(cand.similarity_score * 100)}%</span>
                        <div className="flex gap-2">
                          <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded uppercase font-bold">
                            {cand.discovery_method}
                          </span>
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded uppercase font-bold">
                            {cand.platform}
                          </span>
                        </div>
                      </div>

                      <div>
                        {/* Source labeling restriction */}
                        <span className="text-[9px] text-[#1b365d] font-bold uppercase tracking-wide block mb-1">
                          {idx === 0 ? "Earliest Discovered Public Instance" : "Source Candidate"}
                        </span>
                        <h4 className="font-bold text-slate-800 text-sm">{cand.title}</h4>
                      </div>

                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 text-[10px] text-slate-500 border-t border-slate-200/50 pt-2 font-mono">
                        <a 
                          href={cand.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-[#1b365d] hover:underline truncate max-w-sm focus:ring-2 focus:ring-[#1b365d] focus:outline-none"
                        >
                          {cand.url}
                        </a>
                        <div className="flex gap-4">
                          <span>Pub: {cand.publication_time ? new Date(cand.publication_time).toLocaleDateString() : "Unknown"}</span>
                          <span>Crawl: {new Date(cand.discovered_time).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredSources.length > 5 && (
                    <button 
                      onClick={() => setShowAllSources(!showAllSources)}
                      className="w-full py-2.5 bg-slate-100 border border-slate-200 text-[#1b365d] hover:bg-slate-200 font-bold text-xs rounded-lg transition-all focus:ring-2 focus:ring-[#1b365d] focus:outline-none cursor-pointer"
                    >
                      {showAllSources ? "Show Less Candidates" : `Show All Discovered Candidates (${filteredSources.length})`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCREEN 9: Source Timeline Tab */}
        {activeTab === "narrative" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            {/* Timeline Tree */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div>
                <h3 className="font-bold text-base text-slate-800">Source Timeline</h3>
                <p className="text-slate-500 text-xs">Chronological timeline reconstruction mapping.</p>
              </div>

              {timelineEvents.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No timeline events recorded.</p>
              ) : (
                <div className="relative border-l-2 border-slate-200 pl-6 space-y-6 ml-3">
                  {timelineEvents.map((ev, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedTimelineEvent(ev)}
                      className="relative group cursor-pointer"
                    >
                      <span className={`absolute -left-[31px] top-1.5 w-2.5 h-2.5 rounded-full border border-white ring-4 transition-all ${
                        ev.type === "Observed" 
                          ? "bg-emerald-500 ring-emerald-100" 
                          : ev.type === "Estimated" 
                            ? "bg-amber-500 ring-amber-100" 
                            : "bg-slate-400 ring-slate-100"
                      }`} />
                      
                      <div className="bg-slate-50 border border-slate-200 hover:border-[#1b365d] transition-all rounded-lg p-4 space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] font-mono">
                          <span className="text-slate-500 font-bold">{new Date(ev.timestamp).toLocaleString()}</span>
                          <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                            ev.type === "Observed" ? "text-emerald-700 bg-emerald-50 border border-emerald-100" : "text-amber-700 bg-amber-50 border border-amber-100"
                          }`}>{ev.type}</span>
                        </div>
                        <h4 className="font-bold text-slate-800 text-xs leading-normal">{ev.event}</h4>
                        <p className="text-[10px] text-slate-500 truncate">{ev.platform}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Click Event Details Sidebar */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm h-fit">
              <h3 className="font-bold text-base text-slate-800">Timeline Event Details</h3>
              {selectedTimelineEvent ? (
                <div className="space-y-4 text-xs">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                    <span className="text-[9px] text-slate-400 font-bold block uppercase">Precision Type</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                      selectedTimelineEvent.type === "Observed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>{selectedTimelineEvent.type}</span>
                    <h4 className="font-bold text-slate-800 text-sm mt-2">{selectedTimelineEvent.event}</h4>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                    <span className="text-[9px] text-slate-400 block font-bold uppercase">Evidence Log</span>
                    <p className="text-slate-700 font-mono leading-relaxed">{selectedTimelineEvent.evidence}</p>
                  </div>
                  {selectedTimelineEvent.url && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <span className="text-[9px] text-slate-400 block font-bold uppercase">Reference Link</span>
                      <a href={selectedTimelineEvent.url} target="_blank" rel="noopener noreferrer" className="text-[#1b365d] font-mono break-all hover:underline">
                        {selectedTimelineEvent.url}
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-8 text-center">Click on any timeline event card to view metadata verification trails.</p>
              )}
            </div>
          </div>
        )}

        {/* SCREEN 10: Propagation Network Graph */}
        {activeTab === "propagation" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            {/* Canvas */}
            <div className="lg:col-span-2 space-y-4">
              <div>
                <h3 className="font-bold text-base text-slate-800">Propagation Topology</h3>
                <p className="text-slate-500 text-xs">Drag and zoom grid showing spread directions.</p>
              </div>
              <PropagationFlow 
                nodes={data.graph.nodes} 
                edges={data.graph.edges}
                onNodeClick={(node) => setSelectedNode(node)}
              />
            </div>

            {/* Selected Node Details */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm h-fit">
              <h3 className="font-bold text-base text-slate-800">Node Details</h3>
              {selectedNode ? (
                <div className="space-y-4 text-xs">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                    <span className="px-2 py-0.5 rounded text-[8px] uppercase border font-bold bg-blue-50 text-[#1b365d] border-blue-100">
                      {selectedNode.data.node_type}
                    </span>
                    <h4 className="font-bold text-slate-800 text-sm mt-2">{selectedNode.data.label}</h4>
                    <p className="text-slate-500 font-mono text-[9px] break-all leading-normal">{selectedNode.data.url}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Platform</span>
                      <span className="text-slate-700 font-bold">{selectedNode.data.platform}</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Reliability</span>
                      <span className="text-slate-700 font-bold uppercase">{selectedNode.data.confidence}</span>
                    </div>
                  </div>

                  {selectedNode.data.timestamp && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Logged Date</span>
                      <span className="text-slate-700 font-mono">{new Date(selectedNode.data.timestamp).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-8 text-center">Click on any network node to display verification details.</p>
              )}
            </div>
          </div>
        )}

        {/* SCREEN 11: TRACE-PLIM Analysis Tab */}
        {activeTab === "plim" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
            {/* Weight Calibration Sliders */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-sm h-fit">
              <div>
                <h3 className="font-bold text-base text-slate-800">Scoring weights</h3>
                <p className="text-slate-500 text-xs">Tune coefficients inside the dynamic PLIM model.</p>
              </div>
              
              <div className="space-y-5 text-xs text-slate-600">
                <div className="space-y-2">
                  <div className="flex justify-between font-bold">
                    <span>Media Manipulation Score Coefficient</span>
                    <span className="font-mono text-[#1b365d]">{wManip}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="100" value={wManip} 
                    onChange={(e) => setWManip(Number(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1b365d]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between font-bold">
                    <span>Metadata Inconsistency Score Coefficient</span>
                    <span className="font-mono text-[#1b365d]">{wMeta}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="100" value={wMeta} 
                    onChange={(e) => setWMeta(Number(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1b365d]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between font-bold">
                    <span>Propagation Anomaly Score Coefficient</span>
                    <span className="font-mono text-[#1b365d]">{wProp}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="100" value={wProp} 
                    onChange={(e) => setWProp(Number(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1b365d]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between font-bold">
                    <span>Narrative Evolution Coefficient</span>
                    <span className="font-mono text-[#1b365d]">{wNarr}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="100" value={wNarr} 
                    onChange={(e) => setWNarr(Number(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1b365d]"
                  />
                </div>
                
                <div className="border-t border-slate-100 pt-4 flex justify-between font-mono font-bold text-xs">
                  <span className="text-slate-400">Total Sum Coefficient:</span>
                  <span className={wManip + wMeta + wProp + wNarr === 100 ? "text-emerald-600" : "text-red-600"}>
                    {wManip + wMeta + wProp + wNarr}% / 100%
                  </span>
                </div>
              </div>
            </div>

            {/* Score Output */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div>
                <h3 className="font-bold text-base text-slate-800">TRACE-PLIM Assessment</h3>
                <p className="text-slate-500 text-xs">Evidence-backed analytical framework metric output.</p>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Analytical Score</span>
                    <h4 className="text-4xl font-extrabold text-slate-800 font-mono">{scores.overall.toFixed(1)}%</h4>
                  </div>
                  <span className={`px-3 py-1 rounded text-xs font-bold uppercase border ${getRiskBadgeColor(scores.overall)}`}>
                    {scores.overall > 70 ? "Critical" : scores.overall > 40 ? "Medium" : "Low"}
                  </span>
                </div>

                {/* Bars */}
                <div className="space-y-4 text-xs text-slate-600">
                  <div className="space-y-1.5">
                    <div className="flex justify-between font-bold">
                      <span>Image Manipulation (Weight: {wManip}%)</span>
                      <span className="font-mono text-slate-800">{scores.manip.toFixed(1)}/100</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-red-500 h-full rounded-full" style={{ width: `${scores.manip}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between font-bold">
                      <span>Metadata Anomalies (Weight: {wMeta}%)</span>
                      <span className="font-mono text-slate-800">{scores.meta.toFixed(1)}/100</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: `${scores.meta}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between font-bold">
                      <span>Propagation Scope (Weight: {wProp}%)</span>
                      <span className="font-mono text-slate-800">{scores.prop.toFixed(1)}/100</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full" style={{ width: `${scores.prop}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between font-bold">
                      <span>Narrative Evolution (Weight: {wNarr}%)</span>
                      <span className="font-mono text-slate-800">{scores.narr.toFixed(1)}/100</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${scores.narr}%` }} />
                    </div>
                  </div>
                </div>

                {/* Disclaimer alert */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-500 leading-relaxed">
                  <b>Analytical Limitations:</b> TRACE-PLIM is an evidence-backed analytical framework to systematically structure and record observation variables, and does not serve as objective proof of real-world political influence, psychological effect, or public belief.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 12: Forensic Reports Tab */}
        {activeTab === "reports" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            {/* Case Notes Editor */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-4 flex flex-col h-fit shadow-sm">
              <div>
                <h3 className="font-bold text-base text-slate-800">Officer Investigation Notes</h3>
                <p className="text-slate-500 text-xs">Append officer log metrics, witness remarks, or case files.</p>
              </div>
              <textarea 
                rows={8}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Append officer observations..."
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-[#1b365d] resize-none"
              />
              <div className="flex justify-between items-center pt-2">
                <span className="text-[10px] text-slate-400 font-mono">Last edited: Just now</span>
                <button 
                  onClick={handleExportReport}
                  className="flex items-center gap-1.5 bg-[#1b365d] hover:bg-[#152a4a] text-white font-bold px-4 py-2.5 rounded-lg text-xs transition-all shadow-sm cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Report</span>
                </button>
              </div>
            </div>

            {/* Audit Logs */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <History className="w-4.5 h-4.5 text-[#1b365d]" />
                <span>Case Chain of Custody</span>
              </h3>

              {data.audit.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No chain records.</p>
              ) : (
                <div className="space-y-4 overflow-y-auto max-h-[300px] pr-1">
                  {data.audit.map((aud) => (
                    <div key={aud.id} className="text-[10px] bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
                      <div className="flex justify-between text-slate-400 font-mono">
                        <span className="font-bold text-slate-500">{aud.event_type}</span>
                        <span>{new Date(aud.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-slate-600 font-mono">{aud.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
export type { WorkspaceData };
