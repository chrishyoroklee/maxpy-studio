# Pyodide + Firebase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the server-side FastAPI backend with in-browser Pyodide execution and a single Firebase Cloud Function for LLM proxying.

**Architecture:** Frontend loads Pyodide WASM on page load, executes LLM-generated maxpylang code in-browser, and triggers blob downloads for .amxd files. A single Cloud Function proxies LLM requests using the project's API key from Secret Manager. Firestore stores prompts and generation history.

**Tech Stack:** React 19, Vite, TypeScript, Pyodide, Firebase (Hosting, Cloud Functions Gen 2, Firestore, Storage), Anthropic SDK

---

## Task 1: Firebase Project Setup

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc`
- Create: `firestore.rules`
- Create: `storage.rules`
- Create: `.github/workflows/deploy.yml` (placeholder for CI/CD later)

- [ ] **Step 1: Initialize Firebase config files**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
```

Create `firebase.json`:
```json
{
  "hosting": {
    "public": "frontend/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ]
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs20"
  },
  "firestore": {
    "rules": "firestore.rules"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

Create `.firebaserc`:
```json
{
  "projects": {
    "default": "maxpylang-studio"
  }
}
```

Create `firestore.rules`:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Prompts: anyone can write (auth comes later)
    match /prompts/{promptId} {
      allow read, write: if true;
    }
    // Generations: anyone can write (auth comes later)
    match /generations/{generationId} {
      allow read, write: if true;
    }
  }
}
```

Create `storage.rules`:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /generations/{generationId}/{fileName} {
      allow read: if true;
      allow write: if true;
    }
  }
}
```

- [ ] **Step 2: Commit Firebase config**

```bash
git add firebase.json .firebaserc firestore.rules storage.rules
git commit -m "feat: add Firebase project config (hosting, functions, firestore, storage)"
```

---

## Task 2: Cloud Function — LLM Proxy

**Files:**
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/src/index.ts`
- Create: `functions/prompts/system_prompt.md` (copy from `backend/app/prompts/system_prompt.md`)
- Create: `functions/prompts/examples/m4l_chorus.py` (copy from backend)
- Create: `functions/prompts/examples/m4l_tremolo.py` (copy from backend)

- [ ] **Step 1: Create functions directory and package.json**

```bash
mkdir -p functions/src functions/prompts/examples
```

Create `functions/package.json`:
```json
{
  "name": "maxpylang-studio-functions",
  "main": "lib/index.js",
  "scripts": {
    "build": "tsc",
    "serve": "npm run build && firebase emulators:start --only functions",
    "deploy": "firebase deploy --only functions"
  },
  "engines": {
    "node": "20"
  },
  "dependencies": {
    "firebase-admin": "^13.0.0",
    "firebase-functions": "^6.3.0",
    "@anthropic-ai/sdk": "^0.52.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

Create `functions/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "outDir": "lib",
    "sourceMap": true,
    "strict": true,
    "target": "es2022",
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "compileOnSave": true,
  "include": ["src"]
}
```

- [ ] **Step 2: Copy prompts from backend**

```bash
cp backend/app/prompts/system_prompt.md functions/prompts/system_prompt.md
cp backend/app/prompts/examples/m4l_chorus.py functions/prompts/examples/m4l_chorus.py
cp backend/app/prompts/examples/m4l_tremolo.py functions/prompts/examples/m4l_tremolo.py
```

- [ ] **Step 3: Write the Cloud Function**

Create `functions/src/index.ts`:
```typescript
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

// Load system prompt + examples at cold start
function buildSystemPrompt(): string {
  const promptsDir = path.join(__dirname, "..", "prompts");
  let system = fs.readFileSync(path.join(promptsDir, "system_prompt.md"), "utf-8");

  const examplesDir = path.join(promptsDir, "examples");
  if (fs.existsSync(examplesDir)) {
    const files = fs.readdirSync(examplesDir).filter(f => f.endsWith(".py")).sort();
    for (const file of files) {
      const name = path.basename(file, ".py");
      const code = fs.readFileSync(path.join(examplesDir, file), "utf-8");
      system += `\n\n## Complete Example: ${name}\n\`\`\`python\n${code}\`\`\`\n`;
    }
  }

  return system;
}

interface GenerateRequestBody {
  prompt: string;
  model?: string;
  messages?: { role: string; content: string }[];
  template?: string;
  templateCode?: string;
}

