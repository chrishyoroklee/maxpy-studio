import { useState, useCallback, useRef, useEffect } from "react";
import { streamLLM, RateLimitError } from "../api/client";
import { extractCode, ExtractionError } from "../lib/extractor";
import { rewriteSavePaths } from "../lib/pathRewriter";
import { fetchTemplateCode } from "../lib/templates";
import {
  savePrompt,
  saveGeneration,
  updateGenerationStoragePath,
  saveMessage,
  loadMessages,
  updatePlugin,
} from "../lib/firestore";
import { uploadAmxd } from "../lib/storage";
import { auth } from "../lib/firebase";
import { extractMaxpat } from "../lib/maxpatExtractor";
import { parsePatchGraph, type PatchGraph } from "../lib/patchGraphParser";
import { validatePatch, type ValidationIssue } from "../lib/patchValidator";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  code?: string;
  amxdBytes?: Uint8Array;
  patchData?: PatchGraph;
  warnings?: ValidationIssue[];
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

export function useChat(runCode: RunCodeFn, pluginId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  // Load existing messages when pluginId changes
  useEffect(() => {
    if (!pluginId) {
      setMessages([]);
      setHistoryLoaded(false);
      return;
    }

    setHistoryLoaded(false);
    loadMessages(pluginId)
      .then((docs) => {
        const loaded: ChatMessage[] = docs.map((d) => ({
          id: d.id,
          role: d.role,
          content: d.content,
          code: d.code,
          error: d.error,
          warnings: d.warnings as ValidationIssue[] | undefined,
        }));
        setMessages(loaded);
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, [pluginId]);

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

      // Save user message to Firestore
      if (pluginId) {
        saveMessage(pluginId, { role: "user", content: prompt }).catch(() => {});
      }

      // Log prompt (fire and forget)
      const promptId = await savePrompt({ prompt, model, templateUsed: template, pluginId: pluginId || undefined }).catch(() => "");

      const assistantId = assistantMsg.id;

      try {
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
          // Save error message
          if (pluginId) {
            saveMessage(pluginId, { role: "assistant", content: fullResponse, error: msg }).catch(() => {});
          }
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
          // Extract patch data for visualization and validate
          let patchData: PatchGraph | undefined;
          let warnings: ValidationIssue[] | undefined;
          try {
            const maxpat = extractMaxpat(result.amxdBytes);
            const validationResult = validatePatch(maxpat);
            warnings = validationResult.issues.length > 0 ? validationResult.issues : undefined;
            patchData = parsePatchGraph(maxpat);
          } catch {
            // Patch viz is non-critical
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, amxdBytes: result.amxdBytes!, patchData, warnings } : m
            )
          );

          const generationId = await saveGeneration({
            promptId,
            pluginId: pluginId || undefined,
            llmResponse: fullResponse,
            extractedCode: rewritten,
            status: "success",
            validationIssues: warnings?.map(({ severity, code, message }) => ({ severity, code, message })),
          }).catch(() => "");

          // Upload .amxd to Firebase Storage
          if (generationId && auth.currentUser) {
            const userId = auth.currentUser.uid;
            uploadAmxd(userId, generationId, result.amxdBytes)
              .then((storagePath) => {
                updateGenerationStoragePath(userId, generationId, storagePath);
                // Update plugin with latest .amxd path and status
                if (pluginId) {
                  updatePlugin(pluginId, { status: "ready", amxdStoragePath: storagePath });
                }
              })
              .catch((err) => console.warn("Failed to upload .amxd:", err));
          }

          // Save assistant message
          if (pluginId) {
            saveMessage(pluginId, {
              role: "assistant",
              content: fullResponse,
              code: rewritten,
              warnings: warnings?.map(({ severity, code, message }) => ({ severity, code, message })),
            }).catch(() => {});
          }
        } else {
          const errorMsg = `Execution failed:\n${result.stderr}`;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, error: errorMsg } : m
            )
          );
          saveGeneration({
            promptId,
            pluginId: pluginId || undefined,
            llmResponse: fullResponse,
            extractedCode: rewritten,
            status: "error",
            errorMessage: result.stderr,
          }).catch(() => {});

          // Save error message
          if (pluginId) {
            saveMessage(pluginId, { role: "assistant", content: fullResponse, code: rewritten, error: errorMsg }).catch(() => {});
          }
        }
      } catch (err) {
        const isRateLimited = err instanceof RateLimitError;
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, error: errorMsg, isRateLimited }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [runCode, pluginId]
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isLoading, sendMessage, clearMessages, historyLoaded };
}
