import { auth } from "../lib/firebase";

const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE ?? "http://127.0.0.1:5055/maxpylang-studio/us-central1";

// Build the generateCode URL — supports both emulator (path-based) and Cloud Run (direct URL)
const GENERATE_URL = FUNCTIONS_BASE.includes("generatecode") || FUNCTIONS_BASE.includes("generateCode")
  ? FUNCTIONS_BASE
  : `${FUNCTIONS_BASE}/generateCode`;

export interface GenerateEvent {
  type: "chunk" | "error" | "done";
  content?: string;
}

export class RateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    const minutes = Math.ceil(retryAfter / 60);
    super(`Rate limit exceeded. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Stream LLM response from the Cloud Function.
 * Code extraction + execution now happens client-side via Pyodide.
 */
export async function* streamLLM(
  prompt: string,
  model: string,
  messages: { role: string; content: string }[] = [],
  template?: string,
  templateCode?: string,
  signal?: AbortSignal,
): AsyncGenerator<GenerateEvent> {
  const body: Record<string, unknown> = { prompt, model, messages };
  if (template) body.template = template;
  if (templateCode) body.templateCode = templateCode;

  // Send auth token for server-side uid verification + rate limiting
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;

  const response = await fetch(GENERATE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (response.status === 429) {
    let retryAfter = 60;
    try {
      const errorBody = await response.json();
      if (errorBody.retryAfter) {
        retryAfter = errorBody.retryAfter;
      }
    } catch {
      // Use default retryAfter
    }
    throw new RateLimitError(retryAfter);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event: GenerateEvent = JSON.parse(line.slice(6));
            yield event;
          } catch {
            // skip malformed events
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
