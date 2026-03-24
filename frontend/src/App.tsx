import { ApiKeyInput } from "./components/ApiKeyInput";
import { Chat } from "./components/Chat";
import { useApiKey } from "./hooks/useApiKey";
import { useChat } from "./hooks/useChat";
import "./App.css";

function App() {
  const { apiKey, setApiKey, model, setModel } = useApiKey();
  const { messages, isLoading, sendMessage } = useChat();

  const handleSend = (prompt: string) => {
    if (!apiKey) return;
    sendMessage(prompt, apiKey, model);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>MaxPy Studio</h1>
          <span className="header-tagline">AI-powered Max for Live plugin generator</span>
        </div>
        <ApiKeyInput
          apiKey={apiKey}
          setApiKey={setApiKey}
          model={model}
          setModel={setModel}
        />
      </header>
      <main className="main">
        <Chat
          messages={messages}
          isLoading={isLoading}
          onSend={handleSend}
          apiKeySet={!!apiKey}
        />
      </main>
    </div>
  );
}

export default App;
