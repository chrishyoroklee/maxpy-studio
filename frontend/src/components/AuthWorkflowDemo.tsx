import { useState, useCallback, useEffect, useRef } from "react";
import { PatchGraph } from "./PatchGraph";
import type { PatchEdge, PatchNode } from "../lib/patchGraphParser";

const SAMPLE_PROMPT =
  "Create me a simple Max for Live device: a sine oscillator at 440 Hz into the main outputs, with a live gain slider.";

const DEMO_NODES: PatchNode[] = [
  {
    id: "osc",
    type: "maxObject",
    position: { x: 40, y: 100 },
    data: {
      text: "cycle~ 440",
      maxclass: "newobj",
      numinlets: 2,
      numoutlets: 1,
      outlettype: ["signal"],
      isSignal: true,
    },
  },
  {
    id: "dac",
    type: "maxObject",
    position: { x: 280, y: 100 },
    data: {
      text: "ezdac~",
      maxclass: "newobj",
      numinlets: 2,
      numoutlets: 0,
      outlettype: [],
      isSignal: true,
    },
  },
];

const DEMO_EDGES: PatchEdge[] = [
  {
    id: "e-osc-dac",
    source: "osc",
    target: "dac",
    sourceHandle: "0",
    targetHandle: "0",
    data: { isSignal: true },
  },
];

const STATIC_CODE = `import maxpylang as mp

p = mp.MaxPatch()
osc = p.place("cycle~ 440")[0]
dac = p.place("ezdac~")[0]
p.connect([osc.outs[0], dac.ins[0]])
p.save("preview.maxpat")`;

const CODE_LINES = STATIC_CODE.split("\n");

/** Spinner → graph: quick. Code reveal after graph: slower (“actual build” on the page). */
const DEMO_RUN_MS = 900;
const DEMO_CODE_LINE_MS = 320;

type Phase = "idle" | "running" | "done";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => setReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
}

