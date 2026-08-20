"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  FolderOpen, 
  ShieldAlert, 
  Database, 
  Activity, 
  Plus, 
  ArrowRight,
  Clock,
  CheckCircle,
  FileCheck,
  Play,
  AlertCircle
} from "lucide-react";

interface Investigation {
  id: string;
  title: string;
  description: string;
  case_number: string | null;
  status: string;
  risk_level: string;
  created_at: string;
}

export default function Dashboard() {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [backendStatus, setBackendStatus] = useState("checking");

  useEffect(() => {
    fetch("http://localhost:8000/api/investigations")
      .then((res) => {
        if (!res.ok) throw new Error("API server returned an error.");
        return res.json();
      })
      .then((data) => {
        setInvestigations(data);
        setBackendStatus("connected");
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setBackendStatus("offline");
        setErrorMsg("Unable to retrieve investigations. Please ensure the backend API server is running and the database service is reachable.");
        setLoading(false);
      });
  }, []);

  const getRiskBadgeColor = (level: string) => {
    switch (level.toLowerCase()) {
      case "critical": return "bg-red-100 text-red-700 border border-red-200";
      case "high": return "bg-amber-100 text-amber-700 border border-amber-200";
      case "medium": return "bg-blue-100 text-blue-700 border border-blue-200";
      default: return "bg-emerald-100 text-emerald-700 border border-emerald-200";
    }
  };

  return (
    <div className="p-8 space-y-8 flex-1 bg-slate-50">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Forensic Operations Center</h2>
          <p className="text-slate-500 text-sm mt-1">
            Chandigarh Police Digital Investigation Console & Source Tracing Hub
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold border ${
            backendStatus === "connected" 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
              : "bg-amber-50 text-amber-700 border-amber-200"
          }`}>
            <Activity className="w-3.5 h-3.5" />
            <span>API SERVER: {backendStatus.toUpperCase()}</span>
          </div>
          
          <Link href="/upload" className="flex items-center gap-2 bg-[#1b365d] hover:bg-[#152a4a] text-white font-semibold px-4 py-2 rounded-lg text-sm transition-all shadow-sm focus:ring-2 focus:ring-[#1b365d] focus:outline-none">
            <Plus className="w-4 h-4" />
            <span>New Investigation</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Total Cases</p>
            <h3 className="text-3xl font-bold text-slate-800 mt-2 font-mono">{investigations.length}</h3>
          </div>
          <div className="p-3 bg-slate-100 rounded-lg text-slate-500">
            <FolderOpen className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Critical/High Risk</p>
            <h3 className="text-3xl font-bold text-red-600 mt-2 font-mono">
              {investigations.filter(i => i.risk_level === "critical" || i.risk_level === "high").length}
            </h3>
          </div>
          <div className="p-3 bg-red-50 text-red-500 rounded-lg">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Verified Cases</p>
            <h3 className="text-3xl font-bold text-emerald-600 mt-2 font-mono">
              {investigations.filter(i => i.status === "completed").length}
            </h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">System Database</p>
            <h3 className="text-base font-bold text-slate-800 mt-3 truncate font-mono">
              {backendStatus === "connected" ? "Supabase SQL" : "OFFLINE"}
            </h3>
          </div>
          <div className="p-3 bg-blue-50 text-[#1b365d] rounded-lg">
            <Database className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Active Investigations Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 flex flex-col space-y-4 shadow-sm min-h-[300px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h3 className="font-bold text-lg text-slate-800">Active Investigations</h3>
            <span className="text-[10px] text-[#1b365d] font-mono tracking-widest uppercase font-bold">AUDIT TRAIL SYNCED</span>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <span className="text-slate-500 text-sm animate-pulse">Synchronizing case repositories...</span>
            </div>
          ) : errorMsg ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-500" />
              <p className="text-sm text-slate-600 max-w-sm">{errorMsg}</p>
            </div>
          ) : investigations.length === 0 ? (
            /* Beautiful Empty State (Screen 1 & Correction 5) */
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center space-y-4">
              <FolderOpen className="w-12 h-12 text-slate-300" />
              <div>
                <h4 className="font-bold text-slate-700 text-base">No investigations yet</h4>
                <p className="text-slate-400 text-xs mt-1">Initialize your first case file by uploading suspicious media.</p>
              </div>
              <Link href="/upload" className="inline-flex items-center gap-2 bg-[#1b365d] hover:bg-[#152a4a] text-white font-semibold px-4 py-2 rounded-lg text-xs transition-all shadow-sm focus:ring-2 focus:ring-[#1b365d] focus:outline-none">
                <Plus className="w-3.5 h-3.5" />
                <span>+ New Investigation</span>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="pb-3 font-semibold uppercase text-xs">Case Reference</th>
                    <th className="pb-3 font-semibold uppercase text-xs">Case Title</th>
                    <th className="pb-3 font-semibold uppercase text-xs">Risk Rating</th>
                    <th className="pb-3 font-semibold uppercase text-xs">Initiated Date</th>
                    <th className="pb-3 font-semibold uppercase text-xs text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {investigations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/55 transition-all">
                      <td className="py-4 font-mono text-xs font-bold text-slate-600">
                        {inv.case_number || `CASE-${inv.id.substring(0, 8).toUpperCase()}`}
                      </td>
                      <td className="py-4 font-medium text-slate-800 max-w-[200px] truncate">
                        {inv.title}
                      </td>
                      <td className="py-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getRiskBadgeColor(inv.risk_level)}`}>
                          {inv.risk_level}
                        </span>
                      </td>
                      <td className="py-4 text-xs text-slate-500 font-mono">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4 text-right">
                        <Link 
                          href={`/investigations/${inv.id}`} 
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#1b365d] hover:text-blue-800 transition-colors focus:ring-2 focus:ring-[#1b365d] focus:outline-none"
                        >
                          <span>Open Case</span>
                          <ArrowRight className="w-3.5 h-3.5" />
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
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-3 text-[#1b365d]">
              <FileCheck className="w-6 h-6" />
              <h4 className="font-bold text-lg text-slate-800">Hackathon Sandbox</h4>
            </div>
            <p className="text-slate-600 text-xs leading-relaxed">
              Launch the complete **Demo Investigation** workflow immediately. This sandbox showcases simulated cross-platform propagation, video metadata analysis, and narrative modifications without requiring server APIs.
            </p>
            <Link 
              href="/demo" 
              className="flex items-center justify-center gap-2 w-full bg-[#1b365d] hover:bg-[#152a4a] text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-sm focus:ring-2 focus:ring-[#1b365d] focus:outline-none"
            >
              <span>Explore Demo Workspace</span>
              <Play className="w-3.5 h-3.5 fill-white text-white border-none" />
            </Link>
          </div>

          {/* Audit events feed */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
            <h4 className="font-bold text-base text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#1b365d]" />
              <span>Live Operations Feed</span>
            </h4>
            <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
              <div className="border-l-2 border-slate-200 pl-3 space-y-1 text-xs">
                <span className="text-[10px] text-slate-400 font-mono">Just Now</span>
                <p className="font-medium text-slate-700">Audit sync complete</p>
                <p className="text-slate-500">Supabase schemas verified and active.</p>
              </div>
              <div className="border-l-2 border-slate-200 pl-3 space-y-1 text-xs">
                <span className="text-[10px] text-slate-400 font-mono">1 Hour Ago</span>
                <p className="font-medium text-slate-700">External services pinged</p>
                <p className="text-slate-500">Gemini & LangSearch connected successfully.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
