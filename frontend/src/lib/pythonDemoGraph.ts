import type { PatchEdge, PatchNode } from "./patchGraphParser";

type Position = { x: number; y: number };

const SIGNAL_NODE_DEFAULTS = {
  numinlets: 2,
  numoutlets: 1,
  outlettype: ["signal"],
};

const CONTROL_NODE_DEFAULTS = {
  numinlets: 1,
  numoutlets: 1,
  outlettype: [""],
};

function isSignalText(text: string): boolean {
  const head = (text.trim().split(/\s+/)[0] ?? "").trim();
  return head.endsWith("~");
}

function guessIo(text: string): { numinlets: number; numoutlets: number; outlettype: string[] } {
  const head = (text.trim().split(/\s+/)[0] ?? "").trim();

  // Common Max/MSP objects in the demo.
  switch (head) {
    case "plugin~":
      return { numinlets: 2, numoutlets: 2, outlettype: ["signal", "signal"] };
    case "plugout~":
      return { numinlets: 2, numoutlets: 0, outlettype: [] };
    case "sig~":
      return { numinlets: 1, numoutlets: 1, outlettype: ["signal"] };
    case "+~":
    case "-~":
    case "*~":
      return { numinlets: 2, numoutlets: 1, outlettype: ["signal"] };
    case "clip~":
    case "cycle~":
      return { numinlets: 2, numoutlets: 1, outlettype: ["signal"] };
    case "comment":
      return { numinlets: 1, numoutlets: 0, outlettype: [] };
    default:
      return isSignalText(text) ? SIGNAL_NODE_DEFAULTS : CONTROL_NODE_DEFAULTS;
  }
}

export interface PythonDemoGraphResult {
  nodes: PatchNode[];
  edges: PatchEdge[];
}

/**
 * Very small “good enough” parser for our landing demo’s MaxPyLang-style code.
 * It intentionally only supports the subset we use:
 * - `patch.set_position(x, y)` for layout hints
 * - `x = patch.place("obj ...")[0]`
 * - `x = place_raw({ ... "maxclass": "...", "text": "..." ... }, x, y)`
 * - `patch.connect([a.outs[i], b.ins[j]], ...)`
 */
export function parsePythonDemoGraph(code: string): PythonDemoGraphResult {
  const varToNode = new Map<string, PatchNode>();
  const order: string[] = [];

  let currentPos: Position = { x: 40, y: 100 };

  const setPosRe = /\b(?:patch|p)\.set_position\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g;
  const placeRe = /^\s*([A-Za-z_]\w*)\s*=\s*(?:patch|p)\.place\(\s*["']([^"']+)["']\s*\)\s*\[\s*0\s*\]/gm;
  const placeRawRe =
    /^\s*([A-Za-z_]\w*)\s*=\s*place_raw\(\s*\{[\s\S]*?"maxclass"\s*:\s*"([^"]+)"[\s\S]*?"text"\s*:\s*"([^"]+)"[\s\S]*?\}\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)\s*$/gm;
  const connectPairRe = /\[\s*([A-Za-z_]\w*)\.outs\[(\d+)\]\s*,\s*([A-Za-z_]\w*)\.ins\[(\d+)\]\s*\]/g;

  // Track last seen patch.set_position while scanning lines (keeps semantics close to original code).
  // We can't rely on a full AST, so we do a cheap sequential scan.
  const lines = code.split("\n");
  for (const line of lines) {
    const m = /\b(?:patch|p)\.set_position\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(line);
    if (m) currentPos = { x: Number(m[1]), y: Number(m[2]) };

    const pMatch = /^\s*([A-Za-z_]\w*)\s*=\s*(?:patch|p)\.place\(\s*["']([^"']+)["']\s*\)\s*\[\s*0\s*\]/.exec(line);
    if (pMatch) {
      const [, varName, text] = pMatch;
      const io = guessIo(text);
      varToNode.set(varName, {
        id: varName,
        type: "maxObject",
        position: { x: currentPos.x, y: currentPos.y },
        data: {
          text,
          maxclass: "newobj",
          numinlets: io.numinlets,
          numoutlets: io.numoutlets,
          outlettype: io.outlettype,
          isSignal: isSignalText(text),
        },
      });
      order.push(varName);
      // Many code snippets omit set_position between successive place() calls.
      // Nudge downward to avoid stacking nodes on top of each other.
      currentPos = { x: currentPos.x, y: currentPos.y + 44 };
    }
  }

  // place_raw blocks can span multiple lines, so parse on the whole document.
  for (const match of code.matchAll(placeRawRe)) {
    const [, varName, maxclass, text, x, y] = match;
    // The landing demo should focus on the signal-flow graph, not presentation chrome.
    // The example code includes background/header panels for Ableton presentation mode.
    if (maxclass === "panel") continue;
    // Some presentation-only labels live far to the right; excluding them avoids
    // `fitView` bounding-box inflation that makes the actual signal chain tiny/left.
    if (maxclass === "comment" && Number(x) >= 600) continue;
    const io = guessIo(text);
    varToNode.set(varName, {
      id: varName,
      type: "maxObject",
      position: { x: Number(x), y: Number(y) },
      data: {
        text,
        maxclass,
        numinlets: io.numinlets,
        numoutlets: io.numoutlets,
        outlettype: io.outlettype,
        isSignal: isSignalText(text),
      },
    });
    if (!order.includes(varName)) order.push(varName);
  }

  // Parse all connection pairs.
  const edges: PatchEdge[] = [];
  for (const match of code.matchAll(connectPairRe)) {
    const [, srcVar, srcOut, dstVar, dstIn] = match;
    if (!varToNode.has(srcVar) || !varToNode.has(dstVar)) continue;

    const sourceHandle = String(srcOut);
    const targetHandle = String(dstIn);

    // Signal-ness: if the source node is signal, treat as signal edge for styling.
    const isSignal = Boolean(varToNode.get(srcVar)?.data?.isSignal);

    edges.push({
      id: `${srcVar}:${sourceHandle}->${dstVar}:${targetHandle}`,
      source: srcVar,
      target: dstVar,
      sourceHandle,
      targetHandle,
      data: { isSignal },
    });
  }

  // Keep nodes in a stable order for deterministic rendering.
  const nodes = order
    .map((id) => varToNode.get(id))
    .filter((n): n is PatchNode => Boolean(n));

  return { nodes, edges };
}

