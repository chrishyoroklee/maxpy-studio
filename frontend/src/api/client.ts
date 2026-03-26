const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api";

export interface GenerateEvent {
  type: "chunk" | "code_extracted" | "status" | "success" | "error" | "done";
  content?: string;
  generation_id?: string;
  stdout?: string;
  amxd_b64?: string;
}

export async function* streamGenerate(
  prompt: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[] = [],
  template?: string
): AsyncGenerator<GenerateEvent> {
  const body: Record<string, unknown> = { prompt, model, messages };
  if (template) body.template = template;

  const response = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

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

export function getDownloadUrl(generationId: string): string {
  return `${API_BASE}/download/${generationId}`;
}
