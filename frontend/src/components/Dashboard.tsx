import { useState } from "react";
import type { User } from "firebase/auth";

interface Props {
  user: User;
  onBack: () => void;
  onSignOut: () => void;
  onUpdateDisplayName: (name: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

export function Dashboard({ user, onBack, onSignOut, onUpdateDisplayName, onDeleteAccount }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user.displayName || "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleNameSave = async () => {
    if (newName.trim() && newName !== user.displayName) {
      await onUpdateDisplayName(newName.trim());
    }
    setEditingName(false);
  };

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
      <header className="header">
        <div className="header-left header-home" onClick={onBack}>
          <img src="/logo.webp" alt="" className="header-logo" />
          <h1>MaxPy Studio</h1>
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
