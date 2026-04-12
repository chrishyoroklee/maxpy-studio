import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PatchGraph } from "./PatchGraph";
import type { PatchGraph as PatchGraphData } from "../lib/patchGraphParser";
import type { ValidationIssue } from "../lib/patchValidator";
import { logEvent } from "../lib/firestore";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";

interface Props {
  code: string;
  patchData?: PatchGraphData;
  warnings?: ValidationIssue[];
}

type Tab = "patch" | "code";

export function CodePatchTabs({ code, patchData, warnings }: Props) {
  const [activeTab, setActiveTab] = useState<Tab | null>(null); // null = collapsed (button gate)
  const [fullscreen, setFullscreen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);

  const tabOpenTime = useRef<number | null>(null);

  const openTab = (tab: Tab) => {
    setActiveTab(tab);
    tabOpenTime.current = Date.now();
    logEvent("view_open", { view: tab });
  };

  const closeTabs = () => {
    if (tabOpenTime.current) {
      const duration = Date.now() - tabOpenTime.current;
      logEvent("view_close", {
        view: activeTab,
        durationMs: duration,
        wasGlance: duration < 3000,
      });
    }
    setActiveTab(null);
    tabOpenTime.current = null;
  };

  useEffect(() => {
    if (!fullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  // CodeMirror editor
  const cmContainerRef = useRef<HTMLDivElement>(null);
  const cmViewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (activeTab !== "code" || !cmContainerRef.current) return;

    // Destroy previous instance
    if (cmViewRef.current) {
      cmViewRef.current.destroy();
      cmViewRef.current = null;
    }

    const state = EditorState.create({
      doc: code,
      extensions: [
        python(),
        oneDark,
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
        EditorView.lineWrapping,
      ],
    });

    cmViewRef.current = new EditorView({
      state,
      parent: cmContainerRef.current,
    });

    return () => {
      cmViewRef.current?.destroy();
      cmViewRef.current = null;
    };
  }, [activeTab, code]);

  const hasPatch = patchData && patchData.nodes.length > 0;

  const errorCount = warnings?.filter((w) => w.severity === "error").length ?? 0;
  const warningCount = warnings?.filter((w) => w.severity === "warning").length ?? 0;
  const infoCount = warnings?.filter((w) => w.severity === "info").length ?? 0;

  const summaryParts: string[] = [];
  if (errorCount > 0) summaryParts.push(`${errorCount} error${errorCount > 1 ? "s" : ""}`);
  if (warningCount > 0) summaryParts.push(`${warningCount} warning${warningCount > 1 ? "s" : ""}`);
  if (infoCount > 0) summaryParts.push(`${infoCount} info`);
  const summaryText = summaryParts.join(", ");

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "error": return "\u2716";
      case "warning": return "\u26A0";
      default: return "\u2139";
    }
  };

  // Collapsed state: show two big buttons as a gate
  if (activeTab === null) {
    return (
      <div className="view-gate">
        <button className="view-gate-button" onClick={() => openTab("patch")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          <span>View Patch Graph</span>
        </button>
        <button className="view-gate-button" onClick={() => openTab("code")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <span>View Python Code</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="code-patch-tabs">
        <div className="tabs-bar">
          <button
            className={`tab-button ${activeTab === "patch" ? "active" : ""}`}
            onClick={() => setActiveTab("patch")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            Patch
          </button>
          <button
            className={`tab-button ${activeTab === "code" ? "active" : ""}`}
            onClick={() => setActiveTab("code")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            Code
          </button>
          {activeTab === "patch" && hasPatch && (
            <button
              className="tab-button tab-expand"
              onClick={() => { setFullscreen(true); logEvent("graph_fullscreen_open"); }}
              title="Expand to fullscreen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}
          <button
            className="tab-button tab-close"
            onClick={closeTabs}
            title="Hide"
            aria-label="Hide patch and code views"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="tab-content">
          {activeTab === "patch" && warnings && warnings.length > 0 && (
            <div className="validation-panel">
              <button
                className="validation-summary"
                onClick={() => setValidationOpen((o) => !o)}
              >
                <span className={`validation-summary-icon${errorCount > 0 ? " validation-issue--error" : " validation-issue--warning"}`}>
                  {errorCount > 0 ? "\u2716" : "\u26A0"}
                </span>
                <span>{summaryText}</span>
                <span className="validation-chevron">{validationOpen ? "\u25B2" : "\u25BC"}</span>
              </button>
              {validationOpen && (
                <ul className="validation-list">
                  {warnings.map((issue, i) => (
                    <li key={i} className={`validation-issue validation-issue--${issue.severity}`}>
                      <span className="validation-issue-icon">{severityIcon(issue.severity)}</span>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {activeTab === "patch" && (
            hasPatch ? (
              <div className="patch-graph-container" onClick={() => { setFullscreen(true); logEvent("graph_fullscreen_open"); }} style={{ cursor: "pointer" }}>
                <PatchGraph nodes={patchData.nodes} edges={patchData.edges} />
              </div>
            ) : (
              <div className="patch-placeholder">
                <svg className="patch-placeholder-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="2" />
                  <circle cx="18" cy="6" r="2" />
                  <circle cx="6" cy="18" r="2" />
                  <circle cx="18" cy="18" r="2" />
                  <path d="M8 6h8" />
                  <path d="M6 8v8" />
                  <path d="M18 8v8" />
                  <path d="M8 18h8" />
                </svg>
                <span className="patch-placeholder-text">
                  Patch visualization will appear here
                </span>
              </div>
            )
          )}
          {activeTab === "code" && (
            <div className="code-block-cm" ref={cmContainerRef} />
          )}
        </div>
      </div>

      {fullscreen && hasPatch && createPortal(
        <div className="patch-fullscreen-overlay">
          <button className="patch-fullscreen-close" onClick={() => setFullscreen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <PatchGraph key="fullscreen" nodes={patchData.nodes} edges={patchData.edges} />
        </div>,
        document.body
      )}
    </>
  );
}
