/**
 * PatchGraph.tsx
 *
 * Renders a Max/MSP-style node graph using React Flow.
 * Nodes are draggable for visual rearrangement. No connecting yet.
 */

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  type NodeProps,
  type Node,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { PatchNode, PatchEdge, PatchNodeData } from "../lib/patchGraphParser";
import { logEvent } from "../lib/firestore";
import "./PatchGraph.css";

/* ------------------------------------------------------------------ */
/*  MaxObjectNode — custom node component                             */
/* ------------------------------------------------------------------ */

type MaxObjectNodeType = Node<PatchNodeData, "maxObject">;

function MaxObjectNode({ data, selected }: NodeProps<MaxObjectNodeType>) {
  const { text, maxclass, numinlets, numoutlets, outlettype, isSignal } = data;

  const bodyClasses = ["max-object-node__body"];

  switch (maxclass) {
    case "message":
      bodyClasses.push("max-object-node__body--message");
      break;
    case "comment":
      bodyClasses.push("max-object-node__body--comment");
      break;
    case "number":
    case "flonum":
      bodyClasses.push("max-object-node__body--number");
      break;
    case "toggle":
      bodyClasses.push("max-object-node__body--toggle");
      break;
  }

  if (isSignal && maxclass !== "comment") {
    bodyClasses.push("max-object-node__body--signal");
  }

  const inlets = useMemo(() => {
    const handles = [];
    for (let i = 0; i < numinlets; i++) {
      const isSignalInlet = isSignal && i === 0;
      const leftPercent =
        numinlets === 1 ? 50 : (i / (numinlets - 1)) * 80 + 10;
      handles.push(
        <Handle
          key={`in-${i}`}
          type="target"
          position={Position.Top}
          id={String(i)}
          className={
            isSignalInlet
              ? "react-flow__handle--signal"
              : "react-flow__handle--control"
          }
          style={{ left: `${leftPercent}%` }}
          isConnectable={false}
        />
      );
    }
    return handles;
  }, [numinlets, isSignal]);

  const outlets = useMemo(() => {
    const handles = [];
    for (let i = 0; i < numoutlets; i++) {
      const isSignalOutlet = outlettype[i] === "signal";
      const leftPercent =
        numoutlets === 1 ? 50 : (i / (numoutlets - 1)) * 80 + 10;
      handles.push(
        <Handle
          key={`out-${i}`}
          type="source"
          position={Position.Bottom}
          id={String(i)}
          className={
            isSignalOutlet
              ? "react-flow__handle--signal"
              : "react-flow__handle--control"
          }
          style={{ left: `${leftPercent}%` }}
          isConnectable={false}
        />
      );
    }
    return handles;
  }, [numoutlets, outlettype]);

  const label = maxclass === "toggle" ? "X" : text;

  return (
    <div className={`max-object-node${selected ? " selected" : ""}`}>
      {inlets}
      <div className={bodyClasses.join(" ")}>{label}</div>
      {outlets}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Node type registry                                                */
/* ------------------------------------------------------------------ */

const nodeTypes = { maxObject: MaxObjectNode };

/* ------------------------------------------------------------------ */
/*  PatchGraph — main component                                       */
/* ------------------------------------------------------------------ */

interface PatchGraphProps {
  nodes: PatchNode[];
  edges: PatchEdge[];
}

export function PatchGraph({ nodes, edges }: PatchGraphProps) {
  const hasLoggedInteraction = useRef(false);
  const isInitialFit = useRef(true);

  // Reset when new patch data arrives
  useEffect(() => {
    hasLoggedInteraction.current = false;
    isInitialFit.current = true;
    // Wait for fitView animation to settle before allowing interaction logging
    const t = setTimeout(() => { isInitialFit.current = false; }, 500);
    return () => clearTimeout(t);
  }, [nodes]);

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        className: e.data.isSignal ? "signal-edge" : "control-edge",
        type: "default",
      })),
    [edges]
  );

  // Nodes are stateful so they can be dragged. Parent uses a `key` prop to
  // force remount when patch data changes, so we only need the initializer.
  const [rfNodes, setRfNodes] = useState<Node[]>(() =>
    nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data }))
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setRfNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  return (
    <div className="patch-graph">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        onNodesChange={onNodesChange}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag
        zoomOnScroll
        minZoom={0.2}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        onMoveEnd={() => {
          if (isInitialFit.current) return; // ignore fitView's auto-pan
          if (!hasLoggedInteraction.current) {
            hasLoggedInteraction.current = true;
            logEvent("graph_interact", { type: "zoom_pan" });
          }
        }}
        onNodeClick={() => {
          if (!hasLoggedInteraction.current) {
            hasLoggedInteraction.current = true;
            logEvent("graph_interact", { type: "node_click" });
          }
        }}
      >
        <Background gap={20} size={1} color="rgba(255,255,255,0.03)" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) => {
            const d = node.data as unknown as PatchNodeData;
            if (d.isSignal) return "var(--signal, #c8a83e)";
            if (d.maxclass === "comment") return "rgba(255,255,255,0.15)";
            return "var(--text-secondary)";
          }}
          maskColor="rgba(8, 8, 13, 0.7)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
