import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { PatchGraph } from "./PatchGraph";
import type { PatchEdge, PatchNode } from "../lib/patchGraphParser";
import { parsePythonDemoGraph } from "../lib/pythonDemoGraph";

const SAMPLE_PROMPT = 'Make a tremolo audio effect with a knob for overdrive/distortion.';

const STATIC_CODE = `"""
Max for Live Tremolo + Overdrive (Audio Effect)
================================================
A tremolo effect with aggressive overdrive distortion for that cranked amp sound.

Controls:
  Rate  — LFO speed (0.1–20 Hz)
  Depth — tremolo intensity (0 = bypass, 1 = full tremolo)
  Drive — overdrive amount (0 = clean, 1 = heavily overdriven)

Signal flow:
  plugin~ (stereo from Ableton)
    └─ +~ → *~ 0.5 (sum to mono)
              │
              *~ ← tremolo modulator
              │         ↑
              │   cycle~ rate → *~ 0.5 → +~ 0.5 (unipolar 0..1)
              │                   → -~ 1. → *~ depth → +~ 1.
              │
        *~ pre_gain → clip~ -0.7 0.7 → *~ post_gain → clip~ -0.9 0.9
              │                                              │
        *~ makeup_gain → clip~ -1. 1. → plugout~
"""

import json
import maxpylang as mp
from maxpylang.maxobject import MaxObject

patch = mp.MaxPatch()


def place_raw(obj_dict, x, y):
    """Create a MaxObject from a raw dict and place it at (x, y)."""
    obj = MaxObject(obj_dict, from_dict=True)
    patch.set_position(x, y)
    patch.place_obj(obj, position=[float(x), float(y)])
    return obj


# ============================================================
# PRESENTATION BACKGROUND (orange/red distortion vibe)
# ============================================================

panel = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [700.0, 100.0, 200.0, 120.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 200.0, 120.0],
        "bgcolor": [0.15, 0.08, 0.05, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 700, 100)

header = place_raw({
    "box": {
        "maxclass": "panel", "text": "panel",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [700.0, 90.0, 200.0, 24.0],
        "presentation": 1, "presentation_rect": [0.0, 0.0, 200.0, 24.0],
        "bgcolor": [0.85, 0.35, 0.15, 1.0],
        "mode": 0, "rounded": 0, "background": 1,
    }
}, 700, 90)

title = place_raw({
    "box": {
        "maxclass": "comment", "text": "TREMOLO + OVERDRIVE",
        "numinlets": 1, "numoutlets": 0, "outlettype": [],
        "patching_rect": [700.0, 70.0, 180.0, 20.0],
        "presentation": 1, "presentation_rect": [8.0, 4.0, 185.0, 18.0],
        "fontsize": 11.0, "fontface": 1,
        "textcolor": [1.0, 0.9, 0.7, 1.0],
    }
}, 700, 70)

# ============================================================
# AUDIO INPUT
# ============================================================

patch.set_position(30, 30)
patch.place("comment === AUDIO INPUT ===")[0]

plugin = place_raw({
    "box": {
        "maxclass": "newobj", "numinlets": 2, "numoutlets": 2,
        "outlettype": ["signal", "signal"],
        "patching_rect": [30.0, 65.0, 46.0, 22.0],
        "text": "plugin~"
    }
}, 30, 65)

# Sum stereo to mono
patch.set_position(30, 105)
sum_stereo = patch.place("+~")[0]

patch.set_position(30, 145)
norm = patch.place("*~ 0.5")[0]

patch.connect(
    [plugin.outs[0], sum_stereo.ins[0]],
    [plugin.outs[1], sum_stereo.ins[1]],
    [sum_stereo.outs[0], norm.ins[0]],
)

# ============================================================
# TREMOLO LFO (sine wave with depth scaling)
# ============================================================

patch.set_position(250, 30)
patch.place("comment === TREMOLO LFO ===")[0]

# LFO oscillator — frequency controlled by Rate dial
patch.set_position(250, 65)
lfo = patch.place("cycle~ 4")[0]

# Scale bipolar (-1..1) to unipolar (0..1)
patch.set_position(250, 105)
lfo_scale = patch.place("*~ 0.5")[0]

patch.set_position(250, 145)
lfo_offset = patch.place("+~ 0.5")[0]

# Depth scaling: modulator = 1 + depth * (lfo_unipolar - 1)
# At depth=0: constant 1 (no tremolo). At depth=1: full 0..1 tremolo.
patch.set_position(250, 185)
lfo_shift = patch.place("-~ 1.")[0]       # lfo - 1 → range (-1..0)

patch.set_position(250, 225)
depth_scale = patch.place("*~")[0]        # * depth → range (-depth..0)

patch.set_position(250, 265)
modulator = patch.place("+~ 1.")[0]       # + 1 → range (1-depth..1)

patch.connect(
    [lfo.outs[0], lfo_scale.ins[0]],
    [lfo_scale.outs[0], lfo_offset.ins[0]],
    [lfo_offset.outs[0], lfo_shift.ins[0]],
    [lfo_shift.outs[0], depth_scale.ins[0]],
    [depth_scale.outs[0], modulator.ins[0]],
)

# ============================================================
# TREMOLO VCA (input * modulator)
# ============================================================

patch.set_position(30, 210)
patch.place("comment === TREMOLO ===")[0]

patch.set_position(30, 245)
tremolo_vca = patch.place("*~")[0]

patch.connect(
    [norm.outs[0], tremolo_vca.ins[0]],      # mono audio → tremolo VCA
    [modulator.outs[0], tremolo_vca.ins[1]], # depth-scaled modulator → VCA
)

# ============================================================
# AGGRESSIVE OVERDRIVE (multiple clipping stages)
# ============================================================

patch.set_position(30, 300)
patch.place("comment === OVERDRIVE DISTORTION ===")[0]

# Pre-gain boost — drive control scales from 1x to 8x gain
patch.set_position(30, 335)
pre_gain = patch.place("*~")[0]

patch.set_position(200, 335)
sig_drive = patch.place("sig~")[0]

patch.set_position(200, 375)
drive_scale = patch.place("*~ 7.")[0]      # scale 0-1 to 0-7

patch.set_position(200, 415)
drive_offset = patch.place("+~ 1.")[0]     # offset to 1-8 range

# First clipping stage — tight clip at ±0.7 for early saturation
patch.set_position(30, 375)
clip1 = patch.place("clip~ -0.7 0.7")[0]

# Post-gain — boost the clipped signal
patch.set_position(30, 415)
post_gain = patch.place("*~ 2.5")[0]

# Second clipping stage — slightly looser at ±0.9
patch.set_position(30, 455)
clip2 = patch.place("clip~ -0.9 0.9")[0]

# Makeup gain to compensate for clipping losses
patch.set_position(30, 495)
makeup_gain = patch.place("*~ 0.6")[0]

patch.connect(
    [tremolo_vca.outs[0], pre_gain.ins[0]],      # tremolo'd audio → pre-gain
    [drive_offset.outs[0], pre_gain.ins[1]],     # (drive * 7 + 1) → gain
    [pre_gain.outs[0], clip1.ins[0]],            # boosted signal → first clip
    [clip1.outs[0], post_gain.ins[0]],           # clipped → post-gain
    [post_gain.outs[0], clip2.ins[0]],           # boosted again → second clip
    [clip2.outs[0], makeup_gain.ins[0]],         # final clip → makeup gain
)

# ============================================================
# CONTROLS (live.dial — automatable in Ableton)
# ============================================================

patch.set_position(430, 30)
patch.place("comment === CONTROLS ===")[0]

# Orange/red color scheme for distortion vibe
DIAL_COLORS = {
    "activedialcolor": [0.95, 0.45, 0.15, 1.0],     # bright orange active
    "dialcolor": [0.35, 0.15, 0.08, 1.0],           # dark brown inactive
    "activeneedlecolor": [1.0, 0.9, 0.7, 1.0],      # warm white needle
    "needlecolor": [0.75, 0.55, 0.35, 1.0],         # muted orange needle
    "textcolor": [1.0, 0.9, 0.7, 1.0],              # warm white text
}


def make_dial(name, px, min_v, max_v, init, exponent=1.0):
    """Create a live.dial at presentation x=px."""
    return place_raw({
        "box": {
            "maxclass": "live.dial", "varname": name.lower(),
            "text": "live.dial",
            "numinlets": 1, "numoutlets": 2, "outlettype": ["", "float"],
            "patching_rect": [430.0 + (px - 15), 60.0, 44.0, 48.0],
            "presentation": 1,
            "presentation_rect": [float(px), 40.0, 50.0, 56.0],
            "parameter_enable": 1, **DIAL_COLORS,
            "saved_attribute_attributes": {
                "valueof": {
                    "parameter_longname": name, "parameter_shortname": name[:4],
                    "parameter_type": 0,
                    "parameter_mmin": min_v, "parameter_mmax": max_v,
                    "parameter_initial_enable": 1, "parameter_initial": [init],
                    "parameter_unitstyle": 1, "parameter_exponent": exponent,
                }
            }
        }
    }, int(430 + (px - 15)), 60)


dial_rate = make_dial("Rate", 15, 0.1, 20.0, 4.0, exponent=2.0)
dial_depth = make_dial("Depth", 75, 0.0, 1.0, 0.8)
dial_drive = make_dial("Drive", 135, 0.0, 1.0, 0.3)

# Connect dials to their targets
patch.connect(
    [dial_rate.outs[0], lfo.ins[0]],              # Rate → LFO frequency
    [dial_depth.outs[0], depth_scale.ins[1]],     # Depth → tremolo depth
    [dial_drive.outs[0], sig_drive.ins[0]],       # Drive → sig~
    [sig_drive.outs[0], drive_scale.ins[0]],      # sig~ → *~ 7.
    [drive_scale.outs[0], drive_offset.ins[0]],   # scaled → +~ 1.
)

# ============================================================
# OUTPUT
# ============================================================

patch.set_position(30, 550)
patch.place("comment === OUTPUT ===")[0]

patch.set_position(30, 585)
final_clip = patch.place("clip~ -1. 1.")[0]

patch.set_position(30, 625)
plugout = patch.place("plugout~")[0]

patch.connect(
    [makeup_gain.outs[0], final_clip.ins[0]],
    [final_clip.outs[0], plugout.ins[0]],     # mono → left
    [final_clip.outs[0], plugout.ins[1]],     # mono → right (mirrored)
)

# ============================================================
# SAVE (enable presentation mode)
# ============================================================

patcher_json = patch.get_json()
patcher_json["patcher"]["openinpresentation"] = 1

with open("/output/device.maxpat", "w") as f:
    json.dump(patcher_json, f, indent=2)
print("Saved: device.maxpat")

from amxd import save_amxd
save_amxd(patcher_json, "/output/device.amxd", device_type="audio_effect")
print("Saved: device.amxd")

print(f"Total objects: {patch.num_objs}")`;

