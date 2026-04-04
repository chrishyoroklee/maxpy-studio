import { useState } from "react";

interface PatchData {
  nodes: any[];
  edges: any[];
}

interface Props {
  code: string;
  patchData?: PatchData;
}

type Tab = "patch" | "code";

export function CodePatchTabs({ code, patchData }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("patch");

  return (
    <div className="code-patch-tabs">
      <div className="tabs-bar">
        <button
          className={`tab-button ${activeTab === "patch" ? "active" : ""}`}
          onClick={() => setActiveTab("patch")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          Code
        </button>
      </div>
      <div className="tab-content">
        {activeTab === "patch" && (
          <div className="patch-placeholder">
            <svg
              className="patch-placeholder-icon"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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
              {patchData
                ? "Patch visualization loading..."
                : "Patch visualization will appear here"}
            </span>
          </div>
        )}
        {activeTab === "code" && (
          <pre className="code-block">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
