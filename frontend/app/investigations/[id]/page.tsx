"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import InvestigationWorkspace, { WorkspaceData } from "@/components/investigation-workspace";
import { API_BASE_URL } from "@/config";

export default function InvestigationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invId = params.id as string;

  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchCaseDetails = async () => {
    try {
      // 1. Fetch case metadata
      const invRes = await fetch(`${API_BASE_URL}/api/investigations/${invId}`);
      if (!invRes.ok) throw new Error("Failed to load investigation details");
      const investigation = await invRes.json();

      // 2. Fetch media assets
      const mediaRes = await fetch(`${API_BASE_URL}/api/investigations/${invId}/media`);
      if (!mediaRes.ok) throw new Error("Failed to load media assets");
      const mediaList = await mediaRes.json();
      const media = mediaList[0] || null;

      let findings = [];
      let c2pa = { status: "NOT_PRESENT" };

      // 3. Fetch media details if present
      if (media) {
        const findingsRes = await fetch(`${API_BASE_URL}/api/media/${media.id}/findings`);
        if (findingsRes.ok) findings = await findingsRes.json();

        const c2paRes = await fetch(`${API_BASE_URL}/api/media/${media.id}/provenance`);
        if (c2paRes.ok) c2pa = await c2paRes.json();
      }

      // 4. Fetch sources, propagation, narrative, and audits
      const sourcesRes = await fetch(`${API_BASE_URL}/api/investigations/${invId}/sources`);
      const sources = sourcesRes.ok ? await sourcesRes.json() : [];

      const graphRes = await fetch(`${API_BASE_URL}/api/investigations/${invId}/graph`);
      const graph = graphRes.ok ? await graphRes.json() : { nodes: [], edges: [] };

      const narrativeRes = await fetch(`${API_BASE_URL}/api/investigations/${invId}/narrative`);
      const narrative = narrativeRes.ok 
        ? await narrativeRes.json() 
        : { versions: [], analysis: {} };

      const auditRes = await fetch(`${API_BASE_URL}/api/investigations/${invId}/audit`);
      const audit = auditRes.ok ? await auditRes.json() : [];

      setData({
        investigation,
        media,
        findings,
        c2pa,
        sources,
        graph,
        narrative,
        audit
      });
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not retrieve forensic details for this case reference.");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (invId) {
      fetchCaseDetails();
    }
  }, [invId]);

  const handleManualSearch = async (keywords: string) => {
    const formData = new FormData();
    formData.append("keywords", keywords);
    
    const res = await fetch(`${API_BASE_URL}/api/investigations/${invId}/source-search`, {
      method: "POST",
      body: formData
    });
    if (res.ok) {
      await fetchCaseDetails();
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-8 h-8 text-[#06b6d4] animate-spin" />
        <span className="text-slate-400 text-sm font-semibold tracking-wide">
          Assembling Case Evidence Trails...
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full">
          <ArrowLeft className="w-8 h-8 cursor-pointer" onClick={() => router.push("/dashboard")} />
        </div>
        <h3 className="text-lg font-bold text-slate-200">Investigation Error</h3>
        <p className="text-slate-400 max-w-md text-sm">{error || "Failed to load case data."}</p>
        <Link href="/dashboard" className="text-xs font-semibold text-[#06b6d4] hover:underline">
          Return to Operations Center
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-8 pt-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors font-medium">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Operations Center</span>
        </Link>
      </div>
      <Suspense fallback={
        <div className="flex-1 flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-8 h-8 text-[#1b365d] animate-spin" />
          <span className="text-slate-400 text-sm font-semibold tracking-wide">
            Assembling Case Evidence Trails...
          </span>
        </div>
      }>
        <InvestigationWorkspace data={data} onManualSearch={handleManualSearch} onRefresh={fetchCaseDetails} />
      </Suspense>
    </div>
  );
}
