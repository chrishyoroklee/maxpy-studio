/**
 * PatchGraph.tsx
 *
 * Renders a Max/MSP-style node graph using React Flow.
 * Read-only viewer: no dragging, no connecting -- just zoom/pan/select.
 */

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type NodeProps,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { PatchNode, PatchEdge, PatchNodeData } from "../lib/patchGraphParser";
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

  const rfNodes: Node[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      })),
    [nodes]
  );

  return (
    <div className="patch-graph">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag
        zoomOnScroll
        minZoom={0.2}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
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
