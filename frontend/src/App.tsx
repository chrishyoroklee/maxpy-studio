import { ApiKeyInput } from "./components/ApiKeyInput";
import { Chat } from "./components/Chat";
import { useApiKey } from "./hooks/useApiKey";
import { useChat } from "./hooks/useChat";
import { useEmbedded } from "./hooks/useEmbedded";
import "./App.css";

function App() {
  const { apiKey, setApiKey, model, setModel } = useApiKey();
  const { messages, isLoading, sendMessage } = useChat();
  const embedded = useEmbedded();

  const handleSend = (prompt: string, template?: string) => {
    if (!apiKey) return;
    sendMessage(prompt, apiKey, model, template);
  };

  return (
    <div className={`app ${embedded ? "embedded" : ""}`}>
      {!embedded && (
        <header className="header">
          <div className="header-left">
            <img src="/logo.webp" alt="" className="header-logo" />
            <h1>MaxPyLang Studio</h1>
          </div>
          <ApiKeyInput
            apiKey={apiKey}
            setApiKey={setApiKey}
            model={model}
            setModel={setModel}
          />
        </header>
      )}
      <main className="main">
        <Chat
          messages={messages}
          isLoading={isLoading}
          onSend={handleSend}
          apiKeySet={!!apiKey}
          embedded={embedded}
          setApiKey={setApiKey}
          model={model}
          setModel={setModel}
        />
      </main>
    </div>
  );
}

export default App;
