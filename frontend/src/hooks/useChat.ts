import { useState, useCallback, useRef } from "react";
import { streamGenerate } from "../api/client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  code?: string;
  generationId?: string;
  error?: string;
}

let msgCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);

  // Keep ref in sync for stable closure
  messagesRef.current = messages;

  const sendMessage = useCallback(
    async (prompt: string, apiKey: string, model: string) => {
      // Build conversation history from ref (no stale closure)
      const history = messagesRef.current.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const userMsg: ChatMessage = { id: nextId(), role: "user", content: prompt };
      const assistantMsg: ChatMessage = { id: nextId(), role: "assistant", content: "" };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      const assistantId = assistantMsg.id;

      try {
        for await (const event of streamGenerate(prompt, apiKey, model, history)) {
          switch (event.type) {
            case "chunk":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + (event.content || "") }
                    : m
                )
              );
              break;

            case "code_extracted":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, code: event.content } : m
                )
              );
              break;

            case "success":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, generationId: event.generation_id }
                    : m
                )
              );
              break;

            case "error":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, error: event.content } : m
                )
              );
              break;
          }
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, error: err instanceof Error ? err.message : "Unknown error" }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isLoading, sendMessage, clearMessages };
}
