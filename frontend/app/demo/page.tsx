"use client";

import React, { useState } from "react";
import Link from "next/navigation";
import { ArrowLeft, PlayCircle } from "lucide-react";
import InvestigationWorkspace, { WorkspaceData } from "@/components/investigation-workspace";

export default function DemoPage() {
  
  // High fidelity preloaded forensic dataset
  const demoData: WorkspaceData = {
    investigation: {
      id: "demo-case-1",
      title: "Viral Election Ballot Tampering Claim",
      description: "Manipulated video clip showing alleged destruction of ballot papers in Sector 1办公 building.",
      case_number: "CHD-2026-0812",
      status: "active",
      risk_level: "critical",
      created_at: new Date(Date.now() - 3600000 * 24).toISOString()
    },
    media: {
      id: "demo-media-1",
      filename: "ballot_destruction_sec17.mp4",
      mime_type: "video/mp4",
      storage_path: "/static/uploads/demo_video.mp4", // Mock path to demonstrate preview card format
      sha256: "d8e8f81f14c41498b8c5a2c4e12e3456789abcdef0123456789abcdef0123456",
      size_bytes: 24589201,
      perceptual_hash: "a1b2c3d4e5f67890"
    },
    findings: [
      {
        id: "f-1",
        category: "metadata",
        evidence_level: "OBSERVED",
        finding: "File header records rendering software modification trace: Adobe Premiere Pro 24.0.",
        severity: "medium",
        confidence: "conclusive",
        method: "Metadata Container Inspection",
        model: "FFprobe Header Parser"
      },
      {
        id: "f-2",
        category: "compression",
        evidence_level: "INFERRED",
        finding: "Error Level Analysis shows localized high variance in compression rate at coordinates [120, 240].",
        severity: "high",
        confidence: "high",
        method: "Error Level Analysis",
        model: "Pillow ELA Processor",
        evidence: JSON.stringify({
          ela_image_path: "/static/uploads/ela_sample.jpg",
          ela_anomaly_score: 82.5
        })
      },
      {
        id: "f-3",
        category: "temporal",
        evidence_level: "INFERRED",
        finding: "Abrupt frame discontinuity detected at frame index 142. Mismatched motion vectors imply splice.",
        severity: "high",
        confidence: "medium",
        method: "Frame Difference Variance",
        model: "OpenCV Motion Tracing"
      },
      {
        id: "f-4",
        category: "audio",
        evidence_level: "INFERRED",
        finding: "Synthetic vocal speech spectrum trace anomalies identified at timeline block 00:12s - 00:14s.",
        severity: "high",
        confidence: "medium",
        method: "Spectral envelope extraction",
        model: "Voice Clone Classifier"
      },
      {
        id: "f-5",
        category: "ocr",
        evidence_level: "OBSERVED",
        finding: "OCR extracts superimposed text: 'CHANDIGARH ELECTION FRAUD - STAFF DESTROYING BALOTS'.",
        severity: "info",
        confidence: "high",
        method: "Visual text extraction",
        model: "Gemini Vision OCR"
      }
    ],
    c2pa: {
      status: "NOT_PRESENT",
      verification_result: "No verifiable C2PA credentials present in video stream."
    },
    sources: [
      {
        id: "s-1",
        url: "https://www.facebook.com/groups/chandigarhlocal/posts/29103982",
        domain: "facebook.com",
        title: "Alert: Routine paper recycling in Sector 17 office",
        platform: "Facebook",
        publication_time: new Date(Date.now() - 3600000 * 48).toISOString(),
        discovered_time: new Date(Date.now() - 3600000 * 48).toISOString(),
        discovery_method: "langsearch",
        similarity_score: 1.0,
        confidence: "conclusive",
        evidence: "100% perceptual hash match of source frames."
      },
      {
        id: "s-2",
        url: "https://x.com/chandigarh_bulletin/status/178491823901",
        domain: "x.com",
        title: "Viral: Staff member seen burning ballot boxes in office",
        platform: "Twitter",
        publication_time: new Date(Date.now() - 3600000 * 36).toISOString(),
        discovered_time: new Date(Date.now() - 3600000 * 36).toISOString(),
        discovery_method: "tavily",
        similarity_score: 0.92,
        confidence: "high",
        evidence: "Video match with added crop and text overlay."
      },
      {
        id: "s-3",
        url: "https://www.facebook.com/watch/?v=9034823910",
        domain: "facebook.com",
        title: "Proof: Election staff burning ballots in Chandigarh",
        platform: "Facebook",
        publication_time: new Date(Date.now() - 3600000 * 24).toISOString(),
        discovered_time: new Date(Date.now() - 3600000 * 24).toISOString(),
        discovery_method: "langsearch",
        similarity_score: 0.92,
        confidence: "high",
        evidence: "Matched repost with sensational audio overlay."
      }
    ],
    graph: {
      nodes: [
        {
          id: "node-1",
          type: "customNode",
          data: {
            label: "Origination (Facebook)",
            platform: "Facebook",
            url: "https://facebook.com/posts/29103982",
            timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
            node_type: "source",
            confidence: "high"
          },
          position: { x: 250, y: 50 }
        },
        {
          id: "node-2",
          data: {
            label: "Modified Version (Twitter)",
            platform: "Twitter",
            url: "https://x.com/status/178491823901",
            timestamp: new Date(Date.now() - 3600000 * 36).toISOString(),
            node_type: "modification",
            confidence: "high"
          },
          position: { x: 100, y: 200 }
        },
        {
          id: "node-3",
          data: {
            label: "Amplified Repost (Facebook watch)",
            platform: "Facebook",
            url: "https://facebook.com/watch/?v=9034823910",
            timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
            node_type: "repost",
            confidence: "high"
          },
          position: { x: 400, y: 200 }
        }
      ],
      edges: [
        {
          id: "edge-1",
          source: "node-1",
          target: "node-2",
          label: "modified",
          animated: true,
          data: { relationship: "modified", confidence: "high" }
        },
        {
          id: "edge-2",
          source: "node-2",
          target: "node-3",
          label: "reposted",
          animated: false,
          data: { relationship: "reposted", confidence: "high" }
        }
      ]
    },
    narrative: {
      versions: [
        {
          id: "v-1",
          text: "Routine paper recycling disposal scheduled for Sector 17 government office.",
          summary: "Official office recycling protocol.",
          change_type: "contextual"
        },
        {
          id: "v-2",
          text: "Staff member burning ballot boxes inside Sector 17 office.",
          summary: "Sensationalized claim omitting recycling context.",
          change_type: "sensationalized"
        },
        {
          id: "v-3",
          text: "Officer caught burning ballots admitting to systemic election fraud.",
          summary: "Accusatory claim alleging conspiracy.",
          change_type: "accusatory"
        }
      ],
      analysis: {
        evolution_pattern: "Contextual -> Sensationalized -> Accusatory",
        summary: "The narrative shifted from routine office waste recycling to direct election fraud conspiracy. Specific context was stripped, and an emotional, accusatory tone was added.",
        intensity_score: 0.85
      }
    },
    audit: [
      {
        id: "a-1",
        event_type: "MEDIA_UPLOADED",
        description: "Demo media asset uploaded. SHA-256 computed: d8e8f81f14c414...",
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString()
      },
      {
        id: "a-2",
        event_type: "METADATA_EXTRACTED",
        description: "EXIF parameters compiled. Editing software tags discovered.",
        timestamp: new Date(Date.now() - 3600000 * 23.9).toISOString()
      },
      {
        id: "a-3",
        event_type: "AI_ANALYSIS_COMPLETED",
        description: "Neural frame analyzer completed checks. Compression variance flagged.",
        timestamp: new Date(Date.now() - 3600000 * 23.8).toISOString()
      },
      {
        id: "a-4",
        event_type: "PROPAGATION_GRAPH_CREATED",
        description: "Propagation path successfully mapped from discovered web matches.",
        timestamp: new Date(Date.now() - 3600000 * 23.7).toISOString()
      }
    ]
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
      {/* Sandbox Alert Bar */}
      <div className="bg-[#1b365d] text-white px-8 py-2 text-xs font-mono font-bold flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <PlayCircle className="w-4 h-4" />
          <span>SANDBOX MODE: PRESENTING PRELOADED FORENSIC DATASET</span>
        </div>
        <span className="uppercase text-[9px] border border-white/30 px-1.5 py-0.5 rounded font-bold">DEMO ONLY</span>
      </div>

      <InvestigationWorkspace data={demoData} isDemo={true} />
    </div>
  );
}
