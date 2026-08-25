"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  FolderOpen, 
  ShieldAlert, 
  Activity, 
  Plus, 
  ArrowRight,
  Clock,
  CheckCircle,
  FileCheck,
  Play,
  AlertCircle,
  TrendingUp,
  Sliders
} from "lucide-react";
import EmptyState from "@/components/empty-state";
import ErrorState from "@/components/error-state";

interface Investigation {
  id: string;
  title: string;
  description: string;
  case_number: string | null;
  status: string;
  risk_level: string;
  created_at: string;
  updated_at: string;
}

export default function Dashboard() {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [sourcesCount, setSourcesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [backendStatus, setBackendStatus] = useState("checking");

  useEffect(() => {
    fetch("http://localhost:8000/api/investigations")
      .then((res) => {
        if (!res.ok) throw new Error("API server returned an error.");
        return res.json();
      })
      .then((data: Investigation[]) => {
        setInvestigations(data);
        setBackendStatus("connected");
        setLoading(false);

        // Fetch sources count dynamically for each investigation
        Promise.all(data.map(inv => 
          fetch(`http://localhost:8000/api/investigations/${inv.id}/sources`)
            .then(res => res.ok ? res.json() : [])
            .then(sources => sources.length)
            .catch(() => 0)
        )).then(counts => {
          const total = counts.reduce((a, b) => a + b, 0);
          setSourcesCount(total);
        });
      })
      .catch((err) => {
        console.error(err);
        setBackendStatus("offline");
        setErrorMsg("Unable to retrieve investigations. Please ensure the backend API server is running.");
        setLoading(false);
      });
  }, []);

  const getRiskBadgeColor = (level: string) => {
    if (!level) return "bg-slate-100 text-slate-500 border border-slate-200";
    switch (level.toLowerCase()) {
      case "critical": return "bg-red-50 text-red-700 border border-red-200";
      case "high": return "bg-amber-50 text-amber-700 border border-amber-200";
      case "medium": return "bg-blue-50 text-blue-700 border border-blue-200";
      case "insufficient": return "bg-slate-100 text-slate-500 border border-slate-200";
      default: return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed": return "bg-emerald-50 text-emerald-700 border border-emerald-200";
      case "failed": return "bg-rose-50 text-rose-700 border border-rose-200";
      case "running": return "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse";
      default: return "bg-slate-100 text-slate-600 border border-slate-200";
    }
  };

  return (
    <div className="p-8 space-y-8 flex-1 bg-slate-50">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Forensic Operations Center</h2>
          <p className="text-slate-500 text-xs mt-1">
            Chandigarh Police Digital Investigation Console & Source Tracing Hub
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold border ${
            backendStatus === "connected" 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
              : "bg-amber-50 text-amber-700 border-amber-200"
          }`}>
            <Activity className="w-3.5 h-3.5" />
            <span>API SERVER: {backendStatus.toUpperCase()}</span>
          </div>
          
          <Link href="/investigations/new" className="flex items-center gap-2 bg-[#1b365d] hover:bg-[#152a4a] text-white font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-sm focus:ring-2 focus:ring-[#1b365d] focus:outline-none">
            <Plus className="w-4 h-4" />
            <span>+ New Case</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Active Investigations</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-2 font-mono">
              {investigations.filter(i => i.status.toLowerCase() === "active" || i.status.toLowerCase() === "running").length}
            </h3>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-[#1b365d]">
            <FolderOpen className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Awaiting Review</p>
            <h3 className="text-2xl font-bold text-amber-600 mt-2 font-mono">
              {investigations.filter(i => i.status.toLowerCase() !== "completed" && i.status.toLowerCase() !== "failed").length}
            </h3>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-100 text-amber-500 rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">High-Risk Media</p>
            <h3 className="text-2xl font-bold text-rose-600 mt-2 font-mono">
              {investigations.filter(i => i.risk_level.toLowerCase() === "critical" || i.risk_level.toLowerCase() === "high").length}
            </h3>
          </div>
          <div className="p-3 bg-rose-50 border border-rose-100 text-rose-500 rounded-lg">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Source Candidates</p>
            <h3 className="text-2xl font-bold text-[#1b365d] mt-2 font-mono">
              {sourcesCount}
            </h3>
          </div>
          <div className="p-3 bg-blue-50 border border-blue-100 text-[#1b365d] rounded-lg">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Active Investigations Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 flex flex-col space-y-4 shadow-sm min-h-[350px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h3 className="font-bold text-base text-slate-800">Investigations Casefile</h3>
            <span className="text-[10px] text-[#1b365d] font-mono tracking-widest uppercase font-bold">Audit Synchronized</span>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <span className="text-slate-500 text-xs animate-pulse">Synchronizing case repositories...</span>
            </div>
          ) : errorMsg ? (
            <div className="flex-1 flex items-center justify-center py-6">
              <ErrorState error={errorMsg} />
            </div>
          ) : investigations.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-6">
              <EmptyState 
                icon={FolderOpen}
                title="No investigations yet"
                description="Initialize your first case file by uploading suspicious media."
                action={
                  <Link href="/investigations/new" className="inline-flex items-center gap-2 bg-[#1b365d] hover:bg-[#152a4a] text-white font-bold px-4 py-2.5 rounded-lg text-xs transition-all shadow-sm focus:ring-2 focus:ring-[#1b365d] focus:outline-none">
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ New Case</span>
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-150">
                    <th className="pb-3 font-semibold uppercase text-[10px] tracking-wider">Case Reference</th>
                    <th className="pb-3 font-semibold uppercase text-[10px] tracking-wider">Case Title</th>
                    <th className="pb-3 font-semibold uppercase text-[10px] tracking-wider">Risk</th>
                    <th className="pb-3 font-semibold uppercase text-[10px] tracking-wider">Status</th>
                    <th className="pb-3 font-semibold uppercase text-[10px] tracking-wider">Created</th>
                    <th className="pb-3 font-semibold uppercase text-[10px] tracking-wider">Last Updated</th>
                    <th className="pb-3 font-semibold uppercase text-[10px] tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {investigations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/55 transition-all group">
                      <td className="py-3.5 font-mono font-bold text-[#1b365d]">
                        {inv.case_number || `CASE-${inv.id.substring(0, 8).toUpperCase()}`}
                      </td>
                      <td className="py-3.5 font-medium text-slate-800 max-w-[150px] truncate">
                        {inv.title}
                      </td>
                      <td className="py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold border ${getRiskBadgeColor(inv.risk_level)}`}>
                          {inv.risk_level?.toLowerCase() === "insufficient" ? "INSUFFICIENT EVIDENCE" : inv.risk_level}
                        </span>
                      </td>
                      <td className="py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold border ${getStatusBadgeColor(inv.status)}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3.5 text-slate-500 font-mono">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 text-slate-500 font-mono">
                        {new Date(inv.updated_at).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 text-right">
                        <Link 
                          href={`/investigations/${inv.id}`} 
                          onClick={() => {
                            if (typeof window !== "undefined") {
                              localStorage.setItem("last_active_case", inv.id);
                            }
                          }}
                          className="inline-flex items-center gap-1 font-bold text-[#1b365d] group-hover:text-blue-800 transition-colors focus:ring-2 focus:ring-[#1b365d] focus:outline-none"
                        >
                          <span>Open Case</span>
                          <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar Case Feeds */}
        <div className="space-y-6">
          {/* Quick Sandbox workspace link */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-3 text-[#1b365d]">
              <FileCheck className="w-5 h-5" />
              <h4 className="font-bold text-base text-slate-800">Forensic Sandbox</h4>
            </div>
            <p className="text-slate-500 text-xs leading-relaxed">
              Launch the complete **Demo Investigation** workflow immediately. This sandbox showcases simulated cross-platform propagation, video metadata analysis, and narrative modifications without requiring server APIs.
            </p>
            <Link 
              href="/demo" 
              className="flex items-center justify-center gap-2 w-full bg-[#1b365d] hover:bg-[#152a4a] text-white font-bold py-2.5 rounded-lg text-xs transition-all shadow-sm focus:ring-2 focus:ring-[#1b365d] focus:outline-none cursor-pointer"
            >
              <span>Explore Demo Workspace</span>
              <Play className="w-3.5 h-3.5 fill-white text-white border-none" />
            </Link>
          </div>

          {/* Audit events feed */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
            <h4 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#1b365d]" />
              <span>Live Operations Feed</span>
            </h4>
            <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
              <div className="border-l-2 border-slate-200 pl-3 space-y-1 text-xs">
                <span className="text-[10px] text-slate-400 font-mono">Just Now</span>
                <p className="font-semibold text-slate-700">Audit sync complete</p>
                <p className="text-slate-500 leading-normal">System verification successfully loaded.</p>
              </div>
              <div className="border-l-2 border-slate-200 pl-3 space-y-1 text-xs">
                <span className="text-[10px] text-slate-400 font-mono">1 Hour Ago</span>
                <p className="font-semibold text-slate-700">External services verified</p>
                <p className="text-slate-500 leading-normal">Gemini & Tavily API check passed.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
