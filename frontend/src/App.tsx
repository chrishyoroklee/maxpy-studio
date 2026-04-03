import { AuthScreen } from "./components/AuthScreen";
import { Chat } from "./components/Chat";
import { Dashboard } from "./components/Dashboard";
import { useAuth } from "./hooks/useAuth";
import { useChat } from "./hooks/useChat";
import { useEmbedded } from "./hooks/useEmbedded";
import { usePyodide } from "./hooks/usePyodide";
import { useState } from "react";
import "./App.css";

function App() {
  const embedded = useEmbedded();
  const { user, loading: authLoading, signIn, signUp, signInWithGoogle, logout, resetPassword, updateDisplayName, deleteAccount } = useAuth();
  const { ready, loading: pyodideLoading, error: pyodideError, runCode } = usePyodide();
  const { messages, isLoading, sendMessage } = useChat(runCode);
  const [view, setView] = useState<"studio" | "dashboard">("studio");

  const [model, setModel] = useState(
    () => sessionStorage.getItem("maxpy-model") ?? "claude-sonnet-4-20250514"
  );

  const handleModelChange = (m: string) => {
    setModel(m);
    sessionStorage.setItem("maxpy-model", m);
  };

  const handleSend = (prompt: string, template?: string) => {
    sendMessage(prompt, model, template);
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

  // Dashboard view
  if (view === "dashboard" && user) {
    return (
      <div className="app">
        <Dashboard
          user={user}
          onBack={() => setView("studio")}
          onSignOut={logout}
          onUpdateDisplayName={updateDisplayName}
          onDeleteAccount={deleteAccount}
        />
      </div>
    );
  }

  const initial = user ? (user.displayName || user.email || "?")[0].toUpperCase() : "";

  // Studio view
  return (
    <div className={`app ${embedded ? "embedded" : ""}`}>
      {!embedded && (
        <header className="header">
          <div className="header-left">
            <img src="/logo.webp" alt="" className="header-logo" />
            <h1>MaxPyLang Studio</h1>
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
              <button
                className="header-avatar"
                onClick={() => setView("dashboard")}
                title="Dashboard"
              >
                {initial}
              </button>
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
        />
      </main>
    </div>
  );
}

export default App;
