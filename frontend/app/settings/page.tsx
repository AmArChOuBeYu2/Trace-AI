"use client";

import { useEffect, useState } from "react";
import { 
  Settings, 
  Sliders, 
  CheckCircle,
  HelpCircle,
  AlertTriangle,
  RotateCcw,
  Activity,
  Loader2
} from "lucide-react";
import { API_BASE_URL } from "@/config";

interface Diagnostics {
  gemini: string;
  supabase: string;
  langsearch: string;
  tavily: string;
  ffmpeg: string;
  ffprobe: string;
}

export default function SettingsPage() {
  // Service diagnostics states
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(true);

  // Weights coefficients
  const [wManip, setWManip] = useState(35);
  const [wMeta, setWMeta] = useState(20);
  const [wProp, setWProp] = useState(20);
  const [wNarr, setWNarr] = useState(25);
  
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const totalSum = wManip + wMeta + wProp + wNarr;
  const isValid = totalSum === 100;

  // 1. Fetch backend configurations & diagnostics on mount
  useEffect(() => {
    // Fetch diagnostics status
    fetch(`${API_BASE_URL}/api/settings/diagnostics`)
      .then(res => res.json())
      .then(data => {
        setDiagnostics(data);
        setLoadingDiag(false);
      })
      .catch(err => {
        console.error(err);
        setDiagnostics({
          gemini: "disconnected",
          supabase: "disconnected",
          langsearch: "disconnected",
          tavily: "disconnected",
          ffmpeg: "disconnected",
          ffprobe: "disconnected"
        });
        setLoadingDiag(false);
      });

    // Fetch persisted weights
    fetch(`${API_BASE_URL}/api/settings/weights`)
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        setWManip(data.media_manipulation);
        setWMeta(data.metadata_inconsistency);
        setWProp(data.propagation_anomaly);
        setWNarr(data.narrative_evolution);
      })
      .catch(() => {
        // Fallback default weights if fail
        setWManip(35);
        setWMeta(20);
        setWProp(20);
        setWNarr(25);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setSaving(true);
    setErrorMsg("");
    setSaved(false);

    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/weights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_manipulation: wManip,
          metadata_inconsistency: wMeta,
          propagation_anomaly: wProp,
          narrative_evolution: wNarr
        })
      });

      if (!res.ok) {
        throw new Error("Failed to save weights on backend.");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setErrorMsg("Failed to persist configurations. Please check backend connection.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setWManip(35);
    setWMeta(20);
    setWProp(20);
    setWNarr(25);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8 flex-1 bg-slate-50">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-[#1b365d]" />
          <span>System Parameters & Configurations</span>
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Monitor read-only API connectors and calibrate dynamic risk scoring weights.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Sliders Calibration */}
        <form onSubmit={handleSave} className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-sm">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
              <Sliders className="w-4.5 h-4.5 text-[#1b365d]" />
              <span>Forensic Risk Calibration</span>
            </h3>
            
            <button 
              type="button" 
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors font-semibold"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Default</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-4 border border-slate-200 rounded-lg">
            <HelpCircle className="w-4 h-4 text-[#1b365d] inline mr-1 shrink-0" />
            <b>Note on Coefficients:</b> These controls represent analytical calibration weights, <b>not</b> objective probabilities of manipulation or public influence.
          </p>
          <div className="space-y-6 pt-2">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-slate-600">Media Manipulation Score Coefficient</span>
                <span className="font-mono text-[#1b365d] font-bold">{wManip}%</span>
              </div>
              <input 
                type="range" min="0" max="100" value={wManip} 
                onChange={(e) => setWManip(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1b365d]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-slate-600">Metadata Inconsistency Score Coefficient</span>
                <span className="font-mono text-[#1b365d] font-bold">{wMeta}%</span>
              </div>
              <input 
                type="range" min="0" max="100" value={wMeta} 
                onChange={(e) => setWMeta(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1b365d]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-slate-600">Propagation Anomaly Score Coefficient</span>
                <span className="font-mono text-[#1b365d] font-bold">{wProp}%</span>
              </div>
              <input 
                type="range" min="0" max="100" value={wProp} 
                onChange={(e) => setWProp(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1b365d]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-slate-600">Narrative Evolution Coefficient</span>
                <span className="font-mono text-[#1b365d] font-bold">{wNarr}%</span>
              </div>
              <input 
                type="range" min="0" max="100" value={wNarr} 
                onChange={(e) => setWNarr(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1b365d]"
              />
            </div>
            
            <div className="border-t border-slate-100 pt-4 flex flex-col gap-3 font-mono">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span>Total Allocation:</span>
                <span className={isValid ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                  {totalSum}% / 100%
                </span>
              </div>

              {/* Allocation status indicators (Correction 2 & 8) */}
              {isValid ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-sans font-bold">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>✓ Valid configuration</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-red-600 font-sans font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>⚠ Weights must total exactly 100%.</span>
                </div>
              )}
            </div>
          </div>

          {/* Action trigger */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <div>
              {saved && (
                <span className="text-xs text-emerald-600 font-bold flex items-center gap-1.5 animate-fade-in">
                  <CheckCircle className="w-4 h-4" />
                  <span>Configurations saved successfully!</span>
                </span>
              )}
              {errorMsg && (
                <span className="text-xs text-red-600 font-bold flex items-center gap-1.5 animate-fade-in">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{errorMsg}</span>
                </span>
              )}
            </div>
            <button 
              type="submit"
              disabled={!isValid || saving}
              className="bg-[#1b365d] hover:bg-[#152a4a] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-all shadow-sm focus:ring-2 focus:ring-[#1b365d] focus:outline-none cursor-pointer"
            >
              {saving ? "Saving..." : "Save Configurations"}
            </button>
          </div>
        </form>

        {/* Integration Statuses (Correction 1) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm h-fit">
          <h3 className="font-bold text-base text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Activity className="w-4.5 h-4.5 text-[#1b365d]" />
            <span>Service Integrations</span>
          </h3>

          {loadingDiag ? (
            <div className="py-6 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-[#1b365d]" />
              <span className="mt-2 animate-pulse">Syncing statuses...</span>
            </div>
          ) : (
            <div className="space-y-4 text-xs font-mono select-none">
              {[
                { name: "Gemini AI", key: "gemini" },
                { name: "Supabase", key: "supabase" },
                { name: "LangSearch", key: "langsearch" },
                { name: "Tavily", key: "tavily" },
                { name: "FFmpeg", key: "ffmpeg" },
                { name: "ffprobe", key: "ffprobe" }
              ].map(service => {
                const statusVal = diagnostics ? (diagnostics as any)[service.key] : "disconnected";
                const isOk = statusVal === "connected";
                return (
                  <div key={service.key} className="flex justify-between items-center p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="font-sans font-semibold text-slate-700">{service.name}</span>
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className={`w-2 h-2 rounded-full ${isOk ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                      <span className={isOk ? "text-emerald-600" : "text-red-600"}>
                        {isOk ? "Connected" : "Disconnected"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
