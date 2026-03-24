import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../hooks/useChat";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (prompt: string) => void;
  apiKeySet: boolean;
}

function downloadAmxd(b64: string, filename: string) {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Chat({ messages, isLoading, onSend, apiKeySet }: Props) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.length === 0 && (
          <div className="welcome">
            <h2>MaxPyLang Studio</h2>
            <p>Describe a plugin. Get an .amxd for Ableton.</p>
            <div className="suggestions">
              <button onClick={() => onSend("Make a chorus effect with rate and depth knobs")}>
                Chorus
              </button>
              <button onClick={() => onSend("Create a tremolo with rate and depth controls")}>
                Tremolo
              </button>
              <button onClick={() => onSend("Build a 3-band EQ with low, mid, and high gain")}>
                3-Band EQ
              </button>
              <button onClick={() => onSend("Make a bitcrusher with crush and sample rate controls")}>
                Bitcrusher
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-role">
              {msg.role === "user" ? "You" : "MaxPyLang Studio"}
            </div>
            <div className="message-content">
              {msg.content}
              {msg.error && (
                <div className="message-error">{msg.error}</div>
              )}
              {msg.amxdB64 && (
                <button
                  className="download-button"
                  onClick={() => downloadAmxd(msg.amxdB64!, "device.amxd")}
                >
                  Download .amxd
                </button>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="loading-indicator">Generating...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            apiKeySet
              ? "Describe the plugin you want..."
              : "Enter your API key above first"
          }
          disabled={!apiKeySet || isLoading}
          className="chat-input"
        />
        <button
          type="submit"
          disabled={!apiKeySet || isLoading || !input.trim()}
          className="send-button"
        >
          Generate
        </button>
      </form>
    </div>
  );
}
