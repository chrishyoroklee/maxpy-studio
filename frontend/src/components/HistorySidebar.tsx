import { getDownloadUrl } from "../api/client";

interface Generation {
  id: string;
  prompt: string;
  status: string;
  created_at: string;
}

interface Props {
  generations: Generation[];
  onSelect: (id: string) => void;
}

export function HistorySidebar({ generations, onSelect }: Props) {
  if (generations.length === 0) return null;

  return (
    <aside className="history-sidebar">
      <h3>History</h3>
      <ul>
        {generations.map((gen) => (
          <li key={gen.id} className="history-item">
            <button
              className="history-button"
              onClick={() => onSelect(gen.id)}
            >
              <span className="history-prompt">
                {gen.prompt.length > 40
                  ? gen.prompt.slice(0, 40) + "..."
                  : gen.prompt}
              </span>
              <span className={`history-status ${gen.status}`}>
                {gen.status === "success" ? "ok" : gen.status}
              </span>
            </button>
            {gen.status === "success" && (
              <a
                href={getDownloadUrl(gen.id)}
                className="history-download"
                download
                title="Download .amxd"
              >
                dl
              </a>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
