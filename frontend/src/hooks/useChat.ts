import { useState, useCallback, useRef, useEffect } from "react";
import { streamLLM, RateLimitError } from "../api/client";
import { extractCode, extractDescription, extractSummary, ExtractionError } from "../lib/extractor";
import { rewriteSavePaths } from "../lib/pathRewriter";
import { fetchTemplateCode, TEMPLATES } from "../lib/templates";
import { classifyDeviceType, type DeviceType } from "../lib/deviceClassifier";
import {
  savePrompt,
  saveGeneration,
  updateGenerationStoragePath,
  saveMessage,
  loadMessages,
  loadPlugin,
  updatePlugin,
  logEvent,
} from "../lib/firestore";
import { uploadAmxd, downloadAmxd } from "../lib/storage";
import { auth } from "../lib/firebase";
import { extractMaxpat } from "../lib/maxpatExtractor";
import { parsePatchGraph, type PatchGraph } from "../lib/patchGraphParser";
import { validatePatch, type ValidationIssue } from "../lib/patchValidator";
import { convertToSubpatcher, serializeSubpatcher } from "../lib/subpatcherSaver";

// jweb bridge to Max
declare global {
  interface Window {
    max?: {
      outlet: (...args: unknown[]) => void;
      bindInlet: (name: string, cb: (...args: unknown[]) => void) => void;
    };
  }
}

function sendToMax(maxpat: ReturnType<typeof extractMaxpat>): void {
  if (typeof window === "undefined" || !window.max) return;
  try {
    const subpatcher = convertToSubpatcher(maxpat);
    const json = serializeSubpatcher(subpatcher);
    window.max.outlet("load", json);
  } catch (err) {
    console.warn("Failed to send patcher to Max:", err);
  }
}

function isM4LMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("embedded") === "m4l";
}

