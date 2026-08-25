"use client";

import React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

interface ErrorStateProps {
  error: string;
  retryAction?: () => void;
  retryLabel?: string;
}

export default function ErrorState({ error, retryAction, retryLabel = "Retry Operation" }: ErrorStateProps) {
  // Translate common backend errors to human-readable forensic messages
  const getReadableError = (err: string) => {
    const lower = err.toLowerCase();
    if (lower.includes("failed to fetch") || lower.includes("unable to connect")) {
      return "The backend forensic service is temporarily unreachable. Please ensure the local server is running on port 8000 and try again.";
    }
    if (lower.includes("supabase") || lower.includes("database")) {
      return "Database connection failure. Local forensic analysis is complete, but persistence is unavailable.";
    }
    if (lower.includes("gemini") || lower.includes("ai-assisted")) {
      return "AI-assisted analysis could not be completed. Local technical diagnostics and file inspection remain available.";
    }
    if (lower.includes("c2pa") || lower.includes("provenance")) {
      return "Provenance verification is unavailable for this file.";
    }
    if (lower.includes("search") || lower.includes("source discovery")) {
      return "Source discovery is temporarily unavailable. Local forensic analysis remains complete.";
    }
    return err || "An unexpected error occurred during forensic verification.";
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto shadow-sm">
      <div className="p-3 bg-red-50 text-red-600 rounded-full border border-red-100">
        <AlertCircle className="w-8 h-8" />
      </div>
      <div className="space-y-1">
        <h4 className="font-semibold text-slate-800 text-base">Forensic Pipeline Issue</h4>
        <p className="text-slate-500 text-xs leading-relaxed">{getReadableError(error)}</p>
      </div>
      {retryAction && (
        <button
          onClick={retryAction}
          className="inline-flex items-center gap-1.5 bg-[#1b365d] hover:bg-[#152a4a] text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-all shadow-sm cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{retryLabel}</span>
        </button>
      )}
    </div>
  );
}
