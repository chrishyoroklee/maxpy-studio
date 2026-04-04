import { AuthScreen } from "./components/AuthScreen";
import { Chat } from "./components/Chat";
import { Dashboard } from "./components/Dashboard";
import { PluginList } from "./components/PluginList";
import { useAuth } from "./hooks/useAuth";
import { useChat } from "./hooks/useChat";
import { useEmbedded } from "./hooks/useEmbedded";
import { usePyodide } from "./hooks/usePyodide";
import { useState, useRef, useEffect } from "react";
import "./App.css";

type View = "plugins" | "workspace" | "settings";

function App() {
  const embedded = useEmbedded();
  const { user, loading: authLoading, signIn, signUp, signInWithGoogle, logout, resetPassword, updateDisplayName, deleteAccount } = useAuth();
  const { ready, loading: pyodideLoading, error: pyodideError, runCode } = usePyodide();

  const [view, setView] = useState<View>("plugins");
  const [activePluginId, setActivePluginId] = useState<string | null>(null);

  const { messages, isLoading, sendMessage, clearMessages } = useChat(runCode, activePluginId);

  const [model, setModel] = useState(
    () => sessionStorage.getItem("maxpy-model") ?? "claude-sonnet-4-20250514"
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

  const handleSend = (prompt: string, template?: string) => {
    sendMessage(prompt, model, template);
  };

  const openPlugin = (pluginId: string) => {
    setActivePluginId(pluginId);
    setView("workspace");
  };

  const backToPlugins = () => {
    setActivePluginId(null);
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
          <div className="header-left">
            <img src="/logo.webp" alt="" className="header-logo" />
            <h1>MaxPy Studio</h1>
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
            <button className="header-back" onClick={backToPlugins}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <img src="/logo.webp" alt="" className="header-logo" />
            <h1>MaxPy Studio</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="model-select"
            >
              <option value="claude-sonnet-4-20250514">Sonnet 4</option>
              <option value="claude-opus-4-20250514">Opus 4</option>
            </select>
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
          pyodideReady={ready}
          embedded={embedded}
          model={model}
          setModel={handleModelChange}
          runCode={runCode}
          pluginId={activePluginId}
        />
      </main>
    </div>
  );
}

export default App;
