"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { 
  FileText, 
  ShieldCheck, 
  ShieldAlert,
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
  CornerRightDown,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Info,
  Maximize2,
  Upload
} from "lucide-react";
import PropagationFlow from "./propagation-flow";
import EmptyState from "./empty-state";
import { API_BASE_URL } from "@/config";

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
  const [activeTab, setActiveTab] = useState<"overview" | "forensics" | "findings" | "c2pa" | "sources" | "propagation" | "timeline" | "plim" | "reports">("overview");
  
  const searchParams = useSearchParams();
  const tabParam = searchParams ? searchParams.get("tab") : null;

  useEffect(() => {
    if (tabParam) {
      const validTabs = ["overview", "forensics", "findings", "c2pa", "sources", "propagation", "timeline", "plim", "reports"];
      // Support legacy mappings
      let mapped = tabParam;
      if (tabParam === "provenance") mapped = "c2pa";
      if (tabParam === "narrative") mapped = "timeline";
      
      if (validTabs.includes(mapped)) {
        setActiveTab(mapped as any);
      }
    }
  }, [tabParam]);

  // Persist case ID
  useEffect(() => {
    if (data.investigation.id && !isDemo && typeof window !== "undefined") {
      localStorage.setItem("last_active_case", data.investigation.id);
    }
  }, [data.investigation.id, isDemo]);

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
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  const [forensicView, setForensicView] = useState<"original" | "ela">("original");
  const videoRef = React.useRef<HTMLVideoElement>(null);
  
  // Source Tracing provider filter
  const [providerFilter, setProviderFilter] = useState<"all" | "langsearch" | "tavily">("all");
  
  // Selected Timeline event details
  const [selectedTimelineEvent, setSelectedTimelineEvent] = useState<any>(null);
  
  // Show all sources toggle state
  const [showAllSources, setShowAllSources] = useState(false);
  const [communicationIntent, setCommunicationIntent] = useState<"PROMOTIONAL" | "INFORMATIONAL" | "PERSUASIVE" | "POLITICAL" | "PUBLIC_SERVICE" | "ENTERTAINMENT" | "UNCLEAR">("INFORMATIONAL");

  // Authoritative assessment state
  const [assessment, setAssessment] = useState<any>(null);
  const [loadingAssessment, setLoadingAssessment] = useState(false);
  const [savingWeights, setSavingWeights] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [lastNotesSaved, setLastNotesSaved] = useState<string>("");
  
  // Media access url states
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [mediaUrlStatus, setMediaUrlStatus] = useState<"LOADING" | "READY" | "EXPIRED" | "ERROR">("LOADING");
  const [hasRefreshedUrl, setHasRefreshedUrl] = useState(false);

  const fetchAssessment = async () => {
    if (isDemo) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/investigations/${data.investigation.id}/assessment`);
      if (res.ok) {
        const payload = await res.json();
        setAssessment(payload);
      }
    } catch (e) {
      console.error("Failed to load backend assessment:", e);
    }
  };

  const getMediaUrl = (path: string) => {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  };

  const fetchMediaUrl = async (force = false) => {
    if (!data.media || isDemo) {
      setMediaUrlStatus("ERROR");
      return;
    }
    
    if (mediaUrlStatus === "READY" && !force) return;
    
    setMediaUrlStatus("LOADING");
    try {
      const res = await fetch(`${API_BASE_URL}/api/media/${data.media.id}/access-url`);
      if (res.ok) {
        const payload = await res.json();
        setMediaUrl(payload.url);
        setMediaUrlStatus("READY");
      } else {
        setMediaUrlStatus("ERROR");
      }
    } catch (e) {
      console.error("Error fetching media access URL:", e);
      setMediaUrlStatus("ERROR");
    }
  };

  // Load configuration weights, notes and assessment on mount
  useEffect(() => {
    if (isDemo) return;
    
    // Fetch weights
    fetch(`${API_BASE_URL}/api/settings/weights`)
      .then(res => res.json())
      .then(w => {
        setWManip(w.media_manipulation);
        setWMeta(w.metadata_inconsistency);
        setWProp(w.propagation_anomaly);
        setWNarr(w.narrative_evolution);
      })
      .catch(e => console.error("Error loading weights:", e));
      
    // Fetch notes
    fetch(`${API_BASE_URL}/api/investigations/${data.investigation.id}/notes`)
      .then(res => res.json())
      .then(n => {
        if (n && n.note) {
          setNotes(n.note);
          setLastNotesSaved(n.note);
        }
      })
      .catch(e => console.error("Error loading notes:", e));
      
    // Fetch intent override or fallback to default intent finding
    fetch(`${API_BASE_URL}/api/investigations/${data.investigation.id}`)
      .then(res => res.json())
      .then(inv => {
        if (inv && inv.analyst_intent) {
          setCommunicationIntent(inv.analyst_intent);
        } else {
          // Read from description fallback
          try {
            const parsed = JSON.parse(inv.description);
            if (parsed && parsed.analyst_intent) {
              setCommunicationIntent(parsed.analyst_intent);
              return;
            }
          } catch {}
          const contentFinding = data.findings.find(f => f.category === "content_analysis");
          if (contentFinding && contentFinding.evidence) {
            try {
              const ev = JSON.parse(contentFinding.evidence);
              if (ev.classification) {
                setCommunicationIntent(ev.classification);
              }
            } catch {}
          }
        }
      })
      .catch(() => {});
    
    // Fetch assessment
    fetchAssessment();
    fetchMediaUrl();
  }, [data.investigation.id, isDemo, data.media]);

  const handleSaveWeights = async (manip: number, meta: number, prop: number, narr: number) => {
    if (isDemo) return;
    setSavingWeights(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/weights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_manipulation: manip,
          metadata_inconsistency: meta,
          propagation_anomaly: prop,
          narrative_evolution: narr
        })
      });
      if (res.ok) {
        await fetchAssessment();
      } else {
        const err = await res.json();
        alert(`Failed to save weights: ${err.detail}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to save weights.");
    } finally {
      setSavingWeights(false);
    }
  };

  const handleSaveNotes = async () => {
    if (isDemo) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/investigations/${data.investigation.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: notes, author: "System Operator" })
      });
      if (res.ok) {
        setLastNotesSaved(notes);
      }
    } catch (e) {
      console.error("Failed to save notes:", e);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleSaveIntentOverride = async (intent: string) => {
    if (isDemo) return;
    setCommunicationIntent(intent as any);
    try {
      await fetch(`${API_BASE_URL}/api/investigations/${data.investigation.id}/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent })
      });
    } catch (e) {
      console.error("Failed to save intent override:", e);
    }
  };

  // Status variables
  const currentStatus = data.investigation.status.toLowerCase();
  const isRunning = currentStatus === "pending" || currentStatus === "running";

  // 1. Live Pipeline Polling if the investigation status is pending/running
  useEffect(() => {
    if (!isRunning || isDemo || !onRefresh) return;
    
    const interval = setInterval(() => {
      onRefresh();
      fetchAssessment();
    }, 1500);

    return () => clearInterval(interval);
  }, [isRunning, isDemo, onRefresh]);

  // 2. Dynamic PLIM Calculations
  const scores = (() => {
    // If backend assessment is available, use it directly!
    if (assessment) {
      const state = assessment.state;
      const scoresBreakdown = assessment.scores || {};
      
      return {
        overall: state === "INSUFFICIENT_EVIDENCE" || state === "NOT_ANALYZED" ? null : assessment.overall_score,
        manip: scoresBreakdown.media_manipulation !== undefined ? scoresBreakdown.media_manipulation : 10.0,
        meta: scoresBreakdown.metadata_inconsistency !== undefined ? scoresBreakdown.metadata_inconsistency : 10.0,
        prop: scoresBreakdown.propagation_anomaly !== undefined ? scoresBreakdown.propagation_anomaly : 10.0,
        narr: scoresBreakdown.narrative_evolution !== undefined ? scoresBreakdown.narrative_evolution : 10.0,
        state
      };
    }
    
    // Otherwise fallback to client side calculations
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
    
    // If no evidence is present in the pipeline (no findings, sources or narratives), represent it as insufficient evidence
    const hasEvidence = data.findings.length > 0 || data.sources.length > 0 || data.narrative.versions.length > 0;
    
    return {
      overall: hasEvidence ? Math.min(Math.max(overall, 10.0), 100.0) : null,
      manip,
      meta,
      prop,
      narr,
      state: hasEvidence ? "ANALYZED" : "INSUFFICIENT_EVIDENCE"
    };
  })();

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

  const getRiskBadgeColor = (score: number | null) => {
    if (score === null) return "text-slate-500 border-slate-200 bg-slate-50";
    if (score > 70) return "text-red-700 border-red-200 bg-red-50";
    if (score > 40) return "text-amber-700 border-amber-200 bg-amber-50";
    return "text-emerald-700 border-emerald-200 bg-emerald-50";
  };

  // Export report PDF/JSON data
  const handleExportReport = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/investigations/${data.investigation.id}/report`, {
        method: "POST"
      });
      if (res.ok) {
        const rep = await res.json();
        // Trigger file download
        const fullUrl = `${API_BASE_URL}${rep.report_path}`;
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
      let estState = "Estimated";
      if (cand.evidence) {
        try {
          const ev = JSON.parse(cand.evidence);
          if (ev.timestamp_state) {
            estState = ev.timestamp_state;
          }
        } catch {}
      }

      if (cand.publication_time) {
        events.push({
          timestamp: cand.publication_time,
          type: estState,
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
  const filteredSources = data.sources
    .filter(s => {
      if (providerFilter === "all") return true;
      return s.discovery_method.toLowerCase().includes(providerFilter);
    })
    .sort((a, b) => {
      const aTime = a.publication_time ? new Date(a.publication_time).getTime() : Infinity;
      const bTime = b.publication_time ? new Date(b.publication_time).getTime() : Infinity;
      return aTime - bTime;
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

  const isAiUnavailable = data.findings.some(f => f.category === "ai_analysis" && f.evidence && f.evidence.includes('"ai_status": "UNAVAILABLE"'));

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
      
      {/* AI Unavailable warning banner */}
      {isAiUnavailable && (
        <div className="bg-amber-50 border-b border-amber-200 px-8 py-3.5 text-amber-800 text-xs font-bold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>AI-assisted analysis temporarily unavailable. Direct cryptographic check & rule classifications remain active.</span>
        </div>
      )}
      
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
            <p className="text-lg font-bold font-mono text-slate-800">
              {scores.overall !== null ? `${scores.overall.toFixed(1)}%` : "—"}
            </p>
          </div>
          <div className={`px-2.5 py-1 rounded text-xs font-bold uppercase border ${getRiskBadgeColor(scores.overall)}`}>
            {scores.overall !== null 
              ? (scores.overall > 70 ? "Critical Risk" : scores.overall > 40 ? "Medium Risk" : "Low Risk")
              : "INSUFFICIENT EVIDENCE"
            }
          </div>
        </div>
      </div>

      {/* Workspace Tabs Panel */}
      {data.media && (
        <div className="bg-white border-b border-slate-200 px-8 flex overflow-x-auto gap-2 select-none shadow-sm scrollbar-none">
          {[
            { id: "overview", label: "Overview", icon: FileImage },
            { id: "forensics", label: "Forensics", icon: Maximize2 },
            { id: "findings", label: "Findings", icon: Activity },
            { id: "c2pa", label: "C2PA", icon: ShieldCheck },
            { id: "sources", label: "Sources", icon: Globe },
            { id: "propagation", label: "Propagation", icon: TrendingUp },
            { id: "timeline", label: "Timeline", icon: Clock },
            { id: "plim", label: "TRACE-PLIM", icon: Sliders },
            { id: "reports", label: "Report", icon: FileText }
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
      )}

      {/* Main Tab Views Content */}
      <div className="p-8 flex-1 overflow-y-auto">
        
        {!data.media && (
          <div className="max-w-md mx-auto my-12 bg-white border border-slate-200 rounded-xl p-8 shadow-sm text-center space-y-5 animate-fade-in">
            <div className="w-16 h-16 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center mx-auto text-[#1b365d]">
              <Upload className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-slate-800">No evidence uploaded</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                No evidence has been added to this investigation yet.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href={`/upload?investigationId=${data.investigation.id}`}
                className="inline-flex items-center gap-1.5 bg-[#1b365d] hover:bg-[#152a4a] text-white font-bold px-6 py-2.5 rounded-lg text-xs transition-all shadow-sm cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Evidence</span>
              </Link>
            </div>
          </div>
        )}

        {/* OVERVIEW TAB (Screen 4) */}
        {data.media && activeTab === "overview" && (
          <div className="space-y-6 animate-fade-in">
            {data.findings.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  icon={ShieldAlert}
                  title="INSUFFICIENT EVIDENCE"
                  description="No sufficient forensic indicators or findings are available to compute an integrity score for this case asset. Run analysis or upload additional evidence."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Forensic Assessment & Indicators */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Forensic Assessment Summary */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Forensic Assessment</span>
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-slate-800 leading-tight">
                        {scores.overall === null
                          ? "Insufficient Evidence"
                          : scores.overall > 70 
                            ? "High Manipulation Likelihood" 
                            : scores.overall > 40 
                              ? "Medium Manipulation Likelihood" 
                              : "Low Manipulation Likelihood"}
                      </h3>
                      <p className="text-slate-500 text-xs leading-relaxed">
                        Based on {data.findings.length} supporting indicators discovered in ELA, metadata containers, and source crawls.
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Confidence</span>
                        <span className="text-xs font-bold text-[#1b365d] uppercase font-mono">
                          {scores.overall === null ? "—" : (scores.overall > 70 ? "High" : "Medium")}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Evidence Strength</span>
                        <span className="text-xs font-bold text-slate-700 uppercase">
                          {data.findings.length >= 4 ? "Strong" : data.findings.length >= 2 ? "Medium" : "Weak"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Overall Score</span>
                        <span className="text-xs font-mono font-bold text-slate-800">
                          {scores.overall !== null ? `${scores.overall.toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Performance Indicators Matrix */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
                    <h3 className="font-bold text-sm text-slate-800">Analytical Metrics Matrix</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                        <div className="flex justify-between font-semibold">
                          <span className="text-slate-700">Image Manipulation</span>
                          <span className="font-mono text-slate-850">{scores.manip.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>State: Analyzed</span>
                          <span>Confidence: High</span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                        <div className="flex justify-between font-semibold">
                          <span className="text-slate-700">Metadata Container</span>
                          <span className="font-mono text-slate-850">{scores.meta.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>State: Analyzed</span>
                          <span>Confidence: High</span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                        <div className="flex justify-between font-semibold">
                          <span className="text-slate-700">C2PA Provenance</span>
                          <span className="font-mono text-slate-850">
                            {data.c2pa.status === "VERIFIED" ? "Verified" : "Not Detected"}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>State: {data.c2pa.status}</span>
                          <span>Confidence: Conclusive</span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                        <div className="flex justify-between font-semibold">
                          <span className="text-slate-700">Source Discovery</span>
                          <span className="font-mono text-slate-850">{data.sources.length} Candidates</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>State: Searched</span>
                          <span>Confidence: Conclusive</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Assessment Summary Panel & Media */}
                <div className="space-y-6">
                  {/* Key Drivers Floating Panel */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Assessment Drivers</span>
                    <div className="space-y-3">
                      {[
                        {
                          name: "Metadata Inconsistency",
                          value: data.findings.some(f => f.category === "metadata" && f.severity === "high") ? "High" : "Low",
                          color: data.findings.some(f => f.category === "metadata" && f.severity === "high") ? "text-red-600" : "text-slate-600"
                        },
                        {
                          name: "Temporal Discontinuity",
                          value: data.findings.some(f => f.category === "temporal" && f.severity === "high") ? "High" : "Low",
                          color: data.findings.some(f => f.category === "temporal" && f.severity === "high") ? "text-red-600" : "text-slate-600"
                        },
                        {
                          name: "Compression Anomaly",
                          value: data.findings.some(f => f.category === "compression" && f.severity === "high") ? "High" : "Low",
                          color: data.findings.some(f => f.category === "compression" && f.severity === "high") ? "text-red-600" : "text-slate-600"
                        },
                        {
                          name: "C2PA Provenance",
                          value: data.c2pa.status === "VERIFIED" ? "Verified" : "Not Present",
                          color: data.c2pa.status === "VERIFIED" ? "text-emerald-600" : "text-slate-400"
                        }
                      ].map((driver, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs py-1.5 border-b border-slate-50 last:border-0">
                          <span className="text-slate-500 font-medium">{driver.name}</span>
                          <span className={`font-bold ${driver.color}`}>{driver.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Evidence Media Card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Evidence File</span>
                      <button 
                        onClick={() => setActiveTab("forensics")}
                        className="text-[10px] font-bold text-[#1b365d] hover:underline"
                      >
                        Inspect details →
                      </button>
                    </div>
                    {data.media ? (
                      <div className="bg-slate-50 rounded-lg p-2 border border-slate-100 flex items-center justify-center min-h-[160px] max-h-[200px] overflow-hidden">
                        {data.media.mime_type.startsWith("image/") ? (
                          <img 
                            src={getMediaUrl(data.media.storage_path)} 
                            alt="Media Preview" 
                            className="max-h-[180px] object-contain rounded"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 p-4 text-center">
                            <Play className="w-8 h-8 text-[#1b365d] fill-[#1b365d]/5" />
                            <span className="text-[11px] font-semibold text-slate-700 truncate max-w-[180px]">
                              {data.media.filename}
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono">
                              {(data.media.size_bytes / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No media uploaded.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === "forensics" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            {/* Left Column: Forensic Media Viewer */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-800">Forensic Media Viewer</h3>
                <p className="text-slate-500 text-xs">Examine frame timelines, anomaly markers, and ELA visualizations.</p>
              </div>

              {data.media ? (
                <div className="space-y-6">
                  {/* Media display */}
                  {data.media.mime_type.startsWith("video/") ? (
                    <div className="space-y-4">
                      {/* Video Player */}
                      <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 flex items-center justify-center min-h-[300px] relative overflow-hidden">
                        {mediaUrlStatus === "LOADING" ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-8 h-8 text-[#1b365d] animate-spin" />
                            <span className="text-xs text-slate-500 font-bold">Creating secure signed session...</span>
                          </div>
                        ) : mediaUrlStatus === "ERROR" ? (
                          <div className="flex flex-col items-center gap-3 p-6 text-center">
                            <ShieldAlert className="w-8 h-8 text-red-500" />
                            <p className="text-xs font-bold text-slate-700">Signed URL access token generation failed.</p>
                            <button
                              onClick={() => fetchMediaUrl(true)}
                              className="px-3 py-1.5 bg-[#1b365d] text-white rounded text-xs font-bold hover:bg-[#152a4a] transition-all"
                            >
                              Refresh Session
                            </button>
                          </div>
                        ) : (
                          <video 
                            ref={videoRef}
                            src={mediaUrl} 
                            onTimeUpdate={(e) => setVideoTime((e.target as HTMLVideoElement).currentTime)}
                            onLoadedMetadata={(e) => setVideoDuration((e.target as HTMLVideoElement).duration)}
                            onError={() => {
                              if (!hasRefreshedUrl) {
                                setHasRefreshedUrl(true);
                                fetchMediaUrl(true);
                              } else {
                                setMediaUrlStatus("ERROR");
                              }
                            }}
                            controls 
                            className="max-h-[350px] w-full object-contain rounded"
                          />
                        )}
                      </div>

                      {/* Timeline Seeker */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-mono text-slate-500 font-bold">
                            Time: {Math.floor(videoTime / 60)}:{String(Math.floor(videoTime % 60)).padStart(2, "0")} / {Math.floor(videoDuration / 60)}:{String(Math.floor(videoDuration % 60)).padStart(2, "0")}
                          </span>
                          <span className="text-[10px] text-slate-400">Click timeline markers to seek</span>
                        </div>

                        {/* Interactive Timeline track with ticks */}
                        <div className="relative h-6 bg-slate-100 rounded-lg border border-slate-200 flex items-center px-2">
                          <input 
                            type="range"
                            min="0"
                            max={videoDuration || 100}
                            step="0.1"
                            value={videoTime}
                            onChange={(e) => {
                              if (videoRef.current) {
                                videoRef.current.currentTime = Number(e.target.value);
                                setVideoTime(Number(e.target.value));
                              }
                            }}
                            className="w-full h-1.5 appearance-none bg-slate-250 rounded-full cursor-pointer accent-[#1b365d] relative z-10"
                          />
                          
                          {/* Anomaly ticks overlay */}
                          {data.findings
                            .filter(f => f.category === "temporal" && f.evidence)
                            .map((f, idx) => {
                              try {
                                const ev = JSON.parse(f.evidence!);
                                const path = ev.frame_path || ev.storage_path || "";
                                const frameNum = ev.frame_number !== undefined ? ev.frame_number : (ev.frame_index !== undefined ? ev.frame_index : parseInt(path.split("frame_")[1]?.split(".jpg")[0]) || 0);
                                const tickTime = ev.timestamp !== undefined ? ev.timestamp : (ev.timestamp_s !== undefined ? ev.timestamp_s : frameNum / 30);
                                const percent = (tickTime / (videoDuration || 1)) * 100;
                                if (percent <= 100) {
                                  return (
                                    <button
                                      key={idx}
                                      onClick={() => {
                                        if (videoRef.current) {
                                          videoRef.current.currentTime = tickTime;
                                          setVideoTime(tickTime);
                                        }
                                      }}
                                      title={`Flagged Anomaly: ${f.finding}`}
                                      className="absolute top-1.5 w-2 h-2.5 bg-rose-500 border border-white rounded-full z-20 hover:scale-125 hover:bg-red-600 transition-all cursor-pointer"
                                      style={{ left: `calc(${percent}% - 4px)` }}
                                    />
                                  );
                                }
                              } catch {}
                              return null;
                            })}
                        </div>
                      </div>

                      {/* Rep frames track */}
                      <div className="space-y-2">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Sampled Frame Timeline</span>
                        <div className="flex gap-3 overflow-x-auto py-1 scrollbar-none">
                          {data.findings
                            .filter(f => f.category === "temporal" && f.evidence)
                            .map((f, idx) => {
                              try {
                                const ev = JSON.parse(f.evidence!);
                                const path = ev.frame_path || ev.storage_path || "";
                                const frameNum = ev.frame_number !== undefined ? ev.frame_number : (ev.frame_index !== undefined ? ev.frame_index : parseInt(path.split("frame_")[1]?.split(".jpg")[0]) || 0);
                                const tickTime = ev.timestamp !== undefined ? ev.timestamp : (ev.timestamp_s !== undefined ? ev.timestamp_s : frameNum / 30);
                                return (
                                  <div 
                                    key={idx} 
                                    onClick={() => {
                                      if (videoRef.current) {
                                        videoRef.current.currentTime = tickTime;
                                        setVideoTime(tickTime);
                                      }
                                      setSelectedFrame({ ...ev, finding: f.finding });
                                    }}
                                    className="flex-shrink-0 w-24 border border-slate-200 rounded overflow-hidden bg-slate-50 cursor-pointer hover:border-[#1b365d] transition-all"
                                  >
                                    <img 
                                      src={getMediaUrl(path)} 
                                      alt={`Frame ${frameNum}`} 
                                      className="h-12 w-full object-cover"
                                    />
                                    <div className="p-1 text-center text-[9px] font-mono text-slate-500">
                                      Frame {frameNum}
                                    </div>
                                  </div>
                                );
                              } catch {
                                return null;
                              }
                            })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Image Viewer with ELA / Zoom */
                    <div className="space-y-4">
                      <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-200">
                        <div className="flex gap-1">
                          <button
                            onClick={() => setForensicView("original")}
                            className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                              forensicView === "original" 
                                ? "bg-[#1b365d] text-white shadow-sm" 
                                : "text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            Original Image
                          </button>
                          <button
                            onClick={() => setForensicView("ela")}
                            className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                              forensicView === "ela" 
                                ? "bg-[#1b365d] text-white shadow-sm" 
                                : "text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            ELA Forensic Map
                          </button>
                        </div>

                        {/* Zoom controls */}
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <button 
                            onClick={() => setImageZoom(Math.max(imageZoom - 0.25, 0.5))}
                            className="p-1 hover:bg-slate-200 rounded hover:text-slate-800 transition-colors"
                          >
                            <ZoomOut className="w-4 h-4" />
                          </button>
                          <span className="text-xs font-mono font-bold w-12 text-center">{Math.round(imageZoom * 100)}%</span>
                          <button 
                            onClick={() => setImageZoom(Math.min(imageZoom + 0.25, 3))}
                            className="p-1 hover:bg-slate-200 rounded hover:text-slate-800 transition-colors"
                          >
                            <ZoomIn className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Display container */}
                      <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 flex items-center justify-center min-h-[300px] overflow-hidden relative">
                        {mediaUrlStatus === "LOADING" ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-8 h-8 text-[#1b365d] animate-spin" />
                            <span className="text-xs text-slate-500 font-bold">Creating secure signed session...</span>
                          </div>
                        ) : mediaUrlStatus === "ERROR" ? (
                          <div className="flex flex-col items-center gap-3 p-6 text-center">
                            <ShieldAlert className="w-8 h-8 text-red-500" />
                            <p className="text-xs font-bold text-slate-700">Signed URL access token generation failed.</p>
                            <button
                              onClick={() => fetchMediaUrl(true)}
                              className="px-3 py-1.5 bg-[#1b365d] text-white rounded text-xs font-bold hover:bg-[#152a4a] transition-all"
                            >
                              Refresh Session
                            </button>
                          </div>
                        ) : (
                          forensicView === "original" ? (
                            <img 
                              src={mediaUrl} 
                              alt="Evidence Original" 
                              className="max-h-[350px] object-contain rounded transition-transform duration-200"
                              style={{ transform: `scale(${imageZoom})`, transformOrigin: "center center" }}
                            />
                          ) : (
                            (() => {
                              const compFinding = data.findings.find(f => f.category === "compression");
                              if (compFinding?.evidence) {
                                try {
                                  const ev = JSON.parse(compFinding.evidence);
                                  return (
                                    <img 
                                      src={getMediaUrl(ev.ela_image_path)} 
                                      alt="Evidence ELA Map" 
                                      className="max-h-[350px] object-contain rounded transition-transform duration-200"
                                      style={{ transform: `scale(${imageZoom})`, transformOrigin: "center center" }}
                                    />
                                  );
                                } catch {}
                              }
                              return <p className="text-xs text-slate-400">ELA forensic map not parsed or available for this media format.</p>;
                            })()
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No media uploaded.</p>
              )}
            </div>

            {/* Right Column: Parameters & Metadata Index */}
            <div className="space-y-6">
              {/* Technical parameters card */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
                <h3 className="font-bold text-sm text-slate-800">Media Hash & Stream Properties</h3>
                {data.media ? (
                  <div className="space-y-4 text-xs">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">SHA-256 Hash</span>
                      <p className="font-mono text-[#1b365d] break-all select-all font-bold tracking-tight">
                        {data.media.sha256}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <span className="text-[9px] text-slate-400 font-bold uppercase block">File Size</span>
                        <span className="text-slate-800 font-mono font-bold">
                          {(data.media.size_bytes / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <span className="text-[9px] text-slate-400 font-bold uppercase block">Format</span>
                        <span className="text-slate-800 font-mono font-bold truncate block">
                          {data.media.mime_type}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No parameters indexed.</p>
                )}
              </div>

              {/* metadata container index */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
                <h3 className="font-bold text-sm text-slate-800">EXIF Metadata Headers</h3>
                {(() => {
                  const metaFinding = data.findings.find(f => f.category === "metadata");
                  if (!metaFinding) {
                    return <p className="text-xs text-slate-400 py-2">No EXIF metadata indexed in containers.</p>;
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
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-slate-400 font-sans">Camera Make</span>
                        <span className="text-slate-700">{make}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-slate-400 font-sans">Camera Model</span>
                        <span className="text-slate-700">{model}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 py-1.5">
                        <span className="text-slate-400 font-sans">Software Editor</span>
                        <span className={`font-bold ${software !== "N/A" ? "text-rose-600 font-sans" : "text-slate-700"}`}>
                          {software}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-400 font-sans">Creation Date</span>
                        <span className="text-slate-700">{creationDate}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Lightbox frame modal */}
            {selectedFrame && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h4 className="font-bold text-slate-800 text-sm">Sampled Video Frame Inspection</h4>
                    <button 
                      onClick={() => setSelectedFrame(null)}
                      className="text-[#1b365d] hover:text-[#152a4a] text-xs font-bold font-mono cursor-pointer"
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
            <div className="border-b border-slate-200 pb-4">
              <h3 className="font-bold text-base text-slate-800">Forensic Findings Ledger</h3>
              <p className="text-slate-500 text-xs">Evidence categorized by observation levels and validation methods.</p>
            </div>
            
            {data.findings.length === 0 ? (
              <EmptyState 
                icon={ShieldAlert}
                title="No findings registered"
                description="This case media has not registered any forensic findings yet."
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* OBSERVED */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-150 px-2 py-0.5 rounded uppercase tracking-wider">
                      Observed
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {data.findings.filter(f => f.evidence_level === "OBSERVED").length} Items
                    </span>
                  </div>
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {data.findings.filter(f => f.evidence_level === "OBSERVED").map((f) => (
                      <div key={f.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2 hover:border-slate-300 transition-all">
                        <p className="font-semibold text-slate-800 leading-normal">{f.finding}</p>
                        <div className="flex flex-col gap-1 text-[10px] text-slate-400 font-mono pt-1.5 border-t border-slate-200/50">
                          <div><span className="font-sans font-bold">Method:</span> {f.method || "Inspection"}</div>
                          <div><span className="font-sans font-bold">Confidence:</span> {f.confidence}</div>
                        </div>
                      </div>
                    ))}
                    {data.findings.filter(f => f.evidence_level === "OBSERVED").length === 0 && (
                      <p className="text-xs text-slate-400 py-6 text-center">No observed evidence.</p>
                    )}
                  </div>
                </div>

                {/* INFERRED */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-150 px-2 py-0.5 rounded uppercase tracking-wider">
                      Inferred
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {data.findings.filter(f => f.evidence_level === "INFERRED").length} Items
                    </span>
                  </div>
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {data.findings.filter(f => f.evidence_level === "INFERRED").map((f) => (
                      <div key={f.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2 hover:border-slate-300 transition-all">
                        <p className="font-semibold text-slate-800 leading-normal">{f.finding}</p>
                        <div className="flex flex-col gap-1 text-[10px] text-slate-400 font-mono pt-1.5 border-t border-slate-200/50">
                          <div><span className="font-sans font-bold">Method:</span> {f.method || "Analysis"}</div>
                          <div><span className="font-sans font-bold">Confidence:</span> {f.confidence}</div>
                        </div>
                      </div>
                    ))}
                    {data.findings.filter(f => f.evidence_level === "INFERRED").length === 0 && (
                      <p className="text-xs text-slate-400 py-6 text-center">No inferred evidence.</p>
                    )}
                  </div>
                </div>

                {/* CONCLUSION */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-150 px-2 py-0.5 rounded uppercase tracking-wider">
                      Conclusion
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {data.findings.filter(f => f.evidence_level === "CONCLUSION" || f.evidence_level === "SYSTEM" || f.evidence_level === "REASONING").length} Items
                    </span>
                  </div>
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {data.findings.filter(f => f.evidence_level === "CONCLUSION" || f.evidence_level === "SYSTEM" || f.evidence_level === "REASONING").map((f) => (
                      <div key={f.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2 hover:border-slate-300 transition-all">
                        <p className="font-semibold text-slate-800 leading-normal">{f.finding}</p>
                        <div className="flex flex-col gap-1 text-[10px] text-slate-400 font-mono pt-1.5 border-t border-slate-200/50">
                          <div><span className="font-sans font-bold">Method:</span> {f.method || "Reasoning"}</div>
                          <div><span className="font-sans font-bold">Confidence:</span> {f.confidence}</div>
                        </div>
                      </div>
                    ))}
                    {data.findings.filter(f => f.evidence_level === "CONCLUSION" || f.evidence_level === "SYSTEM" || f.evidence_level === "REASONING").length === 0 && (
                      <p className="text-xs text-slate-400 py-6 text-center">No conclusion evidence.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}        {/* SCREEN 7: C2PA & Metadata tab */}
        {activeTab === "c2pa" && (
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
                          <td className={`py-2.5 font-bold ${software !== "N/A" ? "text-rose-600" : ""}`}>
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
                      <p className="text-slate-600 mt-1 leading-normal text-[11px]">
                        {data.c2pa.verification_result}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-505 leading-relaxed bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <span className="font-bold block text-slate-600 mb-1 text-[11px]">C2PA Status Definitions:</span>
                  <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-500">
                    <li><b>VERIFIED:</b> Cryptographic signatures are present and validated against root stores.</li>
                    <li><b>PRESENT_UNVERIFIED:</b> Manifest signatures are present but lack trusted chains.</li>
                    <li><b>INVALID:</b> Manifest signature check failed or contains tampered container blocks.</li>
                    <li><b>NOT_PRESENT:</b> No content credentials manifest was detected.</li>
                    <li><b>UNAVAILABLE:</b> Manifest check could not be completed because file containers are unreadable or unsupported.</li>
                  </ul>
                </div>

                <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] leading-relaxed rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    <b>Forensic Warning:</b> Absence of C2PA/manifest containers is <b>NOT</b> confirmation of manipulation. Many authentic, original cameras and messaging layers strip container profiles.
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
        {activeTab === "timeline" && (
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
                  {timelineEvents.map((ev, idx) => {
                    const status = ev.type?.toUpperCase() || "UNKNOWN";
                    return (
                      <div 
                        key={idx} 
                        onClick={() => setSelectedTimelineEvent(ev)}
                        className="relative group cursor-pointer"
                      >
                        <span className={`absolute -left-[31px] top-1.5 w-2.5 h-2.5 rounded-full border border-white ring-4 transition-all ${
                          status === "OBSERVED" 
                            ? "bg-emerald-500 ring-emerald-100" 
                            : status === "ESTIMATED" 
                              ? "bg-amber-500 ring-amber-100" 
                              : "bg-slate-400 ring-slate-100"
                        }`} />
                        
                        <div className="bg-slate-50 border border-slate-200 hover:border-[#1b365d] transition-all rounded-lg p-4 space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] font-mono">
                            <span className="text-slate-500 font-bold">{new Date(ev.timestamp).toLocaleString()}</span>
                            <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                              status === "OBSERVED" 
                                ? "text-emerald-700 bg-emerald-50 border border-emerald-100" 
                                : status === "ESTIMATED"
                                  ? "text-amber-700 bg-amber-50 border border-amber-100"
                                  : "text-slate-600 bg-slate-55 border border-slate-100"
                            }`}>{status}</span>
                          </div>
                          <h4 className="font-bold text-slate-800 text-xs leading-normal">{ev.event}</h4>
                          <p className="text-[10px] text-slate-500 truncate">{ev.platform}</p>
                        </div>
                      </div>
                    );
                  })}
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
                      (selectedTimelineEvent.type || "UNKNOWN").toUpperCase() === "OBSERVED" 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                        : (selectedTimelineEvent.type || "UNKNOWN").toUpperCase() === "ESTIMATED"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-slate-50 text-slate-700 border-slate-200"
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
                      <a href={selectedTimelineEvent.url} target="_blank" rel="noopener noreferrer" className="text-[#1b365d] font-mono break-all hover:underline focus:ring-2 focus:ring-[#1b365d] focus:outline-none">
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
              <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                  <h3 className="font-bold text-base text-slate-800">Propagation Topology</h3>
                  <p className="text-slate-500 text-xs">Drag and zoom grid showing spread directions.</p>
                </div>
                {/* Visual Legend */}
                <div className="flex flex-wrap gap-3 text-[9px] bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-slate-600 font-bold uppercase">Root Source</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#1b365d]" />
                    <span className="text-slate-600 font-bold uppercase">Social Platform</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-slate-600 font-bold uppercase">Web Domain</span>
                  </div>
                </div>
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
                <h3 className="font-bold text-base text-slate-800">Scoring Weights</h3>
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
                
                 <div className="border-t border-slate-100 pt-4 flex flex-col gap-3 font-mono font-bold text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Sum Coefficient:</span>
                    <span className={wManip + wMeta + wProp + wNarr === 100 ? "text-emerald-600" : "text-red-600"}>
                      {wManip + wMeta + wProp + wNarr}% / 100%
                    </span>
                  </div>
                  {wManip + wMeta + wProp + wNarr === 100 && !isDemo && (
                    <button
                      onClick={() => handleSaveWeights(wManip, wMeta, wProp, wNarr)}
                      disabled={savingWeights}
                      className="w-full bg-[#1b365d] hover:bg-[#152a4a] text-white py-2 rounded text-xs font-bold font-sans tracking-wide transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      {savingWeights ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving Parameters...</span>
                        </>
                      ) : (
                        <span>Save Scoring Parameters</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Score Output & Analytical Factors Matrix */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-sm">
              <div>
                <h3 className="font-bold text-base text-slate-800">TRACE-PLIM Scoring Matrix</h3>
                <p className="text-slate-500 text-xs">Evidence-backed analytical framework metric outputs.</p>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Overall Analytical Score</span>
                    <h4 className="text-3xl font-extrabold text-slate-800 font-mono">
                      {scores.overall !== null ? `${scores.overall.toFixed(1)}%` : "—"}
                    </h4>
                  </div>
                  <span className={`px-3 py-1 rounded text-xs font-bold uppercase border ${getRiskBadgeColor(scores.overall)}`}>
                    {scores.overall !== null 
                      ? (scores.overall > 70 ? "Critical" : scores.overall > 40 ? "Medium" : "Low")
                      : "INSUFFICIENT"
                    }
                  </span>
                </div>

                {/* Analytical Matrix Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-150 pb-2">
                        <th className="pb-2">Factor Dimension</th>
                        <th className="pb-2">Classification</th>
                        <th className="pb-2 text-right">Metric Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      <tr>
                        <td className="py-2 font-semibold">Origin (Asset Container)</td>
                        <td className="py-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase">
                            {data.media ? "ANALYZED" : "NOT ANALYZED"}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono font-bold text-slate-800">{scores.manip.toFixed(1)}%</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold">Propagation (Spread Footprint)</td>
                        <td className="py-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase">
                            {data.graph.nodes.length > 0 ? "ANALYZED" : "NOT ANALYZED"}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono font-bold text-slate-800">{scores.prop.toFixed(1)}%</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold">Narrative Evolution (Timeline)</td>
                        <td className="py-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase">
                            {timelineEvents.length > 0 ? "ANALYZED" : "NOT ANALYZED"}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono font-bold text-slate-800">{scores.narr.toFixed(1)}%</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold">Amplification (Automation)</td>
                        <td className="py-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-50 text-slate-600 border border-slate-150 uppercase">
                            {data.graph.nodes.length > 0 ? "ANALYZED" : "INSUFFICIENT EVIDENCE"}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono font-bold text-slate-800">
                          {data.graph.nodes.length > 5 ? "High (75.0%)" : "Low (30.0%)"}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold">Potential Influence (Reach)</td>
                        <td className="py-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-50 text-slate-600 border border-slate-150 uppercase">
                            {data.sources.length > 0 ? "ANALYZED" : "INSUFFICIENT EVIDENCE"}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono font-bold text-slate-800">
                          {Math.min(data.sources.length * 10, 100).toFixed(1)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Disclaimer alert */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-500 leading-relaxed space-y-1">
                  <p><b>Analytical Limitations:</b> TRACE-PLIM is an evidence-backed analytical framework to systematically structure and record observation variables, and does not serve as objective proof of real-world political influence, psychological effect, or public belief.</p>
                  <p><b>Calibration Notice:</b> Every calibration weight represents a subjective analytical assignment for dynamic scoring, <b>not</b> objective probabilities of manipulation.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 12: Forensic Reports Tab */}
        {activeTab === "reports" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            {/* Left Column: Notes & Communication Intent */}
            <div className="lg:col-span-2 space-y-6">
              {/* Case Notes Editor */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 flex flex-col h-fit shadow-sm">
                <div>
                  <h3 className="font-bold text-base text-slate-800">Officer Investigation Notes</h3>
                  <p className="text-slate-500 text-xs">Append officer log metrics, witness remarks, or case files.</p>
                </div>
                <textarea 
                  rows={6}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Append officer observations..."
                  className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-885 focus:outline-none focus:border-[#1b365d] resize-none font-sans leading-relaxed"
                />
                <div className="flex justify-between items-center pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveNotes}
                      disabled={savingNotes || notes === lastNotesSaved}
                      className={`px-3 py-1.5 rounded text-xs font-bold transition-all border ${
                        notes === lastNotesSaved
                          ? "bg-slate-50 text-slate-400 border-slate-200 cursor-default"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                      }`}
                    >
                      {savingNotes ? "Saving..." : "Save Notes"}
                    </button>
                    {lastNotesSaved && <span className="text-[10px] text-slate-400 font-mono">Changes saved</span>}
                  </div>
                  
                  <button 
                    onClick={handleExportReport}
                    className="flex items-center gap-1.5 bg-[#1b365d] hover:bg-[#152a4a] text-white font-bold px-4 py-2.5 rounded-lg text-xs transition-all shadow-sm cursor-pointer focus:ring-2 focus:ring-[#1b365d] focus:outline-none"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Forensic Report (PDF)</span>
                  </button>
                </div>
              </div>

              {/* Communication Intent Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
                <div>
                  <h3 className="font-bold text-base text-slate-800">Communication Intent Classification</h3>
                  <p className="text-slate-500 text-xs">Calibrate the primary motive or intent of the analyzed case asset.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(() => {
                    const aiIntentFinding = data.findings.find(f => f.category === "content_analysis" && f.method && f.method.includes("Gemini"));
                    let aiIntentClass = "UNKNOWN";
                    if (aiIntentFinding?.evidence) {
                      try {
                        const ev = JSON.parse(aiIntentFinding.evidence);
                        aiIntentClass = ev.classification || "UNKNOWN";
                      } catch {}
                    }
                    return (
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-400 font-bold uppercase block">AI Intent Classification</label>
                        <span className="inline-flex items-center gap-1.5 bg-[#1b365d]/5 text-[#1b365d] border border-[#1b365d]/10 px-3 py-2 rounded-lg text-xs font-mono font-bold w-full uppercase">
                          ● {aiIntentClass} (AI Heuristic Output)
                        </span>
                      </div>
                    );
                  })()}

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase block">Selected Override Intent Category</label>
                    <select
                      value={communicationIntent}
                      onChange={(e) => handleSaveIntentOverride(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-850 font-semibold focus:outline-none focus:border-[#1b365d] font-sans"
                    >
                      <option value="INFORMATIONAL">INFORMATIONAL (Factual reporting or news delivery)</option>
                      <option value="POLITICAL">POLITICAL (Influence electoral opinion or advocacy)</option>
                      <option value="PERSUASIVE">PERSUASIVE (Change user belief or point of view)</option>
                      <option value="PROMOTIONAL">PROMOTIONAL (Commercial marketing or ad placement)</option>
                      <option value="PUBLIC_SERVICE">PUBLIC_SERVICE (Safety announcements or state notices)</option>
                      <option value="ENTERTAINMENT">ENTERTAINMENT (Humor, meme sharing, or artistic recreation)</option>
                      <option value="UNCLEAR">UNCLEAR (Indefinite or mixed rhetorical style)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Supporting evidence tags</label>
                  <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-normal">
                    {data.findings.find(f => f.category === "ai_analysis")?.finding || 
                      "Asset employs emotional triggers, synthetic manipulation indicators, and localized caption shifts targeted to amplify engagement timelines."}
                  </p>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] leading-relaxed rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p>
                    <b>Intent Classification Guideline:</b> Categorization represents a subjective analyst calibration and AI heuristic assessment rather than absolute, objective fact.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Chain of Custody Timeline */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm flex flex-col h-fit">
              <div>
                <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  <History className="w-4 h-4 text-[#1b365d]" />
                  <span>Case Chain of Custody</span>
                </h3>
                <p className="text-slate-500 text-xs">Chronological forensic trace of events and pipeline checks.</p>
              </div>

              {data.audit.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No chain records logged.</p>
              ) : (
                <div className="relative border-l border-slate-200 pl-4 space-y-5 ml-2 mt-4 max-h-[480px] overflow-y-auto pr-1">
                  {data.audit.map((aud, index) => (
                    <div key={aud.id || index} className="relative text-xs">
                      <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#1b365d] border border-white ring-2 ring-slate-100" />
                      <div className="space-y-1">
                        <div className="flex justify-between items-baseline font-mono text-[9px] text-slate-400">
                          <span className="font-bold text-[#1b365d] uppercase">{aud.event_type}</span>
                          <span>{new Date(aud.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-slate-700 leading-normal font-medium">{aud.description}</p>
                      </div>
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
