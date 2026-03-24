import { useState, useCallback } from "react";
import { streamGenerate } from "../api/client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  code?: string;
  generationId?: string;
  error?: string;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(
    async (prompt: string, apiKey: string, model: string) => {
      // Add user message
      const userMsg: ChatMessage = { role: "user", content: prompt };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      // Add empty assistant message to stream into
      const assistantMsg: ChatMessage = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        // Build conversation history for multi-turn
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        for await (const event of streamGenerate(prompt, apiKey, model, history)) {
          switch (event.type) {
            case "chunk":
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                last.content += event.content || "";
                return updated;
              });
              break;

            case "code_extracted":
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                last.code = event.content;
                return updated;
              });
              break;

            case "success":
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                last.generationId = event.generation_id;
                return updated;
              });
              break;

            case "error":
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                last.error = event.content;
                return updated;
              });
              break;
          }
        }
      } catch (err) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          last.error = err instanceof Error ? err.message : "Unknown error";
          return updated;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [messages]
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isLoading, sendMessage, clearMessages };
}
