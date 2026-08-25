"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Upload, 
  File as FileIcon, 
  ShieldAlert, 
  Loader2, 
  CheckCircle,
  AlertCircle,
  FolderOpen,
  ArrowLeft
} from "lucide-react";
import Link from "next/link";
import { API_BASE_URL } from "@/config";

function UploadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const investigationId = searchParams.get("investigationId");
  
  // Case info state
  const [title, setTitle] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [description, setDescription] = useState("");
  const [existingInvestigation, setExistingInvestigation] = useState<any>(null);
  
  // File state
  const [file, setFile] = useState<File | null>(null);
  const [sha256, setSha256] = useState("");
  
  // Pipeline loading states
  const [status, setStatus] = useState<"idle" | "uploading" | "hashing" | "completed" | "error">("idle");
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing investigation if ID is passed in query parameters
  useEffect(() => {
    if (investigationId) {
      fetch(`${API_BASE_URL}/api/investigations/${investigationId}`)
        .then(res => {
          if (!res.ok) throw new Error("Failed to load investigation details");
          return res.json();
        })
        .then(data => {
          setExistingInvestigation(data);
          setTitle(data.title);
          setCaseNumber(data.case_number || "");
          setDescription(data.description || "");
        })
        .catch(err => {
          console.error("Error loading investigation for upload:", err);
          setErrorMsg("Could not load the specified investigation case repository.");
        });
    }
  }, [investigationId]);

  // Instant browser-side SHA-256 generator
  const calculateSHA256 = async (selectedFile: File) => {
    setStatus("hashing");
    setPipelineMessage("Computing cryptographic SHA-256 file signature locally...");
    try {
      const buffer = await selectedFile.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setSha256(hashHex);
      setStatus("idle");
    } catch (err) {
      console.error("Hash calculation failed", err);
      setSha256("Error calculating hash");
      setStatus("idle");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      
      // Basic file validation
      const allowedTypes = [
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska",
        "audio/mpeg", "audio/wav", "audio/mp3", "audio/ogg", "audio/m4a"
      ];
      if (!allowedTypes.includes(selected.type) && !selected.name.match(/\.(jpg|jpeg|png|webp|gif|mp4|mov|avi|mkv|mp3|wav|ogg|m4a)$/i)) {
        setErrorMsg("Unsupported file format. Please upload standard forensic image, audio, or video files.");
        return;
      }
      if (selected.size > 100 * 1024 * 1024) {
        setErrorMsg("File size exceeds 100MB limit.");
        return;
      }

      setErrorMsg("");
      setFile(selected);
      calculateSHA256(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Case Title is required.");
      return;
    }
    if (!file) {
      setErrorMsg("Please upload a forensic media file.");
      return;
    }

    setStatus("uploading");
    setPipelineMessage("Initializing case details and storage buckets...");
    setErrorMsg("");

    try {
      let invId: string;

      // 1. If not attaching to an existing investigation, create a new one first
      if (investigationId) {
        invId = investigationId;
      } else {
        setPipelineMessage("Creating new investigation case file entry...");
        const caseRes = await fetch(`${API_BASE_URL}/api/investigations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            case_number: caseNumber.trim() || null,
            description: description.trim() || "",
            status: "active",
            risk_level: "insufficient"
          })
        });
        if (!caseRes.ok) throw new Error("Failed to register case");
        const caseData = await caseRes.json();
        invId = caseData.id;
      }

      // 2. Obtain signed upload details or fallback config
      setPipelineMessage("Requesting secure storage upload authorization...");
      const authRes = await fetch(`${API_BASE_URL}/api/investigations/${invId}/signed-upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mime_type: file.type
        })
      });
      if (!authRes.ok) throw new Error("Failed to authorize secure file upload.");
      const authData = await authRes.json();
      
      if (authData.provider === "supabase") {
        setPipelineMessage("Uploading original media asset directly to private Supabase Storage...");
        
        // Upload directly via PUT to signed URL
        const uploadResponse = await fetch(authData.url, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${authData.token}`,
            "Content-Type": file.type
          },
          body: file
        });
        
        if (!uploadResponse.ok) {
          const errText = await uploadResponse.text().catch(() => "");
          throw new Error(`Direct storage upload failed: ${errText || uploadResponse.statusText}`);
        }
        
        setPipelineMessage("Registering upload metadata and enqueuing forensic pipeline checks...");
        const registerRes = await fetch(`${API_BASE_URL}/api/investigations/${invId}/media-register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storage_path: authData.storage_path,
            filename: file.name,
            mime_type: file.type,
            size_bytes: file.size
          })
        });
        
        if (!registerRes.ok) {
          const errData = await registerRes.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to register uploaded media in analysis pipeline.");
        }
      } else {
        // Local fallback (CORS / local files)
        setPipelineMessage("Uploading original file to local storage and enqueuing forensic pipeline...");
        const formData = new FormData();
        formData.append("file", file);
        
        const uploadRes = await fetch(`${API_BASE_URL}/api/investigations/${invId}/media`, {
          method: "POST",
          body: formData
        });
        if (!uploadRes.ok) throw new Error("File upload and analysis initiation failed.");
      }
      
      setStatus("completed");
      setPipelineMessage("Analysis enqueued successfully! Redirecting...");
      
      // Save last active case
      if (typeof window !== "undefined") {
        localStorage.setItem("last_active_case", invId);
      }
      
      router.push(`/investigations/${invId}`);

    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMsg(err.message || "An unexpected error occurred in the analysis pipeline.");
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6 flex-1 bg-slate-50 min-h-screen">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-slate-500 text-xs">
        <Link href="/dashboard" className="hover:text-[#1b365d] transition-colors">
          Dashboard
        </Link>
        {investigationId && (
          <>
            <span>/</span>
            <Link href={`/investigations/${investigationId}`} className="hover:text-[#1b365d] transition-colors">
              Investigation Workspace
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-slate-800 font-semibold">Upload Evidence</span>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-[#1b365d]" />
          <span>{investigationId ? "Upload Evidence to Case" : "Upload Forensic Evidence"}</span>
        </h2>
        <p className="text-slate-500 text-xs mt-1">
          {investigationId 
            ? `Attach a new media file directly to this active investigation.` 
            : `Initialize a case or upload evidence to launch the automated verification checks.`}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        
        {/* If attaching to existing case, show target block */}
        {investigationId && existingInvestigation ? (
          <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 space-y-1 text-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Target Investigation</span>
            <h3 className="text-sm font-bold text-slate-800">{existingInvestigation.title}</h3>
            <p className="text-[10px] text-slate-500 font-mono">
              Case Ref: {existingInvestigation.case_number || `CASE-${existingInvestigation.id.substring(0,8).toUpperCase()}`}
            </p>
          </div>
        ) : (
          <>
            {/* Title */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Case Title *</label>
              <input 
                type="text" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                disabled={status !== "idle" && status !== "error"}
                placeholder="e.g. Alleged sector office manipulation clip"
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#1b365d] focus:ring-1 focus:ring-[#1b365d]"
              />
            </div>

            {/* Flex Case Reference Number */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reference Case Number (Optional)</label>
              <input 
                type="text" 
                value={caseNumber} 
                onChange={(e) => setCaseNumber(e.target.value)}
                disabled={status !== "idle" && status !== "error"}
                placeholder="e.g. CHD-2026-0812"
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#1b365d] focus:ring-1 focus:ring-[#1b365d] font-mono"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Case Scope & Context</label>
              <textarea 
                rows={3}
                value={description} 
                onChange={(e) => setDescription(e.target.value)}
                disabled={status !== "idle" && status !== "error"}
                placeholder="Preliminary allegations, social media source contexts, or target handles..."
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#1b365d] focus:ring-1 focus:ring-[#1b365d] resize-none"
              />
            </div>
          </>
        )}

        {/* Drag and Drop Zone */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Forensic Media File</label>
          <div 
            onClick={() => status === "idle" && fileInputRef.current?.click()}
            className="border border-dashed border-slate-300 hover:border-[#1b365d]/50 bg-slate-50/50 hover:bg-slate-50 rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer transition-all"
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              disabled={status !== "idle" && status !== "error"}
              accept="image/*,video/*,audio/*"
              className="hidden" 
            />
            {file ? (
              <div className="flex flex-col items-center gap-3">
                <FileIcon className="w-8 h-8 text-[#1b365d]" />
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-800 truncate max-w-sm">{file.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB • {file.type}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-8 h-8 text-slate-400 animate-bounce" style={{ animationDuration: '3s' }} />
                <p className="text-xs font-bold text-slate-600">Drop image, video or audio here</p>
                <p className="text-[10px] text-slate-500 hover:underline">Choose file</p>
                <p className="text-[10px] text-slate-400 mt-2">Supports JPEG, PNG, WEBP, MP4, MOV, MP3, WAV (Max 100MB)</p>
              </div>
            )}
          </div>
        </div>

        {/* Local Hash Display */}
        {sha256 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Client-Side Cryptographic SHA-256 Hash</p>
            <p className="text-xs text-[#1b365d] font-mono break-all leading-normal">{sha256}</p>
          </div>
        )}

        {/* Status Pipeline Display */}
        {status !== "idle" && (
          <div className={`p-4 rounded-lg flex items-center gap-3 border ${
            status === "error" 
              ? "bg-red-50 text-red-700 border-red-200"
              : status === "completed"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-blue-50 text-[#1b365d] border-[#1b365d]/20"
          }`}>
            {status === "error" ? (
              <AlertCircle className="w-5 h-5 shrink-0" />
            ) : status === "completed" ? (
              <CheckCircle className="w-5 h-5 shrink-0" />
            ) : (
              <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
            )}
            <div className="text-xs font-medium">
              <p className="font-bold text-slate-800 uppercase tracking-wide">
                {status.toUpperCase()}
              </p>
              <p className="text-slate-500 mt-0.5">{pipelineMessage || errorMsg}</p>
            </div>
          </div>
        )}

        {/* Submit */}
        {errorMsg && status === "idle" && (
          <div className="text-xs text-red-600 font-semibold flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href={investigationId ? `/investigations/${investigationId}` : "/dashboard"}
            className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-lg text-xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </Link>
          
          <button 
            type="submit"
            disabled={status !== "idle" || !file || !title}
            className="flex-1 flex items-center justify-center bg-[#1b365d] hover:bg-[#152a4a] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3 rounded-lg text-xs transition-all shadow-sm cursor-pointer"
          >
            <span>Start Forensic Analysis</span>
          </button>
        </div>

      </form>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex flex-col items-center justify-center py-24 gap-4 bg-slate-50 min-h-screen">
        <Loader2 className="w-8 h-8 text-[#1b365d] animate-spin" />
        <span className="text-slate-400 text-sm font-semibold tracking-wide">Loading Upload Pipeline...</span>
      </div>
    }>
      <UploadPageContent />
    </Suspense>
  );
}
