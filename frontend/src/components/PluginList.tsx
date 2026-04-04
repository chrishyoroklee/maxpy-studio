import { useState, useEffect } from "react";
import { loadPlugins, createPlugin, deletePlugin, type PluginDoc } from "../lib/firestore";

interface Props {
  onOpen: (pluginId: string) => void;
  defaultModel: string;
}

export function PluginList({ onOpen, defaultModel }: Props) {
  const [plugins, setPlugins] = useState<PluginDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadPlugins()
      .then(setPlugins)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    const name = newName.trim() || "Untitled Plugin";
    setCreating(true);
    try {
      const id = await createPlugin(name, defaultModel);
      if (id) {
        setShowCreateModal(false);
        setNewName("");
        onOpen(id);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (pluginId: string) => {
    await deletePlugin(pluginId);
    setPlugins((prev) => prev.filter((p) => p.id !== pluginId));
    setDeleteId(null);
  };

  return (
    <div className="plugin-list">
      <div className="plugin-list-header">
        <div>
          <h2 className="plugin-list-title">Your Plugins</h2>
          <p className="plugin-list-subtitle">Create and manage audio plugins</p>
        </div>
        <button className="plugin-create-btn" onClick={() => setShowCreateModal(true)}>
          + New Plugin
        </button>
      </div>

      {loading ? (
        <div className="plugin-list-loading">
          <div className="loading-bars"><span /><span /><span /></div>
        </div>
      ) : plugins.length === 0 ? (
        <div className="plugin-list-empty">
          <div className="plugin-list-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>
          <p>No plugins yet. Create your first one!</p>
          <button className="plugin-create-btn" onClick={() => setShowCreateModal(true)}>
            + New Plugin
          </button>
        </div>
      ) : (
        <div className="plugin-grid">
          {plugins.map((plugin) => (
            <div key={plugin.id} className="plugin-card" onClick={() => onOpen(plugin.id)}>
              <div className="plugin-card-header">
                <span className={`plugin-status ${plugin.status}`}>
                  {plugin.status === "ready" ? "Ready" : "Draft"}
                </span>
                <button
                  className="plugin-card-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteId(deleteId === plugin.id ? null : plugin.id);
                  }}
                >
                  {deleteId === plugin.id ? (
                    <span className="plugin-card-delete-confirm" onClick={(e) => { e.stopPropagation(); handleDelete(plugin.id); }}>
                      Confirm
                    </span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-2 14H7L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="plugin-card-name">{plugin.name}</div>
              <div className="plugin-card-meta">
                {plugin.templateUsed ? plugin.templateUsed.replace("m4l_", "").replace(/_/g, " ") : "From scratch"}
                {plugin.updatedAt?.toDate && (
                  <span> · {timeAgo(plugin.updatedAt.toDate())}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Plugin Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">New Plugin</h3>
            <p className="modal-subtitle">Give your audio plugin a name</p>
            <input
              type="text"
              className="modal-input"
              placeholder="e.g. Fat Bass Synth, Dreamy Reverb..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !creating) handleCreate(); }}
              autoFocus
            />
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => { setShowCreateModal(false); setNewName(""); }}>
                Cancel
              </button>
              <button className="modal-confirm" onClick={handleCreate} disabled={creating}>
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
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
