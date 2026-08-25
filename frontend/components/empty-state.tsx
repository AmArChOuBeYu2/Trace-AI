"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 bg-white border border-slate-200 rounded-xl shadow-sm min-h-[220px] max-w-lg mx-auto space-y-4">
      <div className="p-3.5 bg-slate-50 border border-slate-100 text-slate-400 rounded-full">
        <Icon className="w-8 h-8" />
      </div>
      <div className="space-y-1">
        <h4 className="font-semibold text-slate-800 text-base">{title}</h4>
        <p className="text-slate-500 text-xs leading-relaxed max-w-sm">{description}</p>
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
