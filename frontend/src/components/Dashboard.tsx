import { useState, useEffect } from "react";
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { downloadAmxd } from "../lib/storage";
import { downloadBlob } from "../lib/download";
import type { User } from "firebase/auth";

interface Props {
  user: User;
  onBack: () => void;
  onSignOut: () => void;
  onUpdateDisplayName: (name: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

interface Generation {
  id: string;
  promptId: string;
  llmResponse: string;
  extractedCode: string;
  status: "success" | "error";
  errorMessage?: string;
  amxdStoragePath?: string;
  createdAt: any;
}

interface Prompt {
  id: string;
  prompt: string;
  model: string;
  templateUsed?: string;
  createdAt: any;
}

export function Dashboard({ user, onBack, onSignOut, onUpdateDisplayName, onDeleteAccount }: Props) {
  const [generations, setGenerations] = useState<(Generation & { promptText?: string; templateUsed?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "success" | "error">("all");
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user.displayName || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<{ total: number; successful: number } | null>(null);

  useEffect(() => {
    loadHistory();
  }, [user.uid]);

  async function loadHistory() {
    setLoading(true);
    try {
      // Read user doc for stats
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserStats({
          total: data.totalGenerations || 0,
          successful: data.successfulGenerations || 0,
        });
      }

      // Load generations from user subcollection
      const genQuery = query(
        collection(db, "users", user.uid, "generations"),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const genSnapshot = await getDocs(genQuery);
      const gens = genSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Generation));

      // Load associated prompts from user subcollection
      const promptIds = [...new Set(gens.map(g => g.promptId).filter(Boolean))];
      const promptMap = new Map<string, Prompt>();

      // Fetch prompts in batches of 10 (Firestore 'in' limit)
      for (let i = 0; i < promptIds.length; i += 10) {
        const batch = promptIds.slice(i, i + 10);
        if (batch.length === 0) continue;
        const promptQuery = query(
          collection(db, "users", user.uid, "prompts"),
          where("__name__", "in", batch)
        );
        const promptSnapshot = await getDocs(promptQuery);
        promptSnapshot.docs.forEach(d => {
          promptMap.set(d.id, { id: d.id, ...d.data() } as Prompt);
        });
      }

      // Merge prompt text into generations
      const merged = gens.map(gen => {
        const prompt = promptMap.get(gen.promptId);
        return {
          ...gen,
          promptText: prompt?.prompt || "Unknown prompt",
          templateUsed: prompt?.templateUsed,
        };
      });

      setGenerations(merged);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  }

  const filteredGenerations = generations.filter(g => {
    if (filter === "all") return true;
    return g.status === filter;
  });

  const totalGenerations = userStats?.total ?? generations.length;
  const successCount = userStats?.successful ?? generations.filter(g => g.status === "success").length;
  const successRate = totalGenerations > 0 ? Math.round((successCount / totalGenerations) * 100) : 0;

  const handleNameSave = async () => {
    if (newName.trim() && newName !== user.displayName) {
      await onUpdateDisplayName(newName.trim());
    }
    setEditingName(false);
  };

  async function handleDownload(gen: Generation & { promptText?: string; templateUsed?: string }) {
    if (!gen.amxdStoragePath) {
      setDownloadError("This generation was created before storage upload was available.");
      setTimeout(() => setDownloadError(null), 4000);
      return;
    }
    setDownloadingId(gen.id);
    setDownloadError(null);
    try {
      const bytes = await downloadAmxd(gen.amxdStoragePath);
      downloadBlob(bytes, "device.amxd");
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
      setTimeout(() => setDownloadError(null), 4000);
    } finally {
      setDownloadingId(null);
    }
  }

  const handleDelete = async () => {
    if (confirmDelete) {
      await onDeleteAccount();
    } else {
      setConfirmDelete(true);
    }
  };

  const initial = (user.displayName || user.email || "?")[0].toUpperCase();
  const joinDate = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <img src="/logo.webp" alt="" className="header-logo" />
          <h1>MaxPyLang Studio</h1>
        </div>
        <button className="dashboard-back" onClick={onBack}>
          &#8592; Back to Studio
        </button>
      </header>

      <div className="dashboard-content">
        {/* Profile card */}
        <div className="dashboard-profile">
          <div className="dashboard-avatar-large">{initial}</div>
          <div className="dashboard-profile-info">
            <div className="dashboard-profile-name">{user.displayName || "User"}</div>
            <div className="dashboard-profile-email">{user.email}</div>
            {joinDate && <div className="dashboard-profile-joined">Joined {joinDate}</div>}
          </div>
          <button className="dashboard-signout" onClick={onSignOut}>Sign Out</button>
        </div>

        {/* Stats */}
        <div className="dashboard-stats">
          <div className="dashboard-stat">
            <div className="dashboard-stat-value">{totalGenerations}</div>
            <div className="dashboard-stat-label">Total Generations</div>
          </div>
          <div className="dashboard-stat">
            <div className="dashboard-stat-value" style={{ color: "#22c55e" }}>{successRate}%</div>
            <div className="dashboard-stat-label">Success Rate</div>
          </div>
          <div className="dashboard-stat">
            <div className="dashboard-stat-value" style={{ color: "#22c55e" }}>{successCount}</div>
            <div className="dashboard-stat-label">Successful</div>
          </div>
        </div>

        {downloadError && (
          <div className="dashboard-error-banner">{downloadError}</div>
        )}

        {/* History */}
        <div className="dashboard-section">
          <div className="dashboard-section-header">
            <h3>Generation History</h3>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "all" | "success" | "error")}
              className="dashboard-filter"
            >
              <option value="all">All</option>
              <option value="success">Successful</option>
              <option value="error">Failed</option>
            </select>
          </div>

          {loading ? (
            <div className="dashboard-loading">Loading history...</div>
          ) : filteredGenerations.length === 0 ? (
            <div className="dashboard-empty">
              {filter === "all" ? "No generations yet. Go build something!" : `No ${filter} generations.`}
            </div>
          ) : (
            <div className="dashboard-history">
              {filteredGenerations.map((gen) => (
                <div key={gen.id} className="dashboard-history-item">
                  <div className={`dashboard-status-dot ${gen.status}`} />
                  <div className="dashboard-history-info">
                    <div className="dashboard-history-prompt">{gen.promptText}</div>
                    <div className="dashboard-history-meta">
                      {gen.templateUsed ? `${gen.templateUsed} template` : "From scratch"}
                      {gen.createdAt?.toDate && (" · " + timeAgo(gen.createdAt.toDate()))}
                    </div>
                  </div>
                  {gen.status === "success" ? (
                    <button
                      className="dashboard-download"
                      disabled={downloadingId === gen.id}
                      onClick={() => handleDownload(gen)}
                    >
                      {downloadingId === gen.id ? "Downloading..." : "Download"}
                    </button>
                  ) : (
                    <span className="dashboard-failed">Failed</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Account Settings */}
        <div className="dashboard-section">
          <h3>Account Settings</h3>
          <div className="dashboard-settings">
            <div className="dashboard-setting">
              <div>
                <div className="dashboard-setting-label">Display Name</div>
                {editingName ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="dashboard-setting-input"
                      autoFocus
                    />
                    <button className="dashboard-setting-btn" onClick={handleNameSave}>Save</button>
                    <button className="dashboard-setting-btn" onClick={() => setEditingName(false)}>Cancel</button>
                  </div>
                ) : (
                  <div className="dashboard-setting-value">{user.displayName || "Not set"}</div>
                )}
              </div>
              {!editingName && (
                <button className="dashboard-setting-btn" onClick={() => { setEditingName(true); setNewName(user.displayName || ""); }}>
                  Edit
                </button>
              )}
            </div>
            <div className="dashboard-setting dashboard-setting-danger">
              <div>
                <div className="dashboard-setting-label" style={{ color: "#ef4444" }}>Delete Account</div>
                <div className="dashboard-setting-value">Permanently delete your account and all data</div>
              </div>
              <button
                className="dashboard-setting-btn dashboard-btn-danger"
                onClick={handleDelete}
              >
                {confirmDelete ? "Confirm Delete" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
