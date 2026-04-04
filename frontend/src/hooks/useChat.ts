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
  loadPlugin,
  updatePlugin,
} from "../lib/firestore";
import { uploadAmxd, downloadAmxd } from "../lib/storage";
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
    Promise.all([loadMessages(pluginId), loadPlugin(pluginId)])
      .then(async ([docs, plugin]) => {
        console.log("[useChat] Loaded plugin:", plugin);
        console.log("[useChat] Loaded messages:", docs);
        const loaded: ChatMessage[] = docs.map((d) => ({
          id: d.id,
          role: d.role,
          content: d.content,
          code: d.code,
          error: d.error,
          warnings: d.warnings as ValidationIssue[] | undefined,
        }));
        setMessages(loaded);

        // Fallback: if the latest assistant message with code lacks amxdStoragePath,
        // use the plugin's current amxdStoragePath (for messages saved before the fix)
        if (plugin?.amxdStoragePath) {
          for (let i = docs.length - 1; i >= 0; i--) {
            const d = docs[i];
            if (d.role === "assistant" && d.code && !d.amxdStoragePath) {
              console.log("[useChat] Fallback: using plugin storage path for message", d.id);
              d.amxdStoragePath = plugin.amxdStoragePath;
              break;
            }
          }
        } else {
          console.warn("[useChat] No amxdStoragePath on plugin doc");
        }

        // Restore .amxd bytes + patch data for messages that have a storage path
        await Promise.all(
          docs.map(async (d, i) => {
            if (!d.amxdStoragePath) {
              console.log("[useChat] No storage path for message", i, d.id);
              return;
            }
            try {
              console.log("[useChat] Downloading .amxd from", d.amxdStoragePath);
              const bytes = await downloadAmxd(d.amxdStoragePath);
              console.log("[useChat] Downloaded", bytes.length, "bytes");
              let patchData: PatchGraph | undefined;
              try {
                const maxpat = extractMaxpat(bytes);
                patchData = parsePatchGraph(maxpat);
              } catch (err) {
                console.warn("[useChat] Failed to extract patch:", err);
              }
              setMessages((prev) => {
                const next = [...prev];
                if (next[i]) {
                  next[i] = { ...next[i], amxdBytes: bytes, patchData };
                }
                return next;
              });
            } catch (err) {
              console.warn("[useChat] Failed to download .amxd:", err);
            }
          })
        );
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
        saveMessage(pluginId, { role: "user", content: prompt }).catch((e) => console.warn("Failed to save user message:", e));
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
            saveMessage(pluginId, { role: "assistant", content: fullResponse, error: msg }).catch((e) => console.warn("Failed to save assistant error:", e));
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

          // Upload .amxd to Firebase Storage, then save message with storage path
          let amxdStoragePath: string | undefined;
          if (generationId && auth.currentUser) {
            const userId = auth.currentUser.uid;
            try {
              amxdStoragePath = await uploadAmxd(userId, generationId, result.amxdBytes);
              updateGenerationStoragePath(userId, generationId, amxdStoragePath).catch(() => {});
              if (pluginId) {
                updatePlugin(pluginId, { status: "ready", amxdStoragePath }).catch(() => {});
              }
            } catch (err) {
              console.warn("Failed to upload .amxd:", err);
            }
          }

          // Save assistant message with storage path reference
          if (pluginId) {
            saveMessage(pluginId, {
              role: "assistant",
              content: fullResponse,
              code: rewritten,
              warnings: warnings?.map(({ severity, code, message }) => ({ severity, code, message })),
              amxdStoragePath,
            }).catch((e) => console.warn("Failed to save assistant message:", e));
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
            saveMessage(pluginId, { role: "assistant", content: fullResponse, code: rewritten, error: errorMsg }).catch((e) => console.warn("Failed to save assistant error:", e));
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
