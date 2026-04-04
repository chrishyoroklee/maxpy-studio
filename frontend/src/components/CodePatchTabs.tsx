import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { PatchGraph } from "./PatchGraph";
import type { PatchGraph as PatchGraphData } from "../lib/patchGraphParser";

interface Props {
  code: string;
  patchData?: PatchGraphData;
}

type Tab = "patch" | "code";

export function CodePatchTabs({ code, patchData }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("patch");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", handleKey);
    // Prevent body scroll when fullscreen
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  const hasPatch = patchData && patchData.nodes.length > 0;

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
              onClick={() => setFullscreen(true)}
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
        </div>
        <div className="tab-content">
          {activeTab === "patch" && (
            hasPatch ? (
              <div className="patch-graph-container" onClick={() => setFullscreen(true)} style={{ cursor: "pointer" }}>
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
            <pre className="code-block">
              <code>{code}</code>
            </pre>
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
          <PatchGraph nodes={patchData.nodes} edges={patchData.edges} />
        </div>,
        document.body
      )}
    </>
  );
}
