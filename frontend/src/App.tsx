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
          <img src="/favicon.svg" alt="" className="header-logo" />
          <h1>MaxPyLang Studio</h1>
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
