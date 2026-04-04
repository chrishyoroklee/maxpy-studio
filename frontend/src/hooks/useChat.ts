import { useState, useCallback, useRef } from "react";
import { streamLLM, RateLimitError } from "../api/client";
import { extractCode, ExtractionError } from "../lib/extractor";
import { rewriteSavePaths } from "../lib/pathRewriter";
import { fetchTemplateCode } from "../lib/templates";
import { savePrompt, saveGeneration, updateGenerationStoragePath } from "../lib/firestore";
import { uploadAmxd } from "../lib/storage";
import { auth } from "../lib/firebase";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  code?: string;
  amxdBytes?: Uint8Array;
  error?: string;
  isRateLimited?: boolean;
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

      // Log prompt to Firestore (fire and forget)
      const promptId = await savePrompt({ prompt, model, templateUsed: template }).catch(() => "");

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
          const generationId = await saveGeneration({
            promptId,
            llmResponse: fullResponse,
            extractedCode: rewritten,
            status: "success",
          }).catch(() => "");

          // Upload .amxd to Firebase Storage (fire and forget)
          if (generationId && auth.currentUser) {
            uploadAmxd(auth.currentUser.uid, generationId, result.amxdBytes)
              .then((storagePath) => updateGenerationStoragePath(generationId, storagePath))
              .catch((err) => console.warn("Failed to upload .amxd to storage:", err));
          }
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, error: `Execution failed:\n${result.stderr}` }
                : m
            )
          );
          saveGeneration({
            promptId,
            llmResponse: fullResponse,
            extractedCode: rewritten,
            status: "error",
            errorMessage: result.stderr,
          }).catch(() => {});
        }
      } catch (err) {
        const isRateLimited = err instanceof RateLimitError;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, error: err instanceof Error ? err.message : "Unknown error", isRateLimited }
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
