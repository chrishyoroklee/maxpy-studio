const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE ?? "http://127.0.0.1:5001/maxpylang-studio/us-central1";

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
): AsyncGenerator<GenerateEvent> {
  const body: Record<string, unknown> = { prompt, model, messages };
  if (template) body.template = template;
  if (templateCode) body.templateCode = templateCode;

  const response = await fetch(`${FUNCTIONS_BASE}/generateCode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
