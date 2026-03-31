import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../hooks/useChat";
import { getDownloadUrl, buildTemplate } from "../api/client";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (prompt: string, template?: string) => void;
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
    prompt: "Add a feedback knob and make the color blue",
    template: "m4l_chorus",
  },
  {
    label: "Tremolo",
    desc: "Amplitude modulation",
    prompt: "Add a waveform selector (sine/square) and make the color green",
    template: "m4l_tremolo",
  },
  {
    label: "3-Band EQ",
    desc: "Shape lows, mids & highs",
    prompt: "Add a Q control for each band",
    template: "m4l_eq",
  },
  {
    label: "Lo-Fi",
    desc: "Bit reduction & aliasing",
    prompt: "Add a wet/dry mix knob",
    template: "m4l_lofi",
  },
  {
    label: "Reverb",
    desc: "Room simulation with decay",
    prompt: "Add a pre-delay knob and make the color purple",
    template: "m4l_reverb",
  },
  {
    label: "Delay",
    desc: "Stereo echo with feedback",
    prompt: "Add ping-pong stereo and a filter in the feedback loop",
    template: "m4l_stereo_delay",
  },
  {
    label: "Distortion",
    desc: "Overdrive & saturation",
    prompt: "Add a second distortion stage and make the color orange",
    template: "m4l_distortion",
  },
  {
    label: "Compressor",
    desc: "Bus glue & dynamics",
    prompt: "Add a ratio control and sidechain input",
    template: "m4l_compressor",
  },
  // --- Instruments (device_type="instrument") ---
  {
    label: "Mono Synth",
    desc: "Classic subtractive mono",
    prompt: "Add a filter envelope and a second oscillator (detuned saw)",
    template: "m4l_mono_synth",
  },
  {
    label: "Bass Synth",
    desc: "Moog-style sub bass",
    prompt: "Add a second saw oscillator detuned by 7 cents",
    template: "m4l_bass_synth",
  },
];

const MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Opus 4" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "4o Mini" },
  { value: "gemini/gemini-2.5-pro-preview-06-05", label: "Gemini 2.5 Pro" },
  { value: "gemini/gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
  { value: "deepseek/deepseek-chat", label: "DeepSeek V3" },
  { value: "mistral/mistral-large-latest", label: "Mistral Large" },
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

interface TemplateBuild {
  status: "building" | "done" | "error";
  templateName: string;
  amxdB64?: string;
  generationId?: string;
  error?: string;
}

export function Chat({ messages, isLoading, onSend, apiKeySet, embedded, setApiKey, model, setModel }: Props) {
  const [input, setInput] = useState("");
  const [savedToDesktop, setSavedToDesktop] = useState(false);
  const [templateBuild, setTemplateBuild] = useState<TemplateBuild | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset saved state when new messages arrive
  useEffect(() => {
    setSavedToDesktop(false);
  }, [messages.length]);

  const [customizeInput, setCustomizeInput] = useState("");

  const handleTemplateBuild = async (templateName: string) => {
    setTemplateBuild({ status: "building", templateName });
    try {
      const result = await buildTemplate(templateName);
      setTemplateBuild({ status: "done", templateName, amxdB64: result.amxd_b64, generationId: result.generation_id });
    } catch (err) {
      setTemplateBuild({ status: "error", templateName, error: err instanceof Error ? err.message : "Build failed" });
    }
  };

  const handleCustomize = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customizeInput.trim() || !templateBuild) return;
    onSend(customizeInput.trim(), templateBuild.templateName);
    setCustomizeInput("");
    setTemplateBuild(null);
  };

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
        {messages.length === 0 && !templateBuild && (
          <div className="welcome">
            <h2>MaxPyLang Studio</h2>
            <p>Describe a plugin. Get an .amxd for Ableton.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  className="suggestion-card"
                  onClick={() => {
                    const tmpl = (s as any).template as string | undefined;
                    if (tmpl) {
                      handleTemplateBuild(tmpl);
                    } else {
                      onSend(s.prompt);
                    }
                  }}
                >
                  <span className="suggestion-label">{s.label}</span>
                  <span className="suggestion-desc">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {templateBuild && (
          <div className={embedded ? "embedded-status" : "message assistant"}>
            {templateBuild.status === "building" && (
              <div className={embedded ? "" : "message-content"}>
                <div className="loading-indicator">
                  <div className="loading-bars"><span /><span /><span /></div>
                  <span>Building...</span>
                </div>
              </div>
            )}
            {templateBuild.status === "done" && templateBuild.amxdB64 && (
              <div className="template-result">
                <div className="template-result-header">
                  <span className="template-result-label">Base template ready</span>
                  <button
                    className="download-button"
                    onClick={() => {
                      if (embedded && templateBuild.generationId) {
                        navigator.clipboard.writeText(getDownloadUrl(templateBuild.generationId)).then(() => setSavedToDesktop(true));
                      } else {
                        downloadAmxd(templateBuild.amxdB64!, "device.amxd");
                      }
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {savedToDesktop ? "Link copied!" : "Download .amxd"}
                  </button>
                </div>
                {!embedded && (
                  <form className="template-customize" onSubmit={handleCustomize}>
                    <label className="template-customize-label">Want to customize?</label>
                    <div className="input-wrapper">
                      <input
                        type="text"
                        value={customizeInput}
                        onChange={(e) => setCustomizeInput(e.target.value)}
                        placeholder="e.g. Add a feedback knob, change color to blue..."
                        className="chat-input"
                        style={{ minHeight: "auto" }}
                      />
                      <button
                        type="submit"
                        disabled={!customizeInput.trim() || isLoading}
                        className="send-button"
                        aria-label="Customize"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </button>
                    </div>
                  </form>
                )}
                <button className="template-back" onClick={() => { setTemplateBuild(null); setCustomizeInput(""); }}>
                  Back to presets
                </button>
              </div>
            )}
            {templateBuild.status === "error" && (
              <div className={embedded ? "" : "message-content"}>
                <span style={{ color: "var(--error)" }}>Error: {templateBuild.error}</span>
                <button className="download-button" style={{ marginLeft: 8, background: "transparent", color: "var(--text-secondary)", boxShadow: "none", border: "1px solid var(--border-default)" }} onClick={() => setTemplateBuild(null)}>
                  Back
                </button>
              </div>
            )}
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
