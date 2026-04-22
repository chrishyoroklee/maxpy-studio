import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { ReauthRequiredError } from "../hooks/useAuth";

interface Props {
  user: User;
  onBack: () => void;
  onSignOut: () => void;
  onUpdateDisplayName: (name: string) => Promise<void>;
  onDeleteAccount: (password?: string) => Promise<void>;
}

export function Dashboard({ user, onBack, onSignOut, onUpdateDisplayName, onDeleteAccount }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user.displayName || "");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleNameSave = async () => {
    if (newName.trim() && newName !== user.displayName) {
      await onUpdateDisplayName(newName.trim());
    }
    setEditingName(false);
  };

  const initial = (user.displayName || user.email || "?")[0].toUpperCase();
  const joinDate = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";

  return (
    <div className="dashboard">
      <header className="header">
        <div className="header-left header-home" onClick={onBack}>
          <img src="/logo.webp" alt="" className="header-logo" />
          <h1>MaxPy Studio</h1>
          <span className="beta-badge">beta</span>
        </div>
        <button className="header-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>My Plugins</span>
        </button>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-profile">
          <div className="dashboard-avatar-large">{initial}</div>
          <div className="dashboard-profile-info">
            <div className="dashboard-profile-name">{user.displayName || "User"}</div>
            <div className="dashboard-profile-email">{user.email}</div>
            {joinDate && <div className="dashboard-profile-joined">Joined {joinDate}</div>}
          </div>
          <button className="dashboard-signout" onClick={onSignOut}>Sign Out</button>
        </div>

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
                <div className="dashboard-setting-label" style={{ color: "var(--error)" }}>Delete Account</div>
                <div className="dashboard-setting-value">Permanently delete your account and all data</div>
              </div>
              <button
                className="dashboard-setting-btn dashboard-btn-danger"
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {deleteOpen && (
        <DeleteAccountModal
          user={user}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={onDeleteAccount}
        />
      )}
    </div>
  );
}

function DeleteAccountModal({
  user,
  onCancel,
  onConfirm,
}: {
  user: User;
  onCancel: () => void;
  onConfirm: (password?: string) => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerId = user.providerData[0]?.providerId;
  const emailMatches = user.email
    ? typed.trim().toLowerCase() === user.email.toLowerCase()
    : false;
  const canDelete = emailMatches && !busy && (!needsPassword || password.length > 0);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [busy, onCancel]);

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(needsPassword ? password : undefined);
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        if (err.providerId === "password") {
          setNeedsPassword(true);
          setError("Please enter your password to confirm.");
        } else {
          setError("Please sign out and sign in again, then retry.");
        }
      } else {
        const code = (err as { code?: string }).code;
        if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
          setError("Incorrect password.");
        } else {
          setError((err as Error).message || "Something went wrong. Please try again.");
        }
      }
      setBusy(false);
    }
  };

  return (
    <div className="delete-modal-backdrop" onClick={() => !busy && onCancel()}>
      <div
        className="delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-modal-title" className="delete-modal-title">Delete account</h2>
        <p className="delete-modal-body">
          This will permanently delete your account and all associated data:
        </p>
        <ul className="delete-modal-list">
          <li>All plugins and their conversation history</li>
          <li>Generated .amxd files</li>
          <li>Prompt and generation records</li>
          <li>Usage event logs</li>
          <li>Your account profile</li>
        </ul>
        <p className="delete-modal-body delete-modal-warn">
          This action cannot be undone.
        </p>

        <label className="delete-modal-label">
          Type your email <code>{user.email}</code> to confirm:
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="delete-modal-input"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </label>

        {needsPassword && providerId === "password" && (
          <label className="delete-modal-label">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="delete-modal-input"
              autoComplete="current-password"
              disabled={busy}
            />
          </label>
        )}

        {error && <div className="delete-modal-error">{error}</div>}

        <div className="delete-modal-actions">
          <button
            type="button"
            className="delete-modal-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="delete-modal-confirm"
            onClick={handleDelete}
            disabled={!canDelete}
          >
            {busy ? "Deleting..." : "Delete my account"}
          </button>
        </div>
      </div>
    </div>
  );
}
