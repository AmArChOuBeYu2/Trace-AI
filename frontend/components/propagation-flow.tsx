"use client";

import React, { useMemo } from "react";
import ReactFlow, { 
  Background, 
  Controls, 
  Edge, 
  Node,
  MarkerType
} from "reactflow";
import "reactflow/dist/style.css";

interface PropagationFlowProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: (node: Node) => void;
}

export default function PropagationFlow({ nodes, edges, onNodeClick }: PropagationFlowProps) {
  
  // Custom styles for flow container aligned with light mode
  const flowStyles = {
    background: "#ffffff",
    width: "100%",
    height: "100%"
  };

  const defaultEdgeOptions = useMemo(() => ({
    style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#94a3b8",
      width: 15,
      height: 15
    }
  }), []);

  const handleNodeClickEvent = (_: React.MouseEvent, node: Node) => {
    if (onNodeClick) {
      onNodeClick(node);
    }
  };

  return (
    <div className="w-full h-[400px] border border-slate-200 rounded-xl overflow-hidden bg-white relative shadow-sm">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        style={flowStyles}
        onNodeClick={handleNodeClickEvent}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#cbd5e1" gap={16} size={1.2} />
        <Controls showInteractive={false} className="bg-white text-slate-800 border-slate-200 [&>button]:border-slate-100" />
      </ReactFlow>
      
      {/* Node Guide badge */}
      <div className="absolute bottom-3 right-3 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-[9px] flex gap-3 text-slate-500 font-mono font-bold shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-600" />
          <span>Source</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Altered</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          <span>Repost</span>
        </div>
      </div>
    </div>
  );
}
