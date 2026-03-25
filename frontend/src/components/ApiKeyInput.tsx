interface Props {
  apiKey: string;
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

export function ApiKeyInput({ apiKey, setApiKey, model, setModel }: Props) {
  return (
    <div className="api-key-bar">
      <input
        type="password"
        placeholder="Paste your API key..."
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        className="api-key-input"
      />
      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="model-select"
      >
        {MODELS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
