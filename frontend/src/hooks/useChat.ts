import { useState, useCallback, useRef } from "react";
import { streamLLM } from "../api/client";
import { extractCode, ExtractionError } from "../lib/extractor";
import { rewriteSavePaths } from "../lib/pathRewriter";
import { fetchTemplateCode } from "../lib/templates";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  code?: string;
  amxdBytes?: Uint8Array;
  error?: string;
}

let msgCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

type RunCodeFn = (code: string) => Promise<{
  success: boolean;
  stdout: string;
  stderr: string;
  amxdBytes: Uint8Array | null;
}>;

export function useChat(runCode: RunCodeFn) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const sendMessage = useCallback(
    async (prompt: string, model: string, template?: string) => {
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
        // If template, fetch its code for the LLM context
        let templateCode: string | undefined;
        if (template) {
          templateCode = await fetchTemplateCode(template);
        }

        // Phase 1: Stream LLM response
        let fullResponse = "";
        for await (const event of streamLLM(prompt, model, history, template, templateCode)) {
          if (event.type === "chunk") {
            fullResponse += event.content || "";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + (event.content || "") }
                  : m
              )
            );
          } else if (event.type === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, error: event.content } : m
              )
            );
            return;
          }
        }

        // Phase 2: Extract code
        let code: string;
        try {
          code = extractCode(fullResponse);
        } catch (err) {
          const msg = err instanceof ExtractionError ? err.message : "Code extraction failed";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, error: msg } : m
            )
          );
          return;
        }

        // Phase 3: Rewrite paths and execute in Pyodide
        const rewritten = rewriteSavePaths(code);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, code: rewritten } : m
          )
        );

        const result = await runCode(rewritten);

        if (result.success && result.amxdBytes) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, amxdBytes: result.amxdBytes! } : m
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, error: `Execution failed:\n${result.stderr}` }
                : m
            )
          );
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
    [runCode]
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isLoading, sendMessage, clearMessages };
}
