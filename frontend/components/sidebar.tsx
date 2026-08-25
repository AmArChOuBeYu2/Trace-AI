"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { 
  LayoutDashboard, 
  Upload, 
  ShieldAlert, 
  FileText, 
  Settings, 
  Shield, 
  Activity,
  Globe,
  TrendingUp,
  Sliders,
  History,
  FolderOpen
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams ? searchParams.get("tab") : null;

  const handleIntelClick = (tab: string) => {
    if (typeof window !== "undefined") {
      const lastCase = localStorage.getItem("last_active_case") || "demo";
      if (lastCase === "demo") {
        router.push(`/demo?tab=${tab}`);
      } else {
        router.push(`/investigations/${lastCase}?tab=${tab}`);
      }
    }
  };

  const isTabActive = (tab: string) => {
    const inWorkspace = pathname.startsWith("/demo") || pathname.startsWith("/investigations/");
    return inWorkspace && activeTabParam === tab;
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 shrink-0 select-none z-30 shadow-sm">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-200 flex items-center gap-3">
        <div className="p-2 bg-[#1b365d]/5 text-[#1b365d] rounded-lg border border-[#1b365d]/10">
          <Shield className="w-5 h-5 fill-[#1b365d]/10" />
        </div>
        <div>
          <h1 className="font-bold text-base text-slate-800 tracking-wider">TRACE-AI</h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Forensic Console</p>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        {/* OPERATIONS */}
        <div className="space-y-1.5">
          <span className="px-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Operations</span>
          <Link
            href="/dashboard"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              pathname === "/dashboard"
                ? "bg-[#1b365d] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </Link>
          <Link
            href="/investigations"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              pathname === "/investigations"
                ? "bg-[#1b365d] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Cases</span>
          </Link>
        </div>

        {/* MEDIA */}
        <div className="space-y-1.5">
          <span className="px-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Media</span>
          <Link
            href="/upload"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              pathname === "/upload"
                ? "bg-[#1b365d] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Upload & Analyze</span>
          </Link>
          <Link
            href="/investigations"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 text-slate-600 hover:bg-slate-50 hover:text-slate-800`}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span>Evidence</span>
          </Link>
        </div>

        {/* INTELLIGENCE */}
        <div className="space-y-1.5">
          <span className="px-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Intelligence</span>
          <button
            onClick={() => handleIntelClick("sources")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 text-left cursor-pointer ${
              isTabActive("sources")
                ? "bg-[#1b365d] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <Globe className="w-4 h-4 shrink-0" />
            <span>Source Tracing</span>
          </button>
          <button
            onClick={() => handleIntelClick("propagation")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 text-left cursor-pointer ${
              isTabActive("propagation")
                ? "bg-[#1b365d] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span>Propagation</span>
          </button>
          <button
            onClick={() => handleIntelClick("plim")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 text-left cursor-pointer ${
              isTabActive("plim")
                ? "bg-[#1b365d] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <Sliders className="w-4 h-4 shrink-0" />
            <span>TRACE-PLIM</span>
          </button>
        </div>

        {/* REPORTING */}
        <div className="space-y-1.5">
          <span className="px-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Reporting</span>
          <Link
            href="/reports"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              pathname === "/reports"
                ? "bg-[#1b365d] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Reports</span>
          </Link>
          <button
            onClick={() => handleIntelClick("reports")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 text-left cursor-pointer ${
              isTabActive("reports")
                ? "bg-[#1b365d] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <History className="w-4 h-4 shrink-0" />
            <span>Chain of Custody</span>
          </button>
        </div>

        {/* SYSTEM */}
        <div className="space-y-1.5 border-t border-slate-100 pt-4">
          <Link
            href="/settings"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              pathname === "/settings"
                ? "bg-[#1b365d] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>Settings</span>
          </Link>
          <Link
            href="/demo"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 bg-slate-100 text-[#1b365d] border border-slate-200 hover:bg-slate-200/50`}
          >
            <Activity className="w-4 h-4 shrink-0" />
            <span>Demo Sandbox</span>
          </Link>
        </div>
      </nav>

      {/* System Status Indicators */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2.5 p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
          <Activity className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">SYSTEM STATUS</p>
            <p className="text-[10px] text-emerald-600 uppercase font-bold mt-1 font-mono tracking-wide">● OPERATIONAL</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
