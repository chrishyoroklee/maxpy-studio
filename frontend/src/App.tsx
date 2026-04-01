import { Chat } from "./components/Chat";
import { Onboarding } from "./components/Onboarding";
import { useChat } from "./hooks/useChat";
import { useEmbedded } from "./hooks/useEmbedded";
import { usePyodide } from "./hooks/usePyodide";
import { useState } from "react";
import "./App.css";

function App() {
  const embedded = useEmbedded();
  const { ready, loading, error: pyodideError, runCode } = usePyodide();
  const { messages, isLoading, sendMessage } = useChat(runCode);
  const [onboarded, setOnboarded] = useState(() => {
    return embedded || sessionStorage.getItem("maxpy-onboarded") === "true";
  });

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

  const handleOnboarded = () => {
    setOnboarded(true);
    sessionStorage.setItem("maxpy-onboarded", "true");
  };

  if (!onboarded) {
    return (
      <div className="app">
        <Onboarding onComplete={handleOnboarded} />
      </div>
    );
  }

  return (
    <div className={`app ${embedded ? "embedded" : ""}`}>
      {!embedded && (
        <header className="header">
          <div className="header-left">
            <img src="/logo.webp" alt="" className="header-logo" />
            <h1>MaxPyLang Studio</h1>
          </div>
          <select
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            className="model-select"
          >
            <option value="claude-sonnet-4-20250514">Sonnet 4</option>
            <option value="claude-opus-4-20250514">Opus 4</option>
          </select>
        </header>
      )}
      <main className="main">
        {loading && (
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
