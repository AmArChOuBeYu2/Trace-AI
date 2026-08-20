"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  ShieldAlert, 
  Search, 
  ArrowRight,
  Filter,
  AlertCircle,
  FolderOpen,
  Plus
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

export default function InvestigationsList() {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch("http://localhost:8000/api/investigations")
      .then((res) => {
        if (!res.ok) throw new Error("API server returned an error.");
        return res.json();
      })
      .then((data) => {
        setInvestigations(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setErrorMsg("Unable to retrieve cases repository. Please ensure the local API server is active and the database connection is configured.");
        setLoading(false);
      });
  }, []);

  const getRiskBadge = (level: string) => {
    switch (level.toLowerCase()) {
      case "critical": return "text-red-700 bg-red-50 border-red-200";
      case "high": return "text-amber-700 bg-amber-50 border-amber-200";
      case "medium": return "text-blue-700 bg-blue-50 border-blue-200";
      default: return "text-emerald-700 bg-emerald-50 border-emerald-200";
    }
  };

  const filtered = investigations.filter((inv) => {
    const matchesSearch = inv.title.toLowerCase().includes(search.toLowerCase()) || 
                          (inv.case_number && inv.case_number.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || inv.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-8 space-y-8 flex-1 bg-slate-50">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-[#1b365d]" />
            <span>Investigations Casefile</span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Browse and query all stored active, completed, or archived digital forensics files.
          </p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
          <Search className="w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or reference case number..."
            className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder-slate-400"
          />
        </div>
        
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 min-w-[200px] shadow-sm select-none">
          <Filter className="w-4 h-4 text-slate-400" />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-sm text-slate-700 outline-none flex-1"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-sm animate-pulse">
          Loading case indices...
        </div>
      ) : errorMsg ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-3 shadow-sm">
          <AlertCircle className="w-8 h-8 text-amber-500" />
          <p className="text-sm text-slate-600 max-w-sm">{errorMsg}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
          <FolderOpen className="w-12 h-12 text-slate-300" />
          <div>
            <h4 className="font-bold text-slate-700 text-base">No investigations yet</h4>
            <p className="text-slate-400 text-xs mt-1">
              {search || statusFilter !== "all" 
                ? "No cases match your filter criteria. Try resetting search queries." 
                : "Initialize your first case file by uploading suspicious media."}
            </p>
          </div>
          {(!search && statusFilter === "all") && (
            <Link href="/upload" className="inline-flex items-center gap-2 bg-[#1b365d] hover:bg-[#152a4a] text-white font-semibold px-4 py-2 rounded-lg text-xs transition-all shadow-sm focus:ring-2 focus:ring-[#1b365d] focus:outline-none">
              <Plus className="w-3.5 h-3.5" />
              <span>+ New Investigation</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
          {filtered.map((inv) => (
            <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-4 hover:border-[#1b365d]/50 hover:shadow-md transition-all shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#1b365d]">
                    {inv.case_number || `CASE-${inv.id.substring(0, 8).toUpperCase()}`}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[9px] uppercase border font-bold ${getRiskBadge(inv.risk_level)}`}>
                    {inv.risk_level}
                  </span>
                </div>
                <h4 className="font-bold text-slate-800 text-base leading-snug line-clamp-2">{inv.title}</h4>
                <p className="text-slate-500 text-xs line-clamp-3 leading-relaxed">{inv.description}</p>
              </div>

              <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-mono">
                  Created: {new Date(inv.created_at).toLocaleDateString()}
                </span>
                <Link 
                  href={`/investigations/${inv.id}`}
                  className="flex items-center gap-1 text-xs font-bold text-[#1b365d] hover:text-blue-800 transition-colors focus:ring-2 focus:ring-[#1b365d] focus:outline-none"
                >
                  <span>Open Case Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