export type MessageStatus = "creating" | "running" | "debugging" | "done" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  code?: string;
  description?: string;
  iterationSummary?: string;
  amxdBytes?: Uint8Array;
  patchData?: PatchGraph;
  warnings?: ValidationIssue[];
  error?: string;
  isRateLimited?: boolean;
  status?: MessageStatus;
  statusDetail?: string;
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
  const templateUsedRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load existing messages when pluginId changes
  useEffect(() => {
    if (!pluginId) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setMessages([]);
      setIsLoading(false);
      setHistoryLoaded(false);
      templateUsedRef.current = null;
      return;
    }

    let aborted = false;
    setHistoryLoaded(false);
    Promise.all([loadMessages(pluginId), loadPlugin(pluginId)])
      .then(async ([docs, plugin]) => {
        if (aborted) return;
        templateUsedRef.current = plugin?.templateUsed ?? null;
        const loaded: ChatMessage[] = docs.map((d) => ({
          id: d.id,
          role: d.role,
          content: d.content,
          code: d.code,
          description: d.description,
          iterationSummary: d.iterationSummary,
          error: d.error,
          warnings: d.warnings as ValidationIssue[] | undefined,
          status: d.role === "assistant" ? (d.error ? "error" : "done") : undefined,
        }));
        setMessages(loaded);

        // Fallback: for assistant messages with code that lack amxdStoragePath,
        // use the plugin's current amxdStoragePath (for messages saved before per-message paths)
        if (plugin?.amxdStoragePath) {
          for (let i = docs.length - 1; i >= 0; i--) {
            const d = docs[i];
            if (d.role === "assistant" && d.code && !d.amxdStoragePath) {
              d.amxdStoragePath = plugin.amxdStoragePath;
              // Don't break — patch all legacy messages so every turn gets patch data
            }
          }
        }

        // Restore .amxd bytes + patch data for messages that have a storage path.
        // Deduplicate: multiple legacy messages may share the same path, so download
        // each unique path once and apply to all messages that reference it.
        const pathToIds = new Map<string, string[]>();
        for (const d of docs) {
          if (d.amxdStoragePath) {
            const ids = pathToIds.get(d.amxdStoragePath) || [];
            ids.push(d.id);
            pathToIds.set(d.amxdStoragePath, ids);
          }
        }

        await Promise.all(
          Array.from(pathToIds.entries()).map(async ([path, ids]) => {
            if (aborted) return;
            try {
              const bytes = await downloadAmxd(path);
              if (aborted) return;
              let patchData: PatchGraph | undefined;
              try {
                const maxpat = extractMaxpat(bytes);
                patchData = parsePatchGraph(maxpat);
              } catch {
                // Patch viz is non-critical; skip if extraction fails
              }
              setMessages((prev) =>
                prev.map((m) =>
                  ids.includes(m.id) ? { ...m, amxdBytes: bytes, patchData } : m
                )
              );
            } catch {
              // Download failed; leave messages without patch data
            }
          })
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!aborted) setHistoryLoaded(true);
      });

    return () => { aborted = true; };
  }, [pluginId]);

  const sendMessage = useCallback(
    async (prompt: string, model: string) => {
      const template = templateUsedRef.current ?? undefined;
      const history = messagesRef.current.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const userMsg: ChatMessage = { id: nextId(), role: "user", content: prompt };
      const assistantMsg: ChatMessage = { id: nextId(), role: "assistant", content: "", status: "creating" };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Save user message to Firestore
      if (pluginId) {
        saveMessage(pluginId, { role: "user", content: prompt }).catch((e) => console.warn("Failed to save user message:", e));
      }

      // Log prompt (fire and forget)
      const promptId = await savePrompt({ prompt, model, templateUsed: template, pluginId: pluginId || undefined }).catch(() => "");

      // Classify device type
      let deviceType: DeviceType = "audio_effect";
      if (template) {
        const tmpl = TEMPLATES.find(t => t.name === template);
        if (tmpl) deviceType = tmpl.type;
      } else {
        deviceType = classifyDeviceType(prompt);
      }

      // Log prompt analysis data
      const trimmed = prompt.trim();
      const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
      logEvent("prompt_submitted", {
        promptLength: prompt.length,
        wordCount,
        hasTemplateContext: !!template,
        isFollowUp: history.length > 0,
        pluginId: pluginId || undefined,
        model,
        deviceType,
      });

      const assistantId = assistantMsg.id;

      try {
        let templateCode: string | undefined;
        if (template) {
          templateCode = await fetchTemplateCode(template);
        }

        const MAX_RETRIES = 4;
        let lastCode = "";
        const errorHistory: Array<{ error: string; code: string }> = [];

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          // On retry, reset the assistant message and build error-fix prompt
          let currentPrompt = prompt;
          let currentHistory = history;
          if (attempt > 0) {
            console.log(`[useChat] Retry attempt ${attempt}/${MAX_RETRIES}`);

            // Build a summary of ALL prior failed attempts so the LLM doesn't repeat mistakes
            const priorAttempts = errorHistory
              .map((h, i) => `--- Attempt ${i + 1} ---\nError:\n\`\`\`\n${h.error}\n\`\`\`\nCode:\n\`\`\`python\n${h.code}\n\`\`\``)
              .join("\n\n");

            currentPrompt = `You have failed ${attempt} time${attempt > 1 ? "s" : ""}. Here are ALL prior attempts and their errors:\n\n${priorAttempts}\n\nDo NOT repeat the same mistakes. Each error above must be addressed. Identify what went wrong in each attempt and make a DIFFERENT, correct fix. Output the complete corrected Python code. Make sure all objects exist in Max/MSP and all inlet/outlet indices are valid.`;
            // Include the failed exchange in history so LLM has full context
            currentHistory = [
              ...history,
              { role: "user", content: prompt },
              { role: "assistant", content: "```python\n" + lastCode + "\n```" },
            ];
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, status: "debugging", statusDetail: `retry ${attempt}/${MAX_RETRIES}`, error: undefined, code: undefined }
                  : m
              )
            );
          }

          // Phase 1: Stream LLM response (accumulate but don't show in UI)
          let fullResponse = "";
          let streamError = false;
          for await (const event of streamLLM(currentPrompt, model, currentHistory, attempt === 0 ? template : undefined, attempt === 0 ? templateCode : undefined, abortController.signal, deviceType)) {
            if (event.type === "chunk") {
              fullResponse += event.content || "";
            } else if (event.type === "deviceType") {
              const serverType = event.content as DeviceType;
              if (serverType === "audio_effect" || serverType === "instrument" || serverType === "midi_effect") {
                deviceType = serverType;
              }
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, error: event.content, status: "error" } : m
                )
              );
              streamError = true;
              break;
            }
          }
          if (streamError) return; // Don't retry API/network errors

          // Phase 2: Extract code
          let code: string;
          try {
            code = extractCode(fullResponse, deviceType);
          } catch (err) {
            const msg = err instanceof ExtractionError ? err.message : "Code extraction failed";
            lastCode = "";
            errorHistory.push({ error: msg, code: "" });
            logEvent("retry_attempt", {
              attempt: attempt + 1,
              maxAttempts: MAX_RETRIES + 1,
              errorType: "extraction",
              errorMessage: msg.slice(0, 500),
              pluginId: pluginId || undefined,
            });
            if (attempt < MAX_RETRIES) continue; // Retry
            logEvent("generation_failure", {
              totalAttempts: MAX_RETRIES + 1,
              lastErrorType: "extraction",
              pluginId: pluginId || undefined,
            });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, error: msg, status: "error" } : m
              )
            );
            if (pluginId) {
              saveMessage(pluginId, { role: "assistant", content: fullResponse, error: msg }).catch((e) => console.warn("Failed to save assistant error:", e));
            }
            return;
          }

          // Extract description and iteration summary (non-critical)
          const description = extractDescription(fullResponse);
          const iterationSummary = extractSummary(fullResponse);

          // Phase 3: Rewrite paths and execute in Pyodide
          const rewritten = rewriteSavePaths(code);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, status: "running", statusDetail: undefined } : m
            )
          );

          const result = await runCode(rewritten);

          if (result.success && result.amxdBytes) {
            // SUCCESS — extract patch data, save, and return
            let patchData: PatchGraph | undefined;
            let warnings: ValidationIssue[] | undefined;
            try {
              const maxpat = extractMaxpat(result.amxdBytes);
              const validationResult = validatePatch(maxpat, deviceType);
              warnings = validationResult.issues.length > 0 ? validationResult.issues : undefined;
              patchData = parsePatchGraph(maxpat);
              if (isM4LMode()) sendToMax(maxpat);
            } catch {
              // Patch viz is non-critical
            }

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      amxdBytes: result.amxdBytes!,
                      patchData,
                      warnings,
                      description,
                      iterationSummary,
                      code: rewritten,
                      content: fullResponse,
                      status: "done",
                      statusDetail: undefined,
                    }
                  : m
              )
            );

            logEvent("generation_success", {
              successAttempt: attempt + 1,
              totalAttempts: attempt + 1,
              hadRetries: attempt > 0,
              pluginId: pluginId || undefined,
            });

            const generationId = await saveGeneration({
              promptId,
              pluginId: pluginId || undefined,
              llmResponse: fullResponse,
              extractedCode: rewritten,
              status: "success",
              validationIssues: warnings?.map(({ severity, code, message }) => ({ severity, code, message })),
              attemptNumber: attempt + 1,
            }).catch((e) => { console.warn("saveGeneration failed:", e); return ""; });

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

            if (pluginId) {
              saveMessage(pluginId, {
                role: "assistant",
                content: fullResponse,
                code: rewritten,
                description,
                iterationSummary,
                warnings: warnings?.map(({ severity, code, message }) => ({ severity, code, message })),
                amxdStoragePath,
              }).catch((e) => console.warn("Failed to save assistant message:", e));
            }
            return; // Done — success
          }

          // FAIL — capture error for retry
          lastCode = rewritten;
          errorHistory.push({ error: result.stderr, code: rewritten });
          logEvent("retry_attempt", {
            attempt: attempt + 1,
            maxAttempts: MAX_RETRIES + 1,
            errorType: "execution",
            errorMessage: result.stderr.slice(0, 500),
            pluginId: pluginId || undefined,
          });

          if (attempt === MAX_RETRIES) {
            // Final failure — show error
            const errorMsg = `Execution failed:\n${result.stderr}`;
            logEvent("generation_failure", {
              totalAttempts: MAX_RETRIES + 1,
              lastErrorType: "execution",
              pluginId: pluginId || undefined,
            });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, error: errorMsg, status: "error", content: fullResponse } : m
              )
            );
            saveGeneration({
              promptId,
              pluginId: pluginId || undefined,
              llmResponse: fullResponse,
              extractedCode: rewritten,
              status: "error",
              errorMessage: result.stderr,
              attemptNumber: attempt + 1,
            }).catch(() => {});

            if (pluginId) {
              saveMessage(pluginId, { role: "assistant", content: fullResponse, code: rewritten, error: errorMsg }).catch((e) => console.warn("Failed to save assistant error:", e));
            }
          }
        } // end retry loop
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const isRateLimited = err instanceof RateLimitError;
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, error: errorMsg, isRateLimited, status: "error" }
              : m
          )
        );
      } finally {
        if (abortControllerRef.current === abortController) {
          setIsLoading(false);
          abortControllerRef.current = null;
        }
      }
    },
    [runCode, pluginId]
  );

  const buildTemplate = useCallback(
    async (templateName: string, templateLabel: string, model: string) => {
      const userMsg: ChatMessage = { id: nextId(), role: "user", content: `Build ${templateLabel} template` };
      const assistantMsg: ChatMessage = { id: nextId(), role: "assistant", content: "", status: "creating" };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (pluginId) {
        saveMessage(pluginId, { role: "user", content: userMsg.content }).catch((e) => console.warn("Failed to save user message:", e));
      }

      const promptId = await savePrompt({
        prompt: userMsg.content,
        model,
        templateUsed: templateName,
        pluginId: pluginId || undefined,
      }).catch(() => "");

      // Log prompt analysis data for template build
      const tplTrimmed = userMsg.content.trim();
      logEvent("prompt_submitted", {
        promptLength: userMsg.content.length,
        wordCount: tplTrimmed.length === 0 ? 0 : tplTrimmed.split(/\s+/).length,
        hasTemplateContext: true,
        isFollowUp: false,
        isTemplateInstant: true,
        templateName: templateName,
        pluginId: pluginId || undefined,
        model,
        deviceType: (TEMPLATES.find(t => t.name === templateName))?.type ?? "audio_effect",
      });

      const assistantId = assistantMsg.id;
      const tmpl = TEMPLATES.find(t => t.name === templateName);
      const deviceType: DeviceType = tmpl?.type ?? "audio_effect";

      try {
        const code = await fetchTemplateCode(templateName);
        const rewritten = rewriteSavePaths(code);

        if (abortController.signal.aborted) return;

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, status: "running" as const } : m))
        );

        const result = await runCode(rewritten);

        if (result.success && result.amxdBytes) {
          let patchData: PatchGraph | undefined;
          let warnings: ValidationIssue[] | undefined;
          try {
            const maxpat = extractMaxpat(result.amxdBytes);
            const validationResult = validatePatch(maxpat, deviceType);
            warnings = validationResult.issues.length > 0 ? validationResult.issues : undefined;
            patchData = parsePatchGraph(maxpat);
            // In M4L mode, send the patcher to Max for inline loading
            if (isM4LMode()) sendToMax(maxpat);
          } catch {
            // non-critical
          }

          const content = "Base template ready.";
          const iterationSummary = `Loaded the ${templateLabel} base template. Ready to customize — describe changes to refine it.`;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content,
                    code: rewritten,
                    iterationSummary,
                    amxdBytes: result.amxdBytes!,
                    patchData,
                    warnings,
                    status: "done",
                  }
                : m
            )
          );

          const generationId = await saveGeneration({
            promptId,
            pluginId: pluginId || undefined,
            llmResponse: content,
            extractedCode: rewritten,
            status: "success",
            validationIssues: warnings?.map(({ severity, code, message }) => ({ severity, code, message })),
          }).catch((e) => { console.warn("saveGeneration failed:", e); return ""; });

          let amxdStoragePath: string | undefined;
          if (generationId && auth.currentUser) {
            const userId = auth.currentUser.uid;
            try {
              amxdStoragePath = await uploadAmxd(userId, generationId, result.amxdBytes);
              updateGenerationStoragePath(userId, generationId, amxdStoragePath).catch(() => {});
              if (pluginId) {
                updatePlugin(pluginId, { status: "ready", amxdStoragePath, templateUsed: templateName }).catch(() => {});
              }
            } catch (err) {
              console.warn("Failed to upload template .amxd:", err);
            }
          }

          templateUsedRef.current = templateName;

          if (pluginId) {
            saveMessage(pluginId, {
              role: "assistant",
              content,
              code: rewritten,
              iterationSummary,
              warnings: warnings?.map(({ severity, code, message }) => ({ severity, code, message })),
              amxdStoragePath,
            }).catch((e) => console.warn("Failed to save assistant message:", e));
          }
        } else {
          const errorMsg = result.stderr || "Template build failed";
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, error: errorMsg, code: rewritten, status: "error" } : m))
          );
          if (pluginId) {
            saveMessage(pluginId, {
              role: "assistant",
              content: "",
              code: rewritten,
              error: errorMsg,
            }).catch((e) => console.warn("Failed to save assistant error:", e));
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const errorMsg = err instanceof Error ? err.message : "Template build failed";
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, error: errorMsg, status: "error" } : m))
        );
      } finally {
        if (abortControllerRef.current === abortController) {
          setIsLoading(false);
          abortControllerRef.current = null;
        }
      }
    },
    [runCode, pluginId]
  );

  const clearMessages = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setIsLoading(false);
    templateUsedRef.current = null;
  }, []);

  return { messages, isLoading, sendMessage, buildTemplate, clearMessages, historyLoaded };
}
