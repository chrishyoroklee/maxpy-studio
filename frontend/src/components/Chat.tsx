import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../hooks/useChat";
import { getDownloadUrl } from "../api/client";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (prompt: string) => void;
  apiKeySet: boolean;
  embedded?: boolean;
  setApiKey?: (key: string) => void;
  model?: string;
  setModel?: (model: string) => void;
}

const SUGGESTIONS = [
  {
    label: "Chorus",
    desc: "Stereo widening with rate & depth",
    prompt: "Build a chorus audio effect. Use tapin~ 50 and tapout~ for a short delay line. Modulate the delay time with cycle~ LFO (Rate: 0.1–5 Hz via live.dial, default 0.5) scaled by Depth live.dial (0–5 ms, default 2). Mix dry + wet with +~ and normalize with *~ 0.5. Use plugin~ for stereo input (sum to mono with +~ and *~ 0.5), clip~ -1. 1. before plugout~.",
  },
  {
    label: "Tremolo",
    desc: "Amplitude modulation",
    prompt: "Build a tremolo audio effect. Use cycle~ as LFO, scale its output with *~ from Depth live.dial (0–1, default 0.5), offset with +~ so it ranges from (1-depth) to 1. Multiply the input signal by this LFO envelope using *~. Rate live.dial controls LFO frequency (0.1–20 Hz, default 4). Use plugin~ for stereo input (sum to mono), clip~ -1. 1. before plugout~.",
  },
  {
    label: "3-Band EQ",
    desc: "Shape lows, mids & highs",
    prompt: "Build a 3-band EQ audio effect. Split plugin~ input into 3 bands using lores~ filters: Low band (lores~ at 200 Hz), Mid band (subtract low from lores~ at 3000 Hz), High band (subtract mid+low from dry). Each band gets a gain *~ controlled by a live.dial (0–2, default 1). Sum all 3 bands with +~. clip~ -1. 1. before plugout~.",
  },
  {
    label: "Bitcrusher",
    desc: "Lo-fi bit reduction & aliasing",
    prompt: "Build a bitcrusher audio effect. Use degrade~ to reduce bit depth and sample rate. Bits live.dial (1–24, default 16) controls bit depth via degrade~ inlet 2. Rate live.dial (0.01–1, default 1) controls sample rate divisor via degrade~ inlet 1. Mix dry/wet using sig~ and *~ math: out = dry*(1-mix) + wet*mix, controlled by Mix live.dial (0–1, default 0.5). Use plugin~ input, clip~ -1. 1. before plugout~.",
  },
  {
    label: "Reverb",
    desc: "Room simulation with decay",
    prompt: "Build a reverb audio effect. Create 4 parallel delay lines using tapin~ 5000 and tapout~ at prime-number times (23, 37, 53, 71 ms). Feed each tapout~ back through *~ 0.6 into the tapin~ input summer (+~). Sum all 4 tapout~ outputs with +~ and scale with *~ 0.25. Mix dry/wet with sig~ math: out = dry*(1-mix) + wet*mix. Decay live.dial (0.1–0.9, default 0.5) controls feedback gain. Mix live.dial (0–1, default 0.3). Use plugin~ input (sum to mono), clip~ -1. 1. before plugout~.",
  },
  {
    label: "Delay",
    desc: "Stereo echo with feedback",
    prompt: "Build a stereo delay audio effect. Use tapin~ 2000 and tapout~ for a single delay line. Time live.dial (10–1000 ms, default 300) sets tapout~ delay time via snapshot~ from sig~. Feedback live.dial (0–0.9, default 0.4) scales the tapout~ output with *~ and feeds it back to tapin~ input via +~. Mix live.dial (0–1, default 0.3) blends dry/wet using sig~ and *~ math. Use plugin~ input (sum to mono), clip~ -1. 1. before plugout~.",
  },
  {
    label: "Distortion",
    desc: "Overdrive & saturation",
    prompt: "Build a distortion audio effect. Multiply the plugin~ input by a Drive gain using *~ controlled by Drive live.dial (1–50, default 5). Then use clip~ -1. 1. to hard-clip the boosted signal for saturation. Optionally filter the clipped signal through lores~ at a Tone frequency controlled by Tone live.dial (500–15000 Hz, default 5000) to tame harshness. Mix dry/wet with sig~ math. Mix live.dial (0–1, default 0.7). Use plugin~ input (sum to mono), final clip~ -1. 1. before plugout~.",
  },
  {
    label: "Pitch Shift",
    desc: "Transpose up or down",
    prompt: "Build a pitch shifter audio effect. Write the plugin~ input into a buffer~ using record~. Read it back with play~ at a different speed controlled by Shift live.dial (-12 to 12 semitones, default 0). Convert semitones to playback rate with expr pow(2, $f1/12). Use sig~ to convert the rate to signal for play~. Mix the pitch-shifted signal with the dry using *~ and +~, controlled by Mix live.dial (0–1, default 0.5). clip~ -1. 1. before plugout~.",
  },
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

export function Chat({ messages, isLoading, onSend, apiKeySet, embedded, setApiKey, model, setModel }: Props) {
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
                    <span className="embedded-status-success">Link copied! Paste in browser.</span>
                  ) : (
                    <>
                      <span className="embedded-status-success">Created!</span>
                      <button
                        className="download-button"
                        onClick={() => {
                          if (lastAssistant.generationId) {
                            const url = getDownloadUrl(lastAssistant.generationId);
                            navigator.clipboard.writeText(url).then(() => {
                              setSavedToDesktop(true);
                            });
                          } else {
                            downloadAmxd(lastAssistant.amxdB64!, "device.amxd");
                          }
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                        Copy Link
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