const CODE_LINES = STATIC_CODE.split("\n");

/** Spinner → graph: quick. Code reveal after graph: slower (“actual build” on the page). */
const DEMO_RUN_MS = 650;
const DEMO_CODE_LINE_MS = 22;

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
  const [tipReady, setTipReady] = useState(false);
  const tipDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const codeLineIntervalRef = useRef<number | null>(null);

  const stopCodeLineReveal = useCallback(() => {
    if (codeLineIntervalRef.current !== null) {
      window.clearInterval(codeLineIntervalRef.current);
      codeLineIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCodeLineReveal(), [stopCodeLineReveal]);

  // Place the tip in the graph's bottom-right corner before paint (no top-left flash).
  useLayoutEffect(() => {
    if (phase !== "done" || !showGraphTip) return;
    if (!graphRef.current || !tipRef.current) return;

    const container = graphRef.current;
    const tip = tipRef.current;
    const MARGIN = 14;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;

    const x = Math.max(MARGIN, cw - tw - MARGIN);
    const y = Math.max(MARGIN, ch - th - MARGIN);
    setTipPos({ x, y });
    setTipReady(true);
  }, [phase, showGraphTip, graphCycle]);

  const dismissGraphTip = useCallback(() => {
    setShowGraphTip(false);
    setTipReady(false);
  }, []);

  const runDemo = useCallback(() => {
    if (phase !== "idle") return;
    stopCodeLineReveal();
    setVisibleCodeLines(0);
    setShowGraphTip(false);
    setPhase("running");
    window.setTimeout(() => {
      setGraphCycle((c) => c + 1);
      setPhase("done");
      // Seed value; bottom-right placement effect will run after render.
      setTipPos({ x: 18, y: 18 });
      setTipReady(false);
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
    setTipReady(false);
  }, [stopCodeLineReveal]);

  const codeShown = CODE_LINES.slice(0, visibleCodeLines).join("\n");
  const codeTyping = phase === "done" && !reducedMotion && visibleCodeLines < CODE_LINES.length;
  const demoGraph = useMemo(() => parsePythonDemoGraph(STATIC_CODE), []);
  const demoNodes: PatchNode[] = demoGraph.nodes;
  const demoEdges: PatchEdge[] = demoGraph.edges;

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
            rows={3}
            value={SAMPLE_PROMPT}
            aria-readonly="true"
            tabIndex={-1}
            style={{ pointerEvents: "none" }}
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
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 12h14M13 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2.8"
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
        <div className="auth-workflow-graph" ref={graphRef}>
          <div className="auth-workflow-panel-empty" aria-hidden={phase === "done"} />
          {phase === "done" && (
            <div className="auth-workflow-graph-live">
              <PatchGraph
                key={`auth-demo-${graphCycle}`}
                nodes={demoNodes}
                edges={demoEdges}
                animatedEdges
                onUserInteract={dismissGraphTip}
              />
            </div>
          )}

          {phase === "done" && showGraphTip && (
            <div
              className="auth-workflow-tip"
              ref={tipRef}
              style={{
                transform: tipReady ? `translate(${tipPos.x}px, ${tipPos.y}px)` : "translate(-9999px, -9999px)",
                opacity: tipReady ? 1 : 0,
              }}
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
          <a className="download-button" href="/templates/tremolo-w-overdrive.amxd" download>
            Download Ableton test device (.amxd)
          </a>
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
