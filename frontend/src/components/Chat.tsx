import { useState, useRef, useEffect } from "react";
import type { ChatMessage, MessageStatus } from "../hooks/useChat";
import { downloadBlob } from "../lib/download";
import { CodePatchTabs } from "./CodePatchTabs";
import { logEvent } from "../lib/firestore";
import { useEmbedMode } from "../hooks/useEmbedded";

type InFlightStatus = Exclude<MessageStatus, "done" | "error">;

const STATUS_LABELS: Record<InFlightStatus, string> = {
  creating: "Creating plugin",
  running: "Running code",
  debugging: "Debugging",
};

function StatusIndicator({ status, detail }: { status: InFlightStatus; detail?: string }) {
  const label = STATUS_LABELS[status] || "Working";
  return (
    <div className="status-indicator" role="status" aria-live="polite">
      <span className="status-dot" aria-hidden="true" />
      <span className="status-label">
        {label}{detail ? ` (${detail})` : ""}...
      </span>
    </div>
  );
}

// Legacy content is "clean" if it doesn't contain code/description fences
function isCleanLegacyContent(content: string): boolean {
  return !content.includes("```") && !content.includes("~~~");
}

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (prompt: string) => void;
  onTemplateBuild: (templateName: string, templateLabel: string) => void;
  pyodideReady: boolean;
  embedded?: boolean;
  model?: string;
  setModel?: (model: string) => void;
  pluginId?: string | null;
  pluginName?: string;
}

const AUDIO_EFFECTS = [
  { label: "Chorus", desc: "Stereo widening with rate & depth", prompt: "Add a feedback knob and make the color blue", template: "m4l_chorus" },
  { label: "Tremolo", desc: "Amplitude modulation", prompt: "Add a waveform selector (sine/square) and make the color green", template: "m4l_tremolo" },
  { label: "3-Band EQ", desc: "Shape lows, mids & highs", prompt: "Add a Q control for each band", template: "m4l_eq" },
  { label: "Lo-Fi", desc: "Bit reduction & aliasing", prompt: "Add a wet/dry mix knob", template: "m4l_lofi" },
  { label: "Reverb", desc: "Room simulation with decay", prompt: "Add a pre-delay knob and make the color purple", template: "m4l_reverb" },
  { label: "Delay", desc: "Stereo echo with feedback", prompt: "Add ping-pong stereo and a filter in the feedback loop", template: "m4l_stereo_delay" },
  { label: "Distortion", desc: "Overdrive & saturation", prompt: "Add a second distortion stage and make the color orange", template: "m4l_distortion" },
  { label: "Compressor", desc: "Bus glue & dynamics", prompt: "Add a ratio control and sidechain input", template: "m4l_compressor" },
];

const VIRTUAL_INSTRUMENTS = [
  { label: "Mono Synth", desc: "Classic subtractive mono", prompt: "Add a filter envelope and a second oscillator (detuned saw)", template: "m4l_mono_synth" },
  { label: "Bass Synth", desc: "Moog-style sub bass", prompt: "Add a second saw oscillator detuned by 7 cents", template: "m4l_bass_synth" },
  { label: "Rhodes EP", desc: "Warm electric piano with bell tine", prompt: "Add a tremolo effect with rate and depth controls", template: "m4l_rhodes_piano" },
  { label: "Organ", desc: "Hammond-style drawbar organ", prompt: "Add a Leslie-style rotary speaker effect", template: "m4l_organ" },
  { label: "Upright Piano", desc: "Acoustic piano with rich harmonics", prompt: "Add a soft pedal that dampens the brightness", template: "m4l_upright_piano" },
];

const SUGGESTION_SECTIONS = [
  { title: "Audio Effects", items: AUDIO_EFFECTS },
  { title: "Virtual Instruments", items: VIRTUAL_INSTRUMENTS },
];

type SuggestionItem = { label: string; desc: string; prompt: string; template: string };

const DRAG_SCROLL_MULTIPLIER = 2.5;
const DRAG_CLICK_THRESHOLD = 4;

