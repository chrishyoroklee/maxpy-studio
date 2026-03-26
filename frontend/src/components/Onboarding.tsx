interface Props {
  setApiKey: (key: string) => void;
  model: string;
  setModel: (model: string) => void;
}

const MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gemini/gemini-2.5-pro-preview-06-05", label: "Gemini 2.5 Pro" },
  { value: "gemini/gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
  { value: "deepseek/deepseek-chat", label: "DeepSeek V3" },
  { value: "mistral/mistral-large-latest", label: "Mistral Large" },
];

import { useState } from "react";

export function Onboarding({ setApiKey, model, setModel }: Props) {
  const [key, setKey] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim()) {
      setApiKey(key.trim());
    }
  };

  return (
    <div className="onboarding">
      <form className="onboarding-card" onSubmit={handleSubmit}>
        <img src="/logo.webp" alt="" className="onboarding-logo" />
        <h1 className="onboarding-title">MaxPyLang Studio</h1>
        <p className="onboarding-subtitle">
          Generate Max for Live plugins from text descriptions.
        </p>

        <label className="onboarding-label">API Key</label>
        <input
          type="password"
          placeholder="Paste your Claude or OpenAI key..."
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="onboarding-input"
          autoFocus
        />

        <label className="onboarding-label">Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="onboarding-select"
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={!key.trim()}
          className="onboarding-button"
        >
          Get Started
        </button>
      </form>
    </div>
  );
}
