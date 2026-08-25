"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Search, Plus, Upload, Activity } from "lucide-react";
import { API_BASE_URL } from "@/config";

export default function TopBar() {
  const pathname = usePathname();
  const [caseInfo, setCaseInfo] = useState<{ id: string; caseNumber: string; status: string } | null>(null);

  useEffect(() => {
    const segments = pathname.split("/");
    const isInvestigationPage = segments[1] === "investigations" && segments[2] && segments[2] !== "page";
    const isDemoPage = segments[1] === "demo";

    if (isDemoPage) {
      setCaseInfo({
        id: "demo-case-1",
        caseNumber: "CHD-2026-0812",
        status: "simulation",
      });
    } else if (isInvestigationPage) {
      const caseId = segments[2];
      fetch(`${API_BASE_URL}/api/investigations/${caseId}`)
        .then((res) => {
          if (!res.ok) throw new Error();
          return res.json();
        })
        .then((data) => {
          setCaseInfo({
            id: data.id,
            caseNumber: data.case_number || `CASE-${data.id.substring(0, 8).toUpperCase()}`,
            status: data.status,
          });
        })
        .catch(() => {
          setCaseInfo({
            id: caseId,
            caseNumber: `CASE-${caseId.substring(0, 8).toUpperCase()}`,
            status: "active",
          });
        });
    } else {
      setCaseInfo(null);
    }
  }, [pathname]);

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 select-none shrink-0 z-20 shadow-sm">
      {/* Brand Header / Active Case Context */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-[#1b365d] fill-[#1b365d]/10" />
          <div>
            <h1 className="font-bold text-sm text-slate-800 tracking-tight leading-none">TRACE-AI</h1>
            <p className="text-[9px] text-slate-400 font-semibold tracking-wider mt-0.5 uppercase">Digital Media Forensics</p>
          </div>
        </div>

        {caseInfo && (
          <div className="h-8 w-px bg-slate-200 hidden md:block" />
        )}

        {caseInfo && (
          <div className="hidden md:flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg text-xs">
            <span className="font-mono font-bold text-[#1b365d]">{caseInfo.caseNumber}</span>
            <span className="h-3 w-px bg-slate-300" />
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${
                caseInfo.status.toLowerCase() === "completed" 
                  ? "bg-emerald-500" 
                  : caseInfo.status.toLowerCase() === "simulation"
                    ? "bg-purple-500"
                    : "bg-blue-500 animate-pulse"
              }`} />
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px] font-mono">
                {caseInfo.status}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Global Search Bar */}
      <div className="flex-1 max-w-md mx-8 hidden lg:block">
        <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus-within:border-[#1b365d] focus-within:ring-1 focus-within:ring-[#1b365d] transition-all">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search cases, evidence, sources..."
            className="w-full bg-transparent border-none outline-none pl-2 text-xs text-slate-700 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Actions & Status */}
      <div className="flex items-center gap-4">
        {/* Live status operational */}
        <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#1b365d] tracking-wider uppercase font-mono hidden sm:flex bg-blue-50 border border-blue-100 rounded px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
          <span>System Operational</span>
        </div>

        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        <div className="flex items-center gap-2">
          <Link
            href="/upload"
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[#1b365d] font-bold px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Media</span>
          </Link>
          <Link
            href="/investigations/new"
            className="flex items-center gap-1.5 bg-[#1b365d] hover:bg-[#152a4a] text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ New Investigation</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
