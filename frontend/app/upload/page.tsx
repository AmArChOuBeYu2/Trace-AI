"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Upload, 
  File, 
  ShieldAlert, 
  Loader2, 
  CheckCircle,
  AlertCircle
} from "lucide-react";

export default function UploadPage() {
  const router = useRouter();
  
  // Case info state
  const [title, setTitle] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [description, setDescription] = useState("");
  
  // File state
  const [file, setFile] = useState<File | null>(null);
  const [sha256, setSha256] = useState("");
  
  // Pipeline loading states
  const [status, setStatus] = useState<"idle" | "uploading" | "hashing" | "completed" | "error">("idle");
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setFile(selected);
      calculateSHA256(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
      setErrorMsg("Case Title is required.");
      return;
    }
    if (!file) {
      setErrorMsg("Please upload a forensic media file.");
      return;
    }

    setStatus("uploading");
    setPipelineMessage("Ingesting case information and creating repository entry...");
    setErrorMsg("");

    try {
      // 1. Create Investigation Case
      const caseRes = await fetch("http://localhost:8000/api/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          case_number: caseNumber || null,
          description,
          status: "active",
          risk_level: "low"
        })
      });
      if (!caseRes.ok) throw new Error("Failed to register case");
      const caseData = await caseRes.json();
      const invId = caseData.id;

      // 2. Upload media file and start analysis pipeline in one request
      setPipelineMessage("Uploading original file to Supabase storage and enqueuing forensic pipeline...");
      const formData = new FormData();
      formData.append("file", file);
      
      const uploadRes = await fetch(`http://localhost:8000/api/investigations/${invId}/media`, {
        method: "POST",
        body: formData
      });
      if (!uploadRes.ok) throw new Error("File upload and analysis initiation failed.");
      
      setStatus("completed");
      setPipelineMessage("Analysis enqueued successfully! Redirecting...");
      router.push(`/investigations/${invId}`);

    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMsg(err.message || "An unexpected error occurred in the analysis pipeline.");
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8 flex-1 bg-slate-50">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-[#1b365d]" />
          <span>New Investigation Case</span>
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Upload suspicious media evidence to calculate hashes, parse EXIF metadata, and initiate origin tracing.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        
        {/* Title */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Case Title *</label>
          <input 
            type="text" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)}
            disabled={status !== "idle" && status !== "error"}
            placeholder="e.g. Tampered Social Media Protest Video"
            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-[#1b365d] focus:ring-1 focus:ring-[#1b365d]"
          />
        </div>

        {/* Flex Case Reference Number */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reference Case Number (Optional)</label>
          <input 
            type="text" 
            value={caseNumber} 
            onChange={(e) => setCaseNumber(e.target.value)}
            disabled={status !== "idle" && status !== "error"}
            placeholder="e.g. CHD-2026-0428"
            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-[#1b365d] focus:ring-1 focus:ring-[#1b365d] font-mono"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Case Scope & Context</label>
          <textarea 
            rows={3}
            value={description} 
            onChange={(e) => setDescription(e.target.value)}
            disabled={status !== "idle" && status !== "error"}
            placeholder="Document preliminary source links, officer notes, or suspicious narratives..."
            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-[#1b365d] focus:ring-1 focus:ring-[#1b365d] resize-none"
          />
        </div>

        {/* Drag and Drop Zone */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Forensic Media File</label>
          <div 
            onClick={() => status === "idle" && fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-[#1b365d]/50 bg-slate-50/50 hover:bg-slate-50 rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer transition-all"
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              disabled={status !== "idle" && status !== "error"}
              accept="image/*,video/*"
              className="hidden" 
            />
            {file ? (
              <div className="flex flex-col items-center gap-3">
                <File className="w-8 h-8 text-[#1b365d]" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-800 truncate max-w-sm">{file.name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-8 h-8 text-slate-400" />
                <p className="text-sm font-bold text-slate-600">Drop image or video here</p>
                <p className="text-xs text-slate-500 hover:underline">Choose file</p>
                <p className="text-xs text-slate-400 mt-2">Supports JPEG, PNG, WEBP, MP4, MOV (Max 100MB)</p>
              </div>
            )}
          </div>
        </div>

        {/* Local Hash Display */}
        {sha256 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Client-Side Cryptographic Hash</p>
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

        <button 
          type="submit"
          disabled={status !== "idle" || !file || !title}
          className="w-full flex items-center justify-center bg-[#1b365d] hover:bg-[#152a4a] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3 rounded-lg text-sm transition-all shadow-sm cursor-pointer"
        >
          <span>Start Analysis</span>
        </button>

      </form>
    </div>
  );
}
