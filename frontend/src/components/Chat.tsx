import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../hooks/useChat";
import { getDownloadUrl } from "../api/client";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (prompt: string) => void;
  apiKeySet: boolean;
  embedded?: boolean;
  apiKey?: string;
  setApiKey?: (key: string) => void;
  model?: string;
  setModel?: (model: string) => void;
}

const SUGGESTIONS = [
  { label: "Chorus", desc: "Stereo widening with rate & depth", prompt: "Make a chorus effect with rate and depth knobs" },
  { label: "Tremolo", desc: "Amplitude modulation with sync", prompt: "Create a tremolo with rate and depth controls" },
  { label: "3-Band EQ", desc: "Shape lows, mids & highs", prompt: "Build a 3-band EQ with low, mid, and high gain" },
  { label: "Bitcrusher", desc: "Lo-fi bit reduction & aliasing", prompt: "Make a bitcrusher with crush and sample rate controls" },
];

const MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Opus 4" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "4o Mini" },
];

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

export function Chat({ messages, isLoading, onSend, apiKeySet, embedded, apiKey, setApiKey, model, setModel }: Props) {
  const [input, setInput] = useState("");
  const [savedToDesktop, setSavedToDesktop] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset saved state when new messages arrive
  useEffect(() => {
    setSavedToDesktop(false);
  }, [messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // In embedded mode, first submission sets the API key
    if (embedded && !apiKeySet) {
      setApiKey?.(input.trim());
      setInput("");
      return;
    }

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
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  className="suggestion-card"
                  onClick={() => onSend(s.prompt)}
                >
                  <span className="suggestion-label">{s.label}</span>
                  <span className="suggestion-desc">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {embedded ? (
          <>
            {(() => {
              const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
              if (isLoading) return (
                <div className="embedded-status">
                  <div className="loading-bars"><span /><span /><span /></div>
                  <span className="embedded-status-text">Creating...</span>
                </div>
              );
              if (lastAssistant?.error) return (
                <div className="embedded-status">
                  <span style={{ color: "var(--error)" }}>Error: {lastAssistant.error}</span>
                </div>
              );
              if (lastAssistant?.amxdB64) return (
                <div className="embedded-status">
                  {savedToDesktop ? (
                    <span className="embedded-status-success">Saved to Desktop!</span>
                  ) : (
                    <>
                      <span className="embedded-status-success">Created!</span>
                      <button
                        className="download-button"
                        onClick={() => {
                          if (lastAssistant.generationId) {
                            // Open download URL — in jweb this opens system browser
                            window.open(getDownloadUrl(lastAssistant.generationId), "_blank");
                            setSavedToDesktop(true);
                          } else {
                            downloadAmxd(lastAssistant.amxdB64!, "device.amxd");
                          }
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Save to Desktop
                      </button>
                    </>
                  )}
                </div>
              );
              return null;
            })()}
          </>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.role}`}>
                <div className="message-role">
                  {msg.role === "user" ? "You" : "Studio"}
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
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download .amxd
                    </button>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="loading-indicator">
                <div className="loading-bars">
                  <span /><span /><span />
                </div>
                <span>Generating...</span>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <div className="input-wrapper">
          {embedded && apiKeySet && (
            <button
              type="button"
              className="key-reset"
              onClick={() => { setApiKey?.(""); }}
              title="Change API key"
            >
              Key
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={
              embedded
                ? (apiKeySet ? "Describe a plugin..." : "Paste your API key...")
                : (apiKeySet ? "Describe the plugin you want..." : "Enter your API key above first")
            }
            disabled={(!embedded && !apiKeySet) || isLoading}
            rows={1}
            className="chat-input"
          />
          {embedded && apiKeySet && (
            <select
              value={model ?? "claude-sonnet-4-20250514"}
              onChange={(e) => setModel?.(e.target.value)}
              className="model-select embedded-model-select"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          )}
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="send-button"
            aria-label="Generate"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
