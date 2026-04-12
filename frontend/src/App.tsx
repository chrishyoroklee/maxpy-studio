import { AuthScreen } from "./components/AuthScreen";
import { Chat } from "./components/Chat";
import { Dashboard } from "./components/Dashboard";
import { PluginList } from "./components/PluginList";
import { useAuth } from "./hooks/useAuth";
import { useChat } from "./hooks/useChat";
import { useEmbedded } from "./hooks/useEmbedded";
import { usePyodide } from "./hooks/usePyodide";
import { logEvent } from "./lib/firestore";
import { useState, useRef, useEffect } from "react";
import "./App.css";

type View = "plugins" | "workspace" | "settings";

function App() {
  const embedded = useEmbedded();
  const { user, loading: authLoading, signIn, signUp, signInWithGoogle, logout, resetPassword, resendVerification, refreshUser, updateDisplayName, deleteAccount } = useAuth();
  const { ready, loading: pyodideLoading, error: pyodideError, runCode } = usePyodide();

  useEffect(() => {
    logEvent("session_start");
  }, []);

  const [view, setView] = useState<View>("plugins");
  const [activePluginId, setActivePluginId] = useState<string | null>(null);
  const [activePluginName, setActivePluginName] = useState<string>("");

  const { messages, isLoading, sendMessage, buildTemplate, clearMessages } = useChat(runCode, activePluginId);

  const [model, setModel] = useState(
    () => sessionStorage.getItem("maxpy-model") ?? "anthropic/claude-sonnet-4"
  );
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  const handleModelChange = (m: string) => {
    setModel(m);
    sessionStorage.setItem("maxpy-model", m);
  };

  const handleSend = (prompt: string) => {
    sendMessage(prompt, model);
  };

  const handleTemplateBuild = (templateName: string, templateLabel: string) => {
    buildTemplate(templateName, templateLabel, model);
  };

  const openPlugin = (pluginId: string, pluginName?: string) => {
    setActivePluginId(pluginId);
    setActivePluginName(pluginName || "");
    setView("workspace");
  };

  const backToPlugins = () => {
    setActivePluginId(null);
    setActivePluginName("");
    clearMessages();
    setView("plugins");
  };

  // Auth loading
  if (authLoading) {
    return (
      <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="loading-bars"><span /><span /><span /></div>
      </div>
    );
  }

  // Not signed in — show auth screen (skip for embedded mode)
  if (!user && !embedded) {
    return (
      <div className="app">
        <AuthScreen
          signIn={signIn}
          signUp={signUp}
          signInWithGoogle={signInWithGoogle}
          resetPassword={resetPassword}
        />
      </div>
    );
  }

  // Email not verified — show verification screen (Google users are auto-verified)
  // Skip verification gate in local dev (emulator doesn't send real emails)
  if (!import.meta.env.DEV && user && !user.emailVerified && user.providerData[0]?.providerId === "password" && !embedded) {
    return (
      <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="verify-email-card">
          <h2>Check your email</h2>
          <p>We sent a verification link to <strong>{user.email}</strong>. Click the link to activate your account.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button className="modal-confirm" onClick={refreshUser}>
              I've verified
            </button>
            <button className="modal-cancel" onClick={() => resendVerification()}>
              Resend email
            </button>
          </div>
          <button style={{ marginTop: 16, background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13 }} onClick={logout}>
            Use a different account
          </button>
        </div>
      </div>
    );
  }

  // Settings view (profile, stats, account)
  if (view === "settings" && user) {
    return (
      <div className="app">
        <Dashboard
          user={user}
          onBack={backToPlugins}
          onSignOut={logout}
          onUpdateDisplayName={updateDisplayName}
          onDeleteAccount={deleteAccount}
        />
      </div>
    );
  }

  const initial = user ? (user.displayName || user.email || "?")[0].toUpperCase() : "";

  // Plugin list view (home)
  if (view === "plugins" && !embedded) {
    return (
      <div className="app">
        <header className="header">
          <div className="header-left header-home" onClick={backToPlugins}>
            <img src="/logo.webp" alt="" className="header-logo" />
            <h1>MaxPy Studio</h1>
            <span className="beta-badge">beta</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {user && (
              <div className="header-avatar-wrapper" ref={menuRef}>
                <button className="header-avatar" onClick={() => setShowMenu(!showMenu)}>
                  {initial}
                </button>
                {showMenu && (
                  <div className="header-dropdown">
                    <button onClick={() => { setView("settings"); setShowMenu(false); }}>Settings</button>
                    <button onClick={() => { logout(); setShowMenu(false); }}>Sign Out</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
        <main className="main">
          {pyodideLoading && (
            <div className="pyodide-loading">
              <div className="loading-bars"><span /><span /><span /></div>
              <span>Loading Python runtime...</span>
            </div>
          )}
          <PluginList onOpen={openPlugin} defaultModel={model} />
        </main>
      </div>
    );
  }

  // Workspace view (chat scoped to a plugin)
  return (
    <div className={`app ${embedded ? "embedded" : ""}`}>
      {!embedded && (
        <header className="header">
          <div className="header-left">
            <button className="header-back" onClick={backToPlugins} title="Back to plugins">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>My Plugins</span>
            </button>
            <img src="/logo.webp" alt="" className="header-logo" />
            <h1>MaxPy Studio</h1>
            {activePluginName && (
              <>
                <span className="header-separator">/</span>
                <span className="header-plugin-name">{activePluginName}</span>
              </>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {user && (
              <div className="header-avatar-wrapper" ref={menuRef}>
                <button className="header-avatar" onClick={() => setShowMenu(!showMenu)}>
                  {initial}
                </button>
                {showMenu && (
                  <div className="header-dropdown">
                    <button onClick={() => { setView("plugins"); setShowMenu(false); }}>My Plugins</button>
                    <button onClick={() => { setView("settings"); setShowMenu(false); }}>Settings</button>
                    <button onClick={() => { logout(); setShowMenu(false); }}>Sign Out</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
      )}
      <main className="main">
        {pyodideLoading && (
          <div className="pyodide-loading">
            <div className="loading-bars"><span /><span /><span /></div>
            <span>Loading Python runtime...</span>
          </div>
        )}
        {pyodideError && (
          <div className="pyodide-error">
            Failed to load Python runtime: {pyodideError}
          </div>
        )}
        <Chat
          messages={messages}
          isLoading={isLoading}
          onSend={handleSend}
          onTemplateBuild={handleTemplateBuild}
          pyodideReady={ready}
          embedded={embedded}
          model={model}
          setModel={handleModelChange}
          pluginId={activePluginId}
          pluginName={activePluginName}
        />
      </main>
    </div>
  );
}

export default App;