export function AuthWorkflowDemo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [graphCycle, setGraphCycle] = useState(0);
  const [visibleCodeLines, setVisibleCodeLines] = useState(0);
  const [showGraphTip, setShowGraphTip] = useState(false);
  const [tipPos, setTipPos] = useState<{ x: number; y: number }>({ x: 18, y: 18 });
  const tipDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const codeLineIntervalRef = useRef<number | null>(null);

  const stopCodeLineReveal = useCallback(() => {
    if (codeLineIntervalRef.current !== null) {
      window.clearInterval(codeLineIntervalRef.current);
      codeLineIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCodeLineReveal(), [stopCodeLineReveal]);

  const runDemo = useCallback(() => {
    if (phase !== "idle") return;
    stopCodeLineReveal();
    setVisibleCodeLines(0);
    setShowGraphTip(false);
    setPhase("running");
    window.setTimeout(() => {
      setGraphCycle((c) => c + 1);
      setPhase("done");
      setTipPos({ x: 18, y: 18 });
      setShowGraphTip(true);

      const instant =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (instant) {
        setVisibleCodeLines(CODE_LINES.length);
        return;
      }

      setVisibleCodeLines(0);
      let i = 0;
      codeLineIntervalRef.current = window.setInterval(() => {
        i += 1;
        setVisibleCodeLines(i);
        if (i >= CODE_LINES.length) stopCodeLineReveal();
      }, DEMO_CODE_LINE_MS);
    }, DEMO_RUN_MS);
  }, [phase, stopCodeLineReveal]);

  const replay = useCallback(() => {
    stopCodeLineReveal();
    setPhase("idle");
    setVisibleCodeLines(0);
    setShowGraphTip(false);
  }, [stopCodeLineReveal]);

  const codeShown = CODE_LINES.slice(0, visibleCodeLines).join("\n");
  const codeTyping = phase === "done" && !reducedMotion && visibleCodeLines < CODE_LINES.length;

  const dismissGraphTip = useCallback(() => setShowGraphTip(false), []);

  const onTipPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    tipDragRef.current = { startX: e.clientX, startY: e.clientY, originX: tipPos.x, originY: tipPos.y };
  }, [tipPos.x, tipPos.y]);

  const onTipPointerMove = useCallback((e: React.PointerEvent) => {
    if (!tipDragRef.current) return;
    const dx = e.clientX - tipDragRef.current.startX;
    const dy = e.clientY - tipDragRef.current.startY;
    setTipPos({ x: tipDragRef.current.originX + dx, y: tipDragRef.current.originY + dy });
  }, []);

  const onTipPointerUp = useCallback(() => {
    tipDragRef.current = null;
  }, []);

  return (
    <div className="auth-workflow-demo auth-workflow-surface">
      <div className="auth-workflow-prompt-row">
        <div className="auth-workflow-prompt-wrap">
          <textarea
            id="auth-demo-prompt"
            className="auth-workflow-prompt"
            readOnly
            rows={2}
            value={SAMPLE_PROMPT}
            aria-readonly="true"
          />
          <button
            type="button"
            className="auth-workflow-submit"
            onClick={runDemo}
            disabled={phase !== "idle"}
            aria-label={phase === "idle" ? "Run static preview" : "Preview running or complete"}
          >
            {phase === "running" ? (
              <span className="auth-workflow-spinner" aria-hidden="true" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 12h14M13 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div
        className={
          "auth-workflow-split" +
          (phase === "idle" ? " auth-workflow-split--idle" : "") +
          (phase === "running" ? " auth-workflow-split--running" : "") +
          (phase === "done" ? " auth-workflow-split--done" : "")
        }
      >
        <div className="auth-workflow-graph">
          {phase === "done" ? (
            <PatchGraph
              key={`auth-demo-${graphCycle}`}
              nodes={DEMO_NODES}
              edges={DEMO_EDGES}
              animatedEdges
              onUserInteract={dismissGraphTip}
            />
          ) : (
            <div className="auth-workflow-panel-empty" aria-hidden="true" />
          )}

          {phase === "done" && showGraphTip && (
            <div
              className="auth-workflow-tip"
              style={{ transform: `translate(${tipPos.x}px, ${tipPos.y}px)` }}
              role="note"
              aria-label="Tip: you can drag and adjust the patch"
              onPointerMove={onTipPointerMove}
              onPointerUp={onTipPointerUp}
            >
              <button type="button" className="auth-workflow-tip-close" onClick={dismissGraphTip} aria-label="Dismiss tip">
                ×
              </button>
              <div
                className="auth-workflow-tip-header"
                onPointerDown={onTipPointerDown}
                onPointerUp={onTipPointerUp}
                aria-label="Drag to reposition tip"
              >
                Tip
              </div>
              <div className="auth-workflow-tip-body">
                Drag nodes to rearrange. Pan/zoom to explore.
                <span className="auth-workflow-tip-subtle"> This hint disappears once you interact.</span>
              </div>
            </div>
          )}
        </div>

        <div className="auth-workflow-code-panel">
          {(phase === "idle" || phase === "running") && (
            <div className="auth-workflow-status" role={phase === "running" ? "status" : undefined}>
              {phase === "running" ? (
                <>
                  <span className="auth-workflow-running-dot" />
                  <span className="auth-workflow-status-text">Building patch graph…</span>
                </>
              ) : (
                <span className="auth-workflow-status-text">Ready to generate.</span>
              )}
            </div>
          )}

          <pre className="auth-workflow-code">
            <code>
              {phase === "done" ? codeShown : "# Output will appear here"}
              {phase === "done" && codeTyping && <span className="auth-workflow-caret" aria-hidden="true" />}
            </code>
          </pre>
        </div>
      </div>

      {phase === "done" && (
        <div className="auth-workflow-toolbar">
          <button type="button" className="auth-workflow-replay" onClick={replay}>
            Replay
          </button>
          <span className="auth-workflow-hint">Cable animates on load; code types out (reduced-motion: instant).</span>
        </div>
      )}

      <p className="auth-workflow-links">
        <a href="https://github.com/chrishyoroklee/maxpy-studio" target="_blank" rel="noopener noreferrer">
          maxpy-studio
        </a>
        <span aria-hidden="true"> · </span>
        <a href="https://github.com/Barnard-PL-Labs/MaxPyLang" target="_blank" rel="noopener noreferrer">
          MaxPyLang
        </a>
        <span aria-hidden="true"> · </span>
        <a href="https://www.youtube.com/@fishpyler" target="_blank" rel="noopener noreferrer">
          @fishpyler
        </a>
      </p>
    </div>
  );
}