function SuggestionRow({
  title,
  items,
  disabled,
  onSelect,
}: {
  title: string;
  items: SuggestionItem[];
  disabled: boolean;
  onSelect: (template: string, label: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: number;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      ro.disconnect();
    };
  }, []);

  const handleArrowClick = (direction: -1 | 1) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    logEvent("suggestion_scroll_click", { direction, section: title });
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      moved: 0,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    const el = scrollRef.current;
    if (!state || !el) return;
    const dx = e.clientX - state.startX;
    state.moved = Math.max(state.moved, Math.abs(dx));
    el.scrollLeft = state.startScrollLeft + dx * DRAG_SCROLL_MULTIPLIER;
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state) return;
    if (e.currentTarget.hasPointerCapture(state.pointerId)) {
      e.currentTarget.releasePointerCapture(state.pointerId);
    }
    if (state.moved > DRAG_CLICK_THRESHOLD) {
      suppressClickRef.current = true;
    }
    dragStateRef.current = null;
  };

  return (
    <div className="suggestion-section">
      <div className="suggestion-section-title">{title}</div>
      <div className="suggestion-row-wrap">
        <button
          type="button"
          className="suggestion-scroll-arrow left"
          data-visible={canScrollLeft}
          aria-label={`Scroll ${title} left`}
          tabIndex={canScrollLeft ? 0 : -1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={() => handleArrowClick(-1)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: "scaleX(-1)" }}
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
        <div className="suggestions" ref={scrollRef}>
          {items.map((s) => (
            <button
              key={s.label}
              className="suggestion-card"
              disabled={disabled}
              onClick={() => onSelect(s.template, s.label)}
            >
              <span className="suggestion-label">{s.label}</span>
              <span className="suggestion-desc">{s.desc}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="suggestion-scroll-arrow right"
          data-visible={canScrollRight}
          aria-label={`Scroll ${title} right`}
          tabIndex={canScrollRight ? 0 : -1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={() => handleArrowClick(1)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Opus 4" },
];

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "device";
}

export function Chat({ messages, isLoading, onSend, onTemplateBuild, pyodideReady, embedded, model, setModel, pluginName, pluginId }: Props) {
  const embedMode = useEmbedMode();
  const isM4L = embedMode === "m4l";
  const filename = `${slugify(pluginName || "device")}.amxd`;
  const [input, setInput] = useState("");
  const [ratedMessages, setRatedMessages] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTemplateClick = (templateName: string, templateLabel: string) => {
    logEvent("template_click", { template: templateName });
    onTemplateBuild(templateName, templateLabel);
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
        {messages.length === 0 && (
          <div className="welcome">
            <h2>MaxPy Studio</h2>
            <p>Describe a plugin. Get an .amxd for Ableton.</p>
            {SUGGESTION_SECTIONS.map((section) => (
              <SuggestionRow
                key={section.title}
                title={section.title}
                items={section.items}
                disabled={!pyodideReady || isLoading}
                onSelect={handleTemplateClick}
              />
            ))}
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
                  <span style={{ color: lastAssistant.isRateLimited ? "var(--warning)" : "var(--error)" }}>
                    {lastAssistant.isRateLimited ? "Slow down \u2014 " : "Error: "}{lastAssistant.error}
                  </span>
                </div>
              );
              if (lastAssistant?.amxdBytes) return (
                <div className="embedded-status">
                  <span className="embedded-status-success">{isM4L ? "Loaded into device" : "Created!"}</span>
                  {!isM4L && (
                    <button
                      className="download-button"
                      onClick={() => { logEvent("download", { source: "embedded" }); downloadBlob(lastAssistant.amxdBytes!, filename); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download .amxd
                    </button>
                  )}
                </div>
              );
              return null;
            })()}
          </>
        ) : (
          <>
            {messages.map((msg) => {
              const inFlightStatus: InFlightStatus | undefined =
                msg.role === "assistant" && msg.status && msg.status !== "done" && msg.status !== "error"
                  ? msg.status
                  : undefined;
              const isAssistantSettled = msg.role === "assistant" && (msg.status === "done" || msg.status === "error");
              // Fall back to msg.content for legacy messages that predate iterationSummary
              const summaryText = msg.iterationSummary
                ?? (isAssistantSettled && msg.content && isCleanLegacyContent(msg.content) ? msg.content : undefined);
              return (
                <div key={msg.id} className={`message ${msg.role}`}>
                  <div className="message-role">
                    {msg.role === "user" ? "You" : "Studio"}
                  </div>
                  <div className="message-content">
                    {msg.role === "user" && msg.content}
                    {inFlightStatus && (
                      <StatusIndicator status={inFlightStatus} detail={msg.statusDetail} />
                    )}
                    {isAssistantSettled && summaryText && (
                      <p className="iteration-summary">{summaryText}</p>
                    )}
                    {isAssistantSettled && msg.code && (
                      <CodePatchTabs code={msg.code} patchData={msg.patchData} warnings={msg.warnings} />
                    )}
                    {isAssistantSettled && msg.description && (
                      <p className="plugin-description">{msg.description}</p>
                    )}
                    {msg.error && (
                      <div className={`message-error${msg.isRateLimited ? " message-rate-limited" : ""}`}>
                        {msg.isRateLimited ? "Slow down \u2014 " : ""}{msg.error}
                      </div>
                    )}
                    {msg.amxdBytes && !isM4L && (
                      <button
                        className="download-button"
                        onClick={() => { logEvent("download", { source: "chat", pluginId: pluginId || undefined, hasWarnings: (msg.warnings?.length || 0) > 0, warningCount: msg.warnings?.length || 0 }); downloadBlob(msg.amxdBytes!, filename); }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download .amxd
                      </button>
                    )}
                    {msg.amxdBytes && !isM4L && !ratedMessages.has(msg.id) && (
                      <div className="rating-buttons">
                        <button
                          className="rating-btn rating-up"
                          onClick={() => {
                            logEvent("plugin_rating", { rating: "up", pluginId: pluginId || undefined, messageId: msg.id });
                            setRatedMessages(prev => new Set(prev).add(msg.id));
                          }}
                          title="Good result"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" />
                            <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
                          </svg>
                        </button>
                        <button
                          className="rating-btn rating-down"
                          onClick={() => {
                            logEvent("plugin_rating", { rating: "down", pluginId: pluginId || undefined, messageId: msg.id });
                            setRatedMessages(prev => new Set(prev).add(msg.id));
                          }}
                          title="Needs improvement"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z" />
                            <path d="M17 2h3a2 2 0 012 2v7a2 2 0 01-2 2h-3" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {msg.amxdBytes && !isM4L && ratedMessages.has(msg.id) && (
                      <span className="rating-thanks">Thanks for the feedback!</span>
                    )}
                    {msg.amxdBytes && isM4L && (
                      <div className="m4l-loaded-badge">✓ Loaded into device</div>
                    )}
                  </div>
                </div>
              );
            })}

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