export const generateCode = onRequest(
  {
    secrets: [anthropicApiKey],
    timeoutSeconds: 300,
    memory: "256MiB",
    cors: true,
    maxInstances: 100,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    const body = req.body as GenerateRequestBody;
    if (!body.prompt) {
      res.status(400).send("Missing prompt");
      return;
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const systemPrompt = buildSystemPrompt();

    // Build user content, optionally injecting template
    let userContent = body.prompt;
    if (body.template && body.templateCode) {
      userContent =
        "Here is an existing working device code. Modify it based on my request below.\n" +
        "Keep the same save pattern (save_amxd). Output the complete modified Python code.\n\n" +
        "```python\n" + body.templateCode + "\n```\n\n" +
        "My modification request: " + body.prompt;
    }

    const messages: Anthropic.MessageParam[] = [
      ...(body.messages || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: userContent },
    ];

    const model = body.model || "claude-sonnet-4-20250514";

    try {
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });

      const stream = await client.messages.stream({
        model,
        max_tokens: 8192,
        temperature: 0.3,
        system: systemPrompt,
        messages,
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          const data = JSON.stringify({ type: "chunk", content: event.delta.text });
          res.write(`data: ${data}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : "LLM request failed";
      res.write(`data: ${JSON.stringify({ type: "error", content: message })}\n\n`);
      res.end();
    }
  }
);
```

- [ ] **Step 4: Install dependencies and verify build**

```bash
cd functions && npm install && npm run build
```

Expected: Build succeeds, `lib/index.js` is created.

- [ ] **Step 5: Commit Cloud Function**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
git add functions/
git commit -m "feat: add Cloud Function for LLM proxy (Anthropic SDK + SSE streaming)"
```

---

## Task 3: Frontend — Pyodide Hook

**Files:**
- Create: `frontend/src/hooks/usePyodide.ts`
- Modify: `frontend/package.json` (add pyodide types)

- [ ] **Step 1: Install pyodide**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio/frontend
npm install pyodide
```

- [ ] **Step 2: Create usePyodide hook**

Create `frontend/src/hooks/usePyodide.ts`:
```typescript
import { useState, useEffect, useRef, useCallback } from "react";
import { loadPyodide, PyodideInterface } from "pyodide";

interface PyodideState {
  ready: boolean;
  loading: boolean;
  error: string | null;
}

interface RunResult {
  success: boolean;
  stdout: string;
  stderr: string;
  amxdBytes: Uint8Array | null;
}

export function usePyodide() {
  const [state, setState] = useState<PyodideState>({
    ready: false,
    loading: true,
    error: null,
  });
  const pyodideRef = useRef<PyodideInterface | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const pyodide = await loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/",
        });

        await pyodide.loadPackage("micropip");
        const micropip = pyodide.pyimport("micropip");
        await micropip.install("maxpylang");

        // Create output directory in virtual FS
        pyodide.FS.mkdir("/output");

        if (!cancelled) {
          pyodideRef.current = pyodide;
          setState({ ready: true, loading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            ready: false,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load Pyodide",
          });
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const runCode = useCallback(async (code: string): Promise<RunResult> => {
    const pyodide = pyodideRef.current;
    if (!pyodide) {
      return { success: false, stdout: "", stderr: "Pyodide not ready", amxdBytes: null };
    }

    // Clean output directory
    try {
      const files = pyodide.FS.readdir("/output") as string[];
      for (const f of files) {
        if (f !== "." && f !== "..") {
          pyodide.FS.unlink(`/output/${f}`);
        }
      }
    } catch {
      // Directory might not exist yet
      try { pyodide.FS.mkdir("/output"); } catch { /* already exists */ }
    }

    // Write the amxd helper module into the virtual FS so `from amxd import save_amxd` works.
    // The amxd module is bundled with maxpylang — we just need to make it importable from /output.
    // We'll copy it from the maxpylang package location.
    await pyodide.runPythonAsync(`
import os, shutil, importlib
spec = importlib.util.find_spec("maxpylang.amxd")
if spec and spec.origin:
    shutil.copy2(spec.origin, "/output/amxd.py")
`);

    // Capture stdout/stderr
    let stdout = "";
    let stderr = "";

    pyodide.setStdout({ batched: (text: string) => { stdout += text + "\n"; } });
    pyodide.setStderr({ batched: (text: string) => { stderr += text + "\n"; } });

    try {
      await pyodide.runPythonAsync(code);

      // Look for .amxd file in /output
      let amxdBytes: Uint8Array | null = null;
      try {
        const files = pyodide.FS.readdir("/output") as string[];
        const amxdFile = files.find((f: string) => f.endsWith(".amxd"));
        if (amxdFile) {
          amxdBytes = pyodide.FS.readFile(`/output/${amxdFile}`) as Uint8Array;
        }
      } catch {
        // No .amxd found
      }

      return { success: !!amxdBytes, stdout, stderr, amxdBytes };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, stdout, stderr: stderr + "\n" + errorMsg, amxdBytes: null };
    }
  }, []);

  return { ...state, runCode };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio/frontend
npx tsc --noEmit
```

Expected: No type errors (or only pre-existing ones unrelated to usePyodide).

- [ ] **Step 4: Commit**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
git add frontend/src/hooks/usePyodide.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: add usePyodide hook for in-browser Python execution"
```

---

## Task 4: Frontend — Code Extractor and Path Rewriter

**Files:**
- Create: `frontend/src/lib/extractor.ts`
- Create: `frontend/src/lib/pathRewriter.ts`
- Create: `frontend/src/lib/download.ts`

- [ ] **Step 1: Create the code extractor**

Port of `backend/app/core/extractor.py` to TypeScript.

Create `frontend/src/lib/extractor.ts`:
```typescript
const ALLOWED_IMPORTS = /^(?:import maxpylang|from maxpylang[\s.].*|import maxpylang\s+as\s+\w+|import json|from amxd\s+import.*|import struct|import numpy|from numpy.*)$/;

const DANGEROUS_PATTERNS = [
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\bcompile\s*\(/,
  /\bgetattr\s*\(/,
  /\b__import__\b/,
  /\b__builtins__\b/,
  /\bglobals\s*\(/,
  /\blocals\s*\(/,
];

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

export function extractCode(llmResponse: string): string {
  const pattern = /```python\s*\n([\s\S]*?)```/g;
  const matches: string[] = [];
  let match;
  while ((match = pattern.exec(llmResponse)) !== null) {
    matches.push(match[1]);
  }

  if (matches.length === 0) {
    throw new ExtractionError(
      "No Python code block found in the response. Expected ```python ... ``` fence."
    );
  }

  // Use the longest code block (likely the main script)
  const code = matches.reduce((a, b) => (a.length >= b.length ? a : b)).trim();

  validate(code);
  return code;
}

function validate(code: string): void {
  // Check imports against allowlist
  for (const line of code.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("import ") || stripped.startsWith("from ")) {
      const importStmt = stripped.split("#")[0].trim();
      if (!ALLOWED_IMPORTS.test(importStmt)) {
        throw new ExtractionError(
          `Forbidden import: ${importStmt}. Only maxpylang, json, amxd, struct, and numpy imports are allowed.`
        );
      }
    }
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      throw new ExtractionError(
        `Generated code contains forbidden pattern: ${pattern.source}`
      );
    }
  }

  if (!code.includes("maxpylang")) {
    throw new ExtractionError("Generated code does not import maxpylang.");
  }

  if (!code.includes("MaxPatch")) {
    throw new ExtractionError("Generated code does not create a MaxPatch.");
  }

  if (!code.includes("plugout~") && !code.includes("midiout")) {
    throw new ExtractionError("Generated code has no M4L output (plugout~ or midiout).");
  }

  if (!code.includes(".save(") && !code.includes("save_amxd")) {
    throw new ExtractionError("Generated code does not save the patch.");
  }
}
```

- [ ] **Step 2: Create the path rewriter**

Create `frontend/src/lib/pathRewriter.ts`:
```typescript
/**
 * Rewrite file paths in generated code to use the Pyodide virtual FS output directory.
 */
export function rewriteSavePaths(code: string): string {
  // patch.save("anything.maxpat" ...) → patch.save("/output/device.maxpat" ...)
  code = code.replace(
    /\.save\(\s*(['"])([^'"]*\.maxpat)\1/g,
    '.save("/output/device.maxpat"'
  );

  // patch.save("anything.amxd" ...) → patch.save("/output/device.amxd" ...)
  code = code.replace(
    /\.save\(\s*(['"])([^'"]*\.amxd)\1/g,
    '.save("/output/device.amxd"'
  );

  // save_amxd(..., "anything.amxd" ...) → save_amxd(..., "/output/device.amxd" ...)
  code = code.replace(
    /save_amxd\(([^,]+),\s*(['"])([^'"]*\.amxd)\2/g,
    'save_amxd($1, "/output/device.amxd"'
  );

  // open("anything.maxpat", "w") → open("/output/device.maxpat", "w")
  code = code.replace(
    /open\(\s*(['"])([^'"]*\.maxpat)\1\s*,\s*(['"])w\3\)/g,
    'open("/output/device.maxpat", "w")'
  );

  return code;
}
```

- [ ] **Step 3: Create the download utility**

Create `frontend/src/lib/download.ts`:
```typescript
/**
 * Trigger a browser download from raw bytes.
 */
export function downloadBlob(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Trigger a browser download from a base64-encoded string.
 */
export function downloadBase64(b64: string, filename: string): void {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  downloadBlob(arr, filename);
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
git add frontend/src/lib/
git commit -m "feat: add code extractor, path rewriter, and download utils for in-browser execution"
```

---

## Task 5: Frontend — Update API Client

**Files:**
- Modify: `frontend/src/api/client.ts` (rewrite to call Cloud Function)

- [ ] **Step 1: Rewrite client.ts**

Replace the entire contents of `frontend/src/api/client.ts` with:

```typescript
const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE ?? "http://127.0.0.1:5001/maxpylang-studio/us-central1";

export interface GenerateEvent {
  type: "chunk" | "error" | "done";
  content?: string;
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
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio/frontend
npx tsc --noEmit
```

Expected: Type errors in files that still reference old exports (`getDownloadUrl`, `buildTemplate`, `streamGenerate`). These will be fixed in the next task.

- [ ] **Step 3: Commit**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
git add frontend/src/api/client.ts
git commit -m "feat: rewrite API client to call Cloud Function (LLM-only, no execution)"
```

---

## Task 6: Frontend — Bundle Templates as Static Assets

**Files:**
- Create: `frontend/public/templates/` (copy all 11 .py files from backend)
- Create: `frontend/src/lib/templates.ts`

- [ ] **Step 1: Copy template files**

```bash
mkdir -p /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio/frontend/public/templates
cp /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio/backend/app/prompts/templates/*.py \
   /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio/frontend/public/templates/
```

- [ ] **Step 2: Create templates module**

Create `frontend/src/lib/templates.ts`:
```typescript
export interface TemplateMeta {
  name: string;
  label: string;
  description: string;
  type: "audio_effect" | "instrument" | "midi_effect";
}

export const TEMPLATES: TemplateMeta[] = [
  { name: "m4l_chorus", label: "Chorus", description: "Stereo widening with rate & depth", type: "audio_effect" },
  { name: "m4l_tremolo", label: "Tremolo", description: "Amplitude modulation with sync", type: "audio_effect" },
  { name: "m4l_eq", label: "3-Band EQ", description: "Shape lows, mids & highs", type: "audio_effect" },
  { name: "m4l_reverb", label: "Reverb", description: "Room simulation with decay", type: "audio_effect" },
  { name: "m4l_stereo_delay", label: "Stereo Delay", description: "Echo with feedback", type: "audio_effect" },
  { name: "m4l_lofi", label: "Lo-Fi", description: "Bit reduction & aliasing", type: "audio_effect" },
  { name: "m4l_mono_synth", label: "Mono Synth", description: "Subtractive mono synthesizer", type: "instrument" },
  { name: "m4l_hihat", label: "Hi-Hat", description: "Drum synthesis hi-hat", type: "instrument" },
  { name: "m4l_distortion", label: "Distortion", description: "Tube screamer style overdrive", type: "audio_effect" },
  { name: "m4l_bass_synth", label: "Bass Synth", description: "Moog-inspired subtractive bass", type: "instrument" },
  { name: "m4l_compressor", label: "Compressor", description: "SSL-style bus compressor", type: "audio_effect" },
];

/**
 * Fetch a template's Python source code from the bundled static assets.
 */
export async function fetchTemplateCode(name: string): Promise<string> {
  const response = await fetch(`/templates/${name}.py`);
  if (!response.ok) {
    throw new Error(`Template ${name} not found`);
  }
  return response.text();
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
git add frontend/public/templates/ frontend/src/lib/templates.ts
git commit -m "feat: bundle device templates as static assets for client-side execution"
```

---

## Task 7: Frontend — Rewrite useChat Hook

**Files:**
- Modify: `frontend/src/hooks/useChat.ts`

This is the core orchestration change. The hook now: streams from Cloud Function → extracts code → rewrites paths → runs in Pyodide → produces blob.

- [ ] **Step 1: Rewrite useChat.ts**

Replace the entire contents of `frontend/src/hooks/useChat.ts` with:

```typescript
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
```

Key changes from the old version:
- `useChat` now takes `runCode` from `usePyodide` as a parameter
- `sendMessage` signature: `(prompt, model, template?)` — no `apiKey`
- Orchestrates: stream LLM → extract code → rewrite paths → Pyodide run → amxdBytes
- `ChatMessage.amxdBytes` replaces `amxdB64` and `generationId`

- [ ] **Step 2: Commit**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
git add frontend/src/hooks/useChat.ts
git commit -m "feat: rewrite useChat to orchestrate LLM stream + Pyodide execution"
```

---

## Task 8: Frontend — Rewrite App.tsx and Components

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Chat.tsx`
- Delete: `frontend/src/components/ApiKeyInput.tsx`
- Delete: `frontend/src/components/HistorySidebar.tsx` (history will use Firestore directly later)
- Modify: `frontend/src/components/Onboarding.tsx`
- Delete: `frontend/src/hooks/useApiKey.ts`

- [ ] **Step 1: Rewrite App.tsx**

Replace the entire contents of `frontend/src/App.tsx` with:

```typescript
import { Chat } from "./components/Chat";
import { Onboarding } from "./components/Onboarding";
import { useChat } from "./hooks/useChat";
import { useEmbedded } from "./hooks/useEmbedded";
import { usePyodide } from "./hooks/usePyodide";
import { useState } from "react";
import "./App.css";

function App() {
  const embedded = useEmbedded();
  const { ready, loading, error: pyodideError, runCode } = usePyodide();
  const { messages, isLoading, sendMessage } = useChat(runCode);
  const [onboarded, setOnboarded] = useState(() => {
    return embedded || sessionStorage.getItem("maxpy-onboarded") === "true";
  });

  const [model, setModel] = useState(
    () => sessionStorage.getItem("maxpy-model") ?? "claude-sonnet-4-20250514"
  );

  const handleModelChange = (m: string) => {
    setModel(m);
    sessionStorage.setItem("maxpy-model", m);
  };

  const handleSend = (prompt: string, template?: string) => {
    sendMessage(prompt, model, template);
  };

  const handleOnboarded = () => {
    setOnboarded(true);
    sessionStorage.setItem("maxpy-onboarded", "true");
  };

  if (!onboarded) {
    return (
      <div className="app">
        <Onboarding onComplete={handleOnboarded} />
      </div>
    );
  }

  return (
    <div className={`app ${embedded ? "embedded" : ""}`}>
      {!embedded && (
        <header className="header">
          <div className="header-left">
            <img src="/logo.webp" alt="" className="header-logo" />
            <h1>MaxPyLang Studio</h1>
          </div>
          <select
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            className="model-select"
          >
            <option value="claude-sonnet-4-20250514">Sonnet 4</option>
            <option value="claude-opus-4-20250514">Opus 4</option>
          </select>
        </header>
      )}
      <main className="main">
        {loading && (
          <div className="pyodide-loading">
            <div className="loading-bars"><span /><span /><span /></div>
            <span>Loading Python runtime...</span>
          </div>
        )}
        {pyodideError && (
          <div className="pyodide-error">
            Failed to load Python runtime: {pyodideError}
          </div>
        )}
        <Chat
          messages={messages}
          isLoading={isLoading}
          onSend={handleSend}
          pyodideReady={ready}
          embedded={embedded}
          model={model}
          setModel={handleModelChange}
          runCode={runCode}
        />
      </main>
    </div>
  );
}

export default App;
```

Key changes:
- No more `apiKey` / `useApiKey` — API key is server-side
- Pyodide loading state shown at top level
- Model selector replaces API key input in header
- `onboarded` state is simpler (no API key gate)

- [ ] **Step 2: Rewrite Chat.tsx**

Replace the entire contents of `frontend/src/components/Chat.tsx` with:

```typescript
import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../hooks/useChat";
import { downloadBlob } from "../lib/download";
import { fetchTemplateCode } from "../lib/templates";
import { rewriteSavePaths } from "../lib/pathRewriter";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (prompt: string, template?: string) => void;
  pyodideReady: boolean;
  embedded?: boolean;
  model?: string;
  setModel?: (model: string) => void;
  runCode: (code: string) => Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    amxdBytes: Uint8Array | null;
  }>;
}

const SUGGESTIONS = [
  { label: "Chorus", desc: "Stereo widening with rate & depth", prompt: "Add a feedback knob and make the color blue", template: "m4l_chorus" },
  { label: "Tremolo", desc: "Amplitude modulation", prompt: "Add a waveform selector (sine/square) and make the color green", template: "m4l_tremolo" },
  { label: "3-Band EQ", desc: "Shape lows, mids & highs", prompt: "Add a Q control for each band", template: "m4l_eq" },
  { label: "Lo-Fi", desc: "Bit reduction & aliasing", prompt: "Add a wet/dry mix knob", template: "m4l_lofi" },
  { label: "Reverb", desc: "Room simulation with decay", prompt: "Add a pre-delay knob and make the color purple", template: "m4l_reverb" },
  { label: "Delay", desc: "Stereo echo with feedback", prompt: "Add ping-pong stereo and a filter in the feedback loop", template: "m4l_stereo_delay" },
  { label: "Distortion", desc: "Overdrive & saturation", prompt: "Add a second distortion stage and make the color orange", template: "m4l_distortion" },
  { label: "Compressor", desc: "Bus glue & dynamics", prompt: "Add a ratio control and sidechain input", template: "m4l_compressor" },
  { label: "Mono Synth", desc: "Classic subtractive mono", prompt: "Add a filter envelope and a second oscillator (detuned saw)", template: "m4l_mono_synth" },
  { label: "Bass Synth", desc: "Moog-style sub bass", prompt: "Add a second saw oscillator detuned by 7 cents", template: "m4l_bass_synth" },
];

const MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Opus 4" },
];

interface TemplateBuild {
  status: "building" | "done" | "error";
  templateName: string;
  amxdBytes?: Uint8Array;
  error?: string;
}

export function Chat({ messages, isLoading, onSend, pyodideReady, embedded, model, setModel, runCode }: Props) {
  const [input, setInput] = useState("");
  const [templateBuild, setTemplateBuild] = useState<TemplateBuild | null>(null);
  const [customizeInput, setCustomizeInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTemplateBuild = async (templateName: string) => {
    setTemplateBuild({ status: "building", templateName });
    try {
      const code = await fetchTemplateCode(templateName);
      const rewritten = rewriteSavePaths(code);
      const result = await runCode(rewritten);
      if (result.success && result.amxdBytes) {
        setTemplateBuild({ status: "done", templateName, amxdBytes: result.amxdBytes });
      } else {
        setTemplateBuild({ status: "error", templateName, error: result.stderr || "Build failed" });
      }
    } catch (err) {
      setTemplateBuild({ status: "error", templateName, error: err instanceof Error ? err.message : "Build failed" });
    }
  };

  const handleCustomize = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customizeInput.trim() || !templateBuild) return;
    onSend(customizeInput.trim(), templateBuild.templateName);
    setCustomizeInput("");
    setTemplateBuild(null);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !pyodideReady) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.length === 0 && !templateBuild && (
          <div className="welcome">
            <h2>MaxPyLang Studio</h2>
            <p>Describe a plugin. Get an .amxd for Ableton.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  className="suggestion-card"
                  disabled={!pyodideReady}
                  onClick={() => handleTemplateBuild(s.template)}
                >
                  <span className="suggestion-label">{s.label}</span>
                  <span className="suggestion-desc">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {templateBuild && (
          <div className={embedded ? "embedded-status" : "message assistant"}>
            {templateBuild.status === "building" && (
              <div className={embedded ? "" : "message-content"}>
                <div className="loading-indicator">
                  <div className="loading-bars"><span /><span /><span /></div>
                  <span>Building...</span>
                </div>
              </div>
            )}
            {templateBuild.status === "done" && templateBuild.amxdBytes && (
              <div className="template-result">
                <div className="template-result-header">
                  <span className="template-result-label">Base template ready</span>
                  <button
                    className="download-button"
                    onClick={() => downloadBlob(templateBuild.amxdBytes!, "device.amxd")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download .amxd
                  </button>
                </div>
                {!embedded && (
                  <form className="template-customize" onSubmit={handleCustomize}>
                    <label className="template-customize-label">Want to customize?</label>
                    <div className="input-wrapper">
                      <input
                        type="text"
                        value={customizeInput}
                        onChange={(e) => setCustomizeInput(e.target.value)}
                        placeholder="e.g. Add a feedback knob, change color to blue..."
                        className="chat-input"
                        style={{ minHeight: "auto" }}
                      />
                      <button
                        type="submit"
                        disabled={!customizeInput.trim() || isLoading}
                        className="send-button"
                        aria-label="Customize"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </button>
                    </div>
                  </form>
                )}
                <button className="template-back" onClick={() => { setTemplateBuild(null); setCustomizeInput(""); }}>
                  Back to presets
                </button>
              </div>
            )}
            {templateBuild.status === "error" && (
              <div className={embedded ? "" : "message-content"}>
                <span style={{ color: "var(--error)" }}>Error: {templateBuild.error}</span>
                <button className="download-button" style={{ marginLeft: 8, background: "transparent", color: "var(--text-secondary)", boxShadow: "none", border: "1px solid var(--border-default)" }} onClick={() => setTemplateBuild(null)}>
                  Back
                </button>
              </div>
            )}
          </div>
        )}

        {embedded ? (
          <>
            {(() => {
              const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
              if (isLoading) return (
                <div className="embedded-status">
                  <div className="loading-bars"><span /><span /><span /></div>
                  <span className="embedded-status-text">Creating...</span>
                </div>
              );
              if (lastAssistant?.error) return (
                <div className="embedded-status">
                  <span style={{ color: "var(--error)" }}>Error: {lastAssistant.error}</span>
                </div>
              );
              if (lastAssistant?.amxdBytes) return (
                <div className="embedded-status">
                  <span className="embedded-status-success">Created!</span>
                  <button
                    className="download-button"
                    onClick={() => downloadBlob(lastAssistant.amxdBytes!, "device.amxd")}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download .amxd
                  </button>
                </div>
              );
              return null;
            })()}
          </>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.role}`}>
                <div className="message-role">
                  {msg.role === "user" ? "You" : "Studio"}
                </div>
                <div className="message-content">
                  {msg.content}
                  {msg.error && (
                    <div className="message-error">{msg.error}</div>
                  )}
                  {msg.amxdBytes && (
                    <button
                      className="download-button"
                      onClick={() => downloadBlob(msg.amxdBytes!, "device.amxd")}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download .amxd
                    </button>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="loading-indicator">
                <div className="loading-bars">
                  <span /><span /><span />
                </div>
                <span>Generating...</span>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={pyodideReady ? "Describe the plugin you want..." : "Loading Python runtime..."}
            disabled={!pyodideReady || isLoading}
            rows={1}
            className="chat-input"
          />
          {embedded && (
            <select
              value={model ?? "claude-sonnet-4-20250514"}
              onChange={(e) => setModel?.(e.target.value)}
              className="model-select embedded-model-select"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          )}
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !pyodideReady}
            className="send-button"
            aria-label="Generate"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite Onboarding.tsx**

Replace the entire contents of `frontend/src/components/Onboarding.tsx` with:

```typescript
interface Props {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: Props) {
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <img src="/logo.webp" alt="" className="onboarding-logo" />
        <h1 className="onboarding-title">MaxPyLang Studio</h1>
        <p className="onboarding-subtitle">
          Generate Max for Live plugins from text descriptions.
          Powered by AI — runs entirely in your browser.
        </p>
        <button className="onboarding-button" onClick={onComplete}>
          Get Started
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Delete removed files**

```bash
rm /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio/frontend/src/components/ApiKeyInput.tsx
rm /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio/frontend/src/components/HistorySidebar.tsx
rm /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio/frontend/src/hooks/useApiKey.ts
```

- [ ] **Step 5: Verify build**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio/frontend
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
git add -A frontend/src/
git commit -m "feat: rewrite App, Chat, Onboarding for Pyodide + remove API key UI"
```

---

## Task 9: Frontend — Firestore Integration

**Files:**
- Create: `frontend/src/lib/firestore.ts`
- Modify: `frontend/src/hooks/useChat.ts` (add Firestore persistence)

- [ ] **Step 1: Install Firebase SDK**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio/frontend
npm install firebase
```

- [ ] **Step 2: Create Firebase config and Firestore module**

Create `frontend/src/lib/firebase.ts`:
```typescript
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
```

Create `frontend/src/lib/firestore.ts`:
```typescript
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

function getSessionId(): string {
  let id = sessionStorage.getItem("maxpy-session-id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("maxpy-session-id", id);
  }
  return id;
}

export async function savePrompt(data: {
  prompt: string;
  model: string;
  templateUsed?: string;
}): Promise<string> {
  const docRef = await addDoc(collection(db, "prompts"), {
    ...data,
    uid: null, // until Auth is added
    sessionId: getSessionId(),
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function saveGeneration(data: {
  promptId: string;
  llmResponse: string;
  extractedCode: string;
  status: "success" | "error";
  errorMessage?: string;
}): Promise<string> {
  const docRef = await addDoc(collection(db, "generations"), {
    ...data,
    uid: null,
    amxdStoragePath: null,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
```

- [ ] **Step 3: Add Firestore calls to useChat**

In `frontend/src/hooks/useChat.ts`, add persistence calls. Add imports at the top:

```typescript
import { savePrompt, saveGeneration } from "../lib/firestore";
```

Inside `sendMessage`, after setting `isLoading(true)`, add prompt logging:

```typescript
// Log prompt to Firestore (fire and forget)
const promptId = await savePrompt({ prompt, model, templateUsed: template }).catch(() => "");
```

After the Pyodide execution result block, add generation logging. After the success branch (`setMessages` with `amxdBytes`):

```typescript
saveGeneration({
  promptId,
  llmResponse: fullResponse,
  extractedCode: rewritten,
  status: "success",
}).catch(() => {});
```

After the error branch:

```typescript
saveGeneration({
  promptId,
  llmResponse: fullResponse,
  extractedCode: code ?? "",
  status: "error",
  errorMessage: result.stderr,
}).catch(() => {});
```

- [ ] **Step 4: Create .env.example for frontend Firebase config**

Create `frontend/.env.example`:
```
VITE_FUNCTIONS_BASE=http://127.0.0.1:5001/maxpylang-studio/us-central1
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=maxpylang-studio
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

- [ ] **Step 5: Commit**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
git add frontend/src/lib/firebase.ts frontend/src/lib/firestore.ts frontend/src/hooks/useChat.ts frontend/package.json frontend/package-lock.json frontend/.env.example
git commit -m "feat: add Firestore integration for prompt and generation logging"
```

---

## Task 10: Vite Config — Configure for Pyodide

**Files:**
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Update Vite config for Pyodide WASM support**

Pyodide loads from CDN so no special WASM bundling is needed, but we need to exclude it from dependency optimization and configure headers for SharedArrayBuffer (needed by Pyodide for threading).

Replace `frontend/vite.config.ts` with:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["pyodide"],
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
```

- [ ] **Step 2: Commit**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
git add frontend/vite.config.ts
git commit -m "feat: configure Vite for Pyodide (exclude from optimizeDeps, COOP/COEP headers)"
```

---

## Task 11: Delete Backend

**Files:**
- Delete: `backend/` (entire directory)
- Delete: `docker-compose.yml`
- Delete: `render.yaml`

- [ ] **Step 1: Remove backend and deployment files**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
rm -rf backend/
rm -f docker-compose.yml render.yaml
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove FastAPI backend, Docker, and Render config (replaced by Pyodide + Firebase)"
```

---

## Task 12: End-to-End Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Start Firebase emulator and frontend**

Terminal 1:
```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
firebase emulators:start --only functions,firestore
```

Terminal 2:
```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio/frontend
npm run dev
```

- [ ] **Step 2: Set the Anthropic API key for the Cloud Function**

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

Enter your API key when prompted.

- [ ] **Step 3: Test template build (no LLM)**

1. Open http://localhost:5173
2. Click "Get Started" on onboarding
3. Wait for "Loading Python runtime..." to disappear
4. Click the "Chorus" suggestion card
5. Verify: loading indicator appears, then "Base template ready" with download button
6. Click "Download .amxd"
7. Verify: `device.amxd` downloads and can be opened in Max

- [ ] **Step 4: Test LLM generation**

1. Type "Make me a simple tremolo effect with a speed knob"
2. Verify: LLM response streams in, code is extracted, Pyodide executes it
3. Verify: Download button appears, .amxd downloads successfully

- [ ] **Step 5: Test error display**

1. Type something that will produce invalid code (e.g., "make me a JavaScript program")
2. Verify: Error is displayed to the user, no crash

- [ ] **Step 6: Commit any fixes from smoke test**

```bash
cd /Users/hyorok/Desktop/MSCS/MaxPy/maxpy-studio
git add -A
git commit -m "fix: smoke test fixes from end-to-end testing"
```
