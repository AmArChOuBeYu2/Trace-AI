"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Upload, 
  ShieldAlert, 
  FileText, 
  Play, 
  Settings, 
  Shield, 
  Activity
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  
  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Upload & Analyze", href: "/upload", icon: Upload },
    { name: "Investigations", href: "/investigations", icon: ShieldAlert },
    { name: "Reports Archive", href: "/reports", icon: FileText },
    { name: "Demo Sandbox", href: "/demo", icon: Play, highlight: true },
    { name: "System Settings", href: "/settings", icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col h-screen sticky top-0 shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-200 flex items-center gap-3">
        <div className="p-2 bg-slate-200 text-[#1b365d] rounded-lg">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-bold text-lg text-slate-800 tracking-wider">TRACE-AI</h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Forensic Console</p>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${
                item.highlight 
                  ? "bg-slate-200 text-[#1b365d] border border-slate-300 hover:bg-slate-300/50" 
                  : isActive
                    ? "bg-[#1b365d] text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-800"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Police Department Badge */}
      <div className="p-4 border-t border-slate-200 bg-slate-100/50">
        <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
          <Activity className="w-4 h-4 text-emerald-600 shrink-0 animate-pulse" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 truncate">System Core Status</p>
            <p className="text-[10px] text-emerald-600 uppercase tracking-widest font-bold font-mono">CONNECTED</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
