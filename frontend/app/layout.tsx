import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";

export const metadata: Metadata = {
  title: "TRACE-AI | Forensic Intelligence Platform",
  description: "AI-Powered Media Detection, Source Tracing & Forensic Verification",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-screen bg-slate-50 text-slate-800 flex overflow-hidden">
        <Suspense fallback={<div className="w-64 bg-white border-r border-slate-200" />}>
          <Sidebar />
        </Suspense>
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto bg-slate-50 animate-fade-in">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
