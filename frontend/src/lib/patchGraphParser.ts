// ---------------------------------------------------------------------------
// patchGraphParser.ts
// Converts .maxpat JSON into a React Flow-compatible graph data model.
// ---------------------------------------------------------------------------

// ---- Input types (raw .maxpat JSON) ----------------------------------------

/** A single box entry inside `patcher.boxes[]`. */
export interface MaxPatBox {
  id: string;
  maxclass: string;
  text?: string;
  patching_rect?: [number, number, number, number]; // [x, y, width, height]
  numinlets?: number;
  numoutlets?: number;
  outlettype?: string[];
}

/** A single patchline entry inside `patcher.lines[]`. */
export interface MaxPatLine {
  source: [string, number]; // [box-id, outlet-index]
  destination: [string, number]; // [box-id, inlet-index]
}

/** The top-level `.maxpat` JSON structure we care about. */
export interface MaxPatJson {
  patcher: {
    boxes?: Array<{ box: MaxPatBox }>;
    lines?: Array<{ patchline: MaxPatLine }>;
  };
}

// ---- Output types (React Flow-compatible) -----------------------------------

/** Data payload carried by every PatchNode. */
export interface PatchNodeData {
  text: string;
  maxclass: string;
  numinlets: number;
  numoutlets: number;
  outlettype: string[];
  /** True when the object name ends with `~` (audio/signal rate). */
  isSignal: boolean;
  [key: string]: unknown;
}

/**
 * A React Flow node produced from a .maxpat box.
 */
export interface PatchNode {
  id: string;
  type: "maxObject";
  position: { x: number; y: number };
  data: PatchNodeData;
}

/** Data payload carried by every PatchEdge. */
export interface PatchEdgeData {
  /** True when the source outlet carries an audio signal. */
  isSignal: boolean;
}

/**
 * A React Flow edge produced from a .maxpat patchline.
 */
export interface PatchEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  data: PatchEdgeData;
}

/** The complete graph returned by `parsePatchGraph`. */
export interface PatchGraph {
  nodes: PatchNode[];
  edges: PatchEdge[];
}

// ---- Helpers ----------------------------------------------------------------

function isSignalObject(text: string): boolean {
  const className = text.split(/\s+/)[0] ?? "";
  return className.endsWith("~");
}

// ---- Parser -----------------------------------------------------------------

/**
 * Parse a `.maxpat` JSON structure into a React Flow-compatible graph.
 */
export function parsePatchGraph(maxpat: MaxPatJson): PatchGraph {
  const boxes = maxpat.patcher?.boxes ?? [];
  const lines = maxpat.patcher?.lines ?? [];

  const outletTypesByBoxId = new Map<string, string[]>();

  const nodes: PatchNode[] = boxes.map((entry) => {
    const box = entry.box;
    const text = box.text ?? box.maxclass ?? "";
    const numinlets = box.numinlets ?? 0;
    const numoutlets = box.numoutlets ?? 0;
    const outlettype = box.outlettype ?? [];
    const rect = box.patching_rect ?? [0, 0, 60, 22];

    outletTypesByBoxId.set(box.id, outlettype);

    return {
      id: box.id,
      type: "maxObject" as const,
      position: { x: rect[0], y: rect[1] },
      data: {
        text,
        maxclass: box.maxclass,
        numinlets,
        numoutlets,
        outlettype,
        isSignal: isSignalObject(text),
      },
    };
  });

  const edges: PatchEdge[] = lines.map((entry) => {
    const line = entry.patchline;
    const [sourceId, outletIdx] = line.source;
    const [targetId, inletIdx] = line.destination;

    const sourceOutletTypes = outletTypesByBoxId.get(sourceId) ?? [];
    const isSignal = sourceOutletTypes[outletIdx] === "signal";

    return {
      id: `${sourceId}:${outletIdx}->${targetId}:${inletIdx}`,
      source: sourceId,
      target: targetId,
      sourceHandle: String(outletIdx),
      targetHandle: String(inletIdx),
      data: { isSignal },
    };
  });

  return { nodes, edges };
}
