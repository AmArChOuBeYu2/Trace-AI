"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderPlus, ArrowLeft, ShieldAlert } from "lucide-react";
import { API_BASE_URL } from "@/config";

export default function NewInvestigation() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Case Title is required.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      // 1. Create the Investigation case
      const res = await fetch(`${API_BASE_URL}/api/investigations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          case_number: caseNumber.trim() || undefined,
          status: "active",
          risk_level: "insufficient"
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to create investigation.");
      }

      const newInv = await res.json();
      const invId = newInv.id;

      // 2. Save investigator notes if provided
      if (notes.trim()) {
        await fetch(`${API_BASE_URL}/api/investigations/${invId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes: notes.trim(),
          }),
        }).catch((err) => {
          console.error("Failed to save initial investigator notes:", err);
        });
      }

      // 3. Redirect to the newly created investigation workspace
      router.push(`/investigations/${invId}`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-6 flex-1 bg-slate-50 min-h-screen">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-slate-500 text-xs">
        <Link href="/dashboard" className="hover:text-[#1b365d] transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-semibold">New Case</span>
      </div>

      <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
          <div className="p-3 bg-blue-50 border border-blue-100 text-[#1b365d] rounded-lg">
            <FolderPlus className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">Start a New Investigation</h2>
            <p className="text-slate-500 text-xs mt-1">
              Initialize a clean case registry before uploading forensics media.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2 animate-shake">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="font-medium">{errorMsg}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Case Title <span className="text-rose-500 font-bold">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chandigarh Election Video Manipulation Trace"
              className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-800 font-medium placeholder-slate-400 focus:outline-none focus:border-[#1b365d] transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Case Reference Number <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                placeholder="e.g. FIR-2026-CH-008"
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-800 font-medium placeholder-slate-400 focus:outline-none focus:border-[#1b365d] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Case Status
              </label>
              <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-500 font-bold select-none cursor-default font-mono">
                ● ACTIVE OPERATIONS
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Description <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of case details, suspects, and digital chain of custody origin..."
              className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1b365d] transition-colors resize-none leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Initial Investigator Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Log initial officer notes, source provenance metadata, or witness notes..."
              className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1b365d] transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Link
              href="/dashboard"
              className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-lg text-xs transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </Link>

            <button
              type="submit"
              disabled={loading}
              className="bg-[#1b365d] hover:bg-[#152a4a] text-white font-bold px-6 py-2.5 rounded-lg text-xs transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Creating..." : "Create Investigation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
