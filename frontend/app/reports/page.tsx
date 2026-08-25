"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  FileText, 
  ExternalLink,
  Search,
  AlertCircle,
  FolderOpen
} from "lucide-react";
import { API_BASE_URL } from "@/config";

interface Report {
  id: string;
  case_number: string;
  title: string;
  risk_level: string;
  created_at: string;
  report_path: string;
}

export default function ReportsArchive() {
  const [reports, setReports] = useState<Report[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/investigations`)
      .then((res) => {
        if (!res.ok) throw new Error("API server returned an error.");
        return res.json();
      })
      .then((data) => {
        const formatted: Report[] = data.map((inv: any) => ({
          id: inv.id,
          case_number: inv.case_number || `CASE-${inv.id.substring(0, 8).toUpperCase()}`,
          title: inv.title,
          risk_level: inv.risk_level,
          created_at: inv.created_at,
          report_path: `/investigations/${inv.id}?tab=reports`
        }));
        setReports(formatted);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setErrorMsg("Unable to retrieve reports archive. Please ensure the local API server is active and the database connection is configured.");
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

  const filtered = reports.filter(rep => 
    rep.title.toLowerCase().includes(search.toLowerCase()) || 
    rep.case_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-8 flex-1 bg-slate-50">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Reports Archive</h2>
          <p className="text-slate-500 text-sm mt-1">
            Access, view, and print certified case investigation reports.
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
        <Search className="w-5 h-5 text-slate-400" />
        <input 
          type="text" 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by Case Number or title keywords..."
          className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder-slate-400"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-sm animate-pulse">
          Retrieving reports repository...
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
            <h4 className="font-bold text-slate-700 text-base">No reports discovered</h4>
            <p className="text-slate-400 text-xs mt-1">
              {search 
                ? "No matching reports discovered. Adjust your filter keywords." 
                : "No case studies have generated certified forensic report indices yet."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          {filtered.map((rep) => (
            <div key={rep.id} className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-4 hover:border-[#1b365d]/50 hover:shadow-md transition-all shadow-sm">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-500">{rep.case_number}</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] uppercase border font-bold ${getRiskBadge(rep.risk_level)}`}>
                    {rep.risk_level}
                  </span>
                </div>
                <h4 className="font-bold text-slate-800 text-base leading-snug line-clamp-2">{rep.title}</h4>
              </div>

              <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                <div className="text-[10px] text-slate-400 font-mono">
                  Report generated: {new Date(rep.created_at).toLocaleDateString()}
                </div>
                <Link 
                  href={rep.report_path}
                  className="flex items-center gap-1.5 text-xs text-[#1b365d] hover:text-blue-800 font-bold transition-colors focus:ring-2 focus:ring-[#1b365d] focus:outline-none"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Open Report</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
