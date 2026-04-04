import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../hooks/useChat";
import { downloadBlob } from "../lib/download";
import { fetchTemplateCode } from "../lib/templates";
import { rewriteSavePaths } from "../lib/pathRewriter";
import { CodePatchTabs } from "./CodePatchTabs";
import { extractMaxpat } from "../lib/maxpatExtractor";
import { parsePatchGraph, type PatchGraph } from "../lib/patchGraphParser";
import { logEvent } from "../lib/firestore";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (prompt: string, template?: string) => void;
  pyodideReady: boolean;
  embedded?: boolean;
  model?: string;
  setModel?: (model: string) => void;
  runCode: (code: string) => Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    amxdBytes: Uint8Array | null;
  }>;
}

const SUGGESTIONS = [
  { label: "Chorus", desc: "Stereo widening with rate & depth", prompt: "Add a feedback knob and make the color blue", template: "m4l_chorus" },
  { label: "Tremolo", desc: "Amplitude modulation", prompt: "Add a waveform selector (sine/square) and make the color green", template: "m4l_tremolo" },
  { label: "3-Band EQ", desc: "Shape lows, mids & highs", prompt: "Add a Q control for each band", template: "m4l_eq" },
  { label: "Lo-Fi", desc: "Bit reduction & aliasing", prompt: "Add a wet/dry mix knob", template: "m4l_lofi" },
  { label: "Reverb", desc: "Room simulation with decay", prompt: "Add a pre-delay knob and make the color purple", template: "m4l_reverb" },
  { label: "Delay", desc: "Stereo echo with feedback", prompt: "Add ping-pong stereo and a filter in the feedback loop", template: "m4l_stereo_delay" },
  { label: "Distortion", desc: "Overdrive & saturation", prompt: "Add a second distortion stage and make the color orange", template: "m4l_distortion" },
  { label: "Compressor", desc: "Bus glue & dynamics", prompt: "Add a ratio control and sidechain input", template: "m4l_compressor" },
  { label: "Mono Synth", desc: "Classic subtractive mono", prompt: "Add a filter envelope and a second oscillator (detuned saw)", template: "m4l_mono_synth" },
  { label: "Bass Synth", desc: "Moog-style sub bass", prompt: "Add a second saw oscillator detuned by 7 cents", template: "m4l_bass_synth" },
];

const MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Opus 4" },
];

interface TemplateBuild {
  status: "building" | "done" | "error";
  templateName: string;
  amxdBytes?: Uint8Array;
  patchData?: PatchGraph;
  code?: string;
  error?: string;
}

export function Chat({ messages, isLoading, onSend, pyodideReady, embedded, model, setModel, runCode }: Props) {
  const [input, setInput] = useState("");
  const [templateBuild, setTemplateBuild] = useState<TemplateBuild | null>(null);
  const [customizeInput, setCustomizeInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTemplateBuild = async (templateName: string) => {
    logEvent("template_click", { template: templateName });
    setTemplateBuild({ status: "building", templateName });
    try {
      const code = await fetchTemplateCode(templateName);
      const rewritten = rewriteSavePaths(code);
      const result = await runCode(rewritten);
      if (result.success && result.amxdBytes) {
        let patchData: PatchGraph | undefined;
        try {
          const maxpat = extractMaxpat(result.amxdBytes);
          patchData = parsePatchGraph(maxpat);
        } catch {
          // Patch viz is non-critical
        }
        setTemplateBuild({ status: "done", templateName, amxdBytes: result.amxdBytes, patchData, code: rewritten });
      } else {
        setTemplateBuild({ status: "error", templateName, error: result.stderr || "Build failed" });
      }
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
    if (!input.trim() || isLoading || !pyodideReady) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.length === 0 && !templateBuild && (
          <div className="welcome">
            <h2>MaxPy Studio</h2>
            <p>Describe a plugin. Get an .amxd for Ableton.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  className="suggestion-card"
                  disabled={!pyodideReady}
                  onClick={() => handleTemplateBuild(s.template)}
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
            {templateBuild.status === "done" && templateBuild.amxdBytes && (
              <div className="template-result">
                <div className="template-result-header">
                  <span className="template-result-label">Base template ready</span>
                  <button
                    className="download-button"
                    onClick={() => { logEvent("download", { source: "template", template: templateBuild.templateName }); downloadBlob(templateBuild.amxdBytes!, "device.amxd"); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download .amxd
                  </button>
                </div>
                {templateBuild.code && (
                  <CodePatchTabs code={templateBuild.code} patchData={templateBuild.patchData} />
                )}
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
                <div className={`embedded-status${lastAssistant.isRateLimited ? " message-rate-limited" : ""}`}>
                  <span style={{ color: lastAssistant.isRateLimited ? "#d97706" : "var(--error)" }}>
                    {lastAssistant.isRateLimited ? "Slow down \u2014 " : "Error: "}{lastAssistant.error}
                  </span>
                </div>
              );
              if (lastAssistant?.amxdBytes) return (
                <div className="embedded-status">
                  <span className="embedded-status-success">Created!</span>
                  <button
                    className="download-button"
                    onClick={() => { logEvent("download", { source: "embedded" }); downloadBlob(lastAssistant.amxdBytes!, "device.amxd"); }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download .amxd
                  </button>
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
                  {msg.code && (
                    <CodePatchTabs code={msg.code} patchData={msg.patchData} />
                  )}
                  {msg.error && (
                    <div className={`message-error${msg.isRateLimited ? " message-rate-limited" : ""}`}>
                      {msg.isRateLimited ? "Slow down \u2014 " : ""}{msg.error}
                    </div>
                  )}
                  {msg.amxdBytes && (
                    <button
                      className="download-button"
                      onClick={() => { logEvent("download", { source: "chat" }); downloadBlob(msg.amxdBytes!, "device.amxd"); }}
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
            placeholder={pyodideReady ? "Describe the plugin you want..." : "Loading Python runtime..."}
            disabled={!pyodideReady || isLoading}
            rows={1}
            className="chat-input"
          />
          {embedded && (
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
            disabled={isLoading || !input.trim() || !pyodideReady}
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
