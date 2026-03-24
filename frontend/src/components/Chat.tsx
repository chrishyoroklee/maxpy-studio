import { useState, useRef, useEffect } from "react";
import { getDownloadUrl } from "../api/client";
import type { ChatMessage } from "../hooks/useChat";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (prompt: string) => void;
  apiKeySet: boolean;
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
            <h2>MaxPy Studio</h2>
            <p>Describe an audio plugin and I'll generate it for Ableton Live.</p>
            <div className="suggestions">
              <button onClick={() => onSend("Make me a chorus effect with rate and depth knobs")}>
                Chorus effect
              </button>
              <button onClick={() => onSend("Create a tremolo with rate and depth controls")}>
                Tremolo
              </button>
              <button onClick={() => onSend("Build a simple 3-band EQ with low, mid, and high knobs")}>
                3-Band EQ
              </button>
              <button onClick={() => onSend("Make a lo-fi bitcrusher with crush and sample rate knobs")}>
                Bitcrusher
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-role">
              {msg.role === "user" ? "You" : "MaxPy Studio"}
            </div>
            <div className="message-content">
              {msg.content}
              {msg.error && (
                <div className="message-error">{msg.error}</div>
              )}
              {msg.generationId && (
                <a
                  href={getDownloadUrl(msg.generationId)}
                  className="download-button"
                  download
                >
                  Download .amxd
                </a>
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
