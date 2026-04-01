# MaxPyLang Studio: Pyodide + Firebase Migration

**Date:** 2026-04-01
**Status:** Approved
**Goal:** Replace the server-side sandbox and Render backend with in-browser Python execution (Pyodide) and Firebase services, enabling unlimited concurrent users at near-zero infrastructure cost.

---

## High-Level Architecture

Three layers replace the current FastAPI + Render setup:

1. **Firebase Hosting** — serves the React + Vite frontend as static files.
2. **Browser runtime** — React handles UI, Pyodide handles Python execution.
3. **Firebase services** — Cloud Functions (LLM proxy), Auth, Firestore, Storage.

### Request Flow

```
User types prompt
  -> Cloud Function streams LLM response (SSE)
  -> Frontend extracts Python code from response
  -> Pyodide executes the code (maxpylang generates .amxd in virtual FS)
  -> JavaScript reads the file from Pyodide's virtual FS
  -> Browser triggers blob download
```

### What Gets Eliminated

- The entire FastAPI backend (`backend/` directory)
- Docker Compose, Render deployment (`docker-compose.yml`, `render.yaml`, `Dockerfile`)
- Server-side sandbox (`subprocess.run()`)
- Download endpoint (replaced by blob download)
- Template build endpoint (replaced by Pyodide execution)

---

## Pyodide Integration

### Initialization

On page load, the frontend initializes Pyodide and installs maxpylang:

```
Page load -> load Pyodide WASM (~20MB, cached by browser after first load)
          -> micropip.install("maxpylang")
          -> ready to execute
```

Cold start (~3-5s) happens while the user is reading the UI or typing. By the time the LLM responds, Pyodide is warm. Show a subtle progress indicator during init.

### maxpylang Compatibility

Verified compatible with Pyodide:

| Component | Compatible | Notes |
|---|---|---|
| Core API (`MaxPatch`, `place`, `connect`) | Yes | Pure Python |
| `.maxpat` save/load | Yes | `json` + `open()` on virtual FS |
| `.amxd` save/load | Yes | `struct` + `json` (all stdlib) |
| Object stubs (`objects/*.py`) | Yes | Pre-generated Python dicts |
| `import_objs()` | No | Uses `subprocess` — build-time only, never runs at runtime |
| NumPy | Not needed | Only used inside `import_objs()` |

### Code Execution Flow

1. Frontend receives full LLM response.
2. TypeScript `extractor` validates the code (same allowlist as current Python extractor: only `maxpylang`, `json`, `struct`, `numpy` imports; reject `eval`, `exec`, `__builtins__`).
3. TypeScript `pathRewriter` rewrites `.save()` calls to target `/output/device.amxd` in the virtual FS.
4. Code is passed to `pyodide.runPythonAsync(code)`.
5. Output file is read via `pyodide.FS.readFile("/output/device.amxd")`.
6. A `Blob` is created from the bytes and a browser download is triggered via `URL.createObjectURL()`.

### Error Handling

When Pyodide execution fails, the error is displayed to the user. No auto-retry — the user adjusts their prompt and tries again.

### Templates

The 11 existing templates are bundled as static assets (`.py` strings). Building a template = run the Python directly through Pyodide. No network call, no LLM. Instant and offline-capable.

---

## Cloud Function (LLM Proxy)

A single Gen 2 Cloud Function: `generateCode`.

### Responsibilities

- Receive: prompt, conversation history, model choice
- Read: `ANTHROPIC_API_KEY` from Google Secret Manager
- Call: Claude API with system prompt + few-shot examples + user messages
- Return: SSE stream of LLM chunks

No code extraction, no execution, no file handling. Stateless and pure I/O.

### Configuration

- **Runtime:** Gen 2 (supports 540s timeout for long LLM streams)
- **Memory:** 256MB (just proxying text)
- **Concurrency:** 1000 per instance (Gen 2 supports this)
- **Secrets:** `ANTHROPIC_API_KEY` via Google Secret Manager, deployed through GitHub Secrets in CI/CD

### Bundled Assets

System prompt and few-shot examples (currently in `backend/app/prompts/`) are bundled into the Cloud Function deployment package. They change infrequently, and bundling avoids a Firestore read on every request.

---

## Firestore Data Model

Two collections:

### `prompts/{promptId}`

Every user message, regardless of outcome. For collecting user data and understanding demand.

| Field | Type | Description |
|---|---|---|
| `uid` | string (nullable) | User ID (nullable until Auth is added) |
| `sessionId` | string | Browser session identifier |
| `prompt` | string | Raw user text |
| `model` | string | Model used (e.g., `claude-sonnet-4-20250514`) |
| `templateUsed` | string (nullable) | Template name if one was selected |
| `createdAt` | timestamp | When the prompt was sent |

### `generations/{generationId}`

Only when code is extracted and executed.

| Field | Type | Description |
|---|---|---|
| `promptId` | string | Reference to the prompt that triggered this |
| `uid` | string (nullable) | User ID |
| `llmResponse` | string | Full LLM response text |
| `extractedCode` | string | Validated Python code |
| `status` | string | `"success"` or `"error"` |
| `errorMessage` | string (nullable) | Pyodide error if failed |
| `amxdStoragePath` | string (nullable) | Firebase Storage path if saved |
| `createdAt` | timestamp | When the generation completed |

### Firebase Storage

```
generations/{generationId}/device.amxd
```

Optional — only populated if the user's .amxd is persisted (for re-download or sharing).

### Security Rules

Once Firebase Auth is added, rules enforce users can only read/write their own documents.

---

## Frontend Changes

### New Modules

| Module | Purpose |
|---|---|
| `hooks/usePyodide.ts` | Initialize Pyodide on mount, expose `runCode()`, track ready state |
| `lib/extractor.ts` | Port of Python `extractor.py` — extract code from LLM response, validate imports/safety |
| `lib/pathRewriter.ts` | Rewrite `.save()` paths to `/output/` in virtual FS |
| `lib/download.ts` | Read file from Pyodide FS, create Blob, trigger browser download |

### Removed Modules

- SSE logic in `api/client.ts` simplified — only talks to Cloud Function
- No more `/download`, `/templates/build`, or `/history` API calls

### Changed Flow (`useChat.ts`)

```
Current:  prompt -> SSE from backend -> backend runs code -> receive base64 .amxd
New:      prompt -> SSE from Cloud Function -> receive LLM text
            -> extract code locally -> run in Pyodide -> blob download
```

### Embedded Mode

The `?embedded=true` flag for the Ableton `jweb` plugin continues to work unchanged. `jweb` runs Chromium, so Pyodide and blob downloads function identically.

---

## Migration: Module Mapping

| Current Backend Module | New Location |
|---|---|
| `backend/app/core/sandbox.py` | `hooks/usePyodide.ts` |
| `backend/app/core/extractor.py` | `lib/extractor.ts` |
| `backend/app/core/llm.py` | Cloud Function |
| `backend/app/core/prompt.py` | Cloud Function (bundled prompts) |
| `backend/app/api/generate.py` | Cloud Function + frontend orchestration |
| `backend/app/api/download.py` | `lib/download.ts` (blob) |
| `backend/app/api/templates.py` | Pyodide runs templates directly |
| `backend/app/api/history.py` | Firestore SDK in frontend |
| `backend/app/models/firestore.py` | Firestore SDK in frontend |
| `backend/sandbox/amxd.py` | Bundled with maxpylang in Pyodide |

---

## Repo Structure (Post-Migration)

```
maxpy-studio/
├── frontend/              (React + Vite + Pyodide)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Chat.tsx
│   │   │   ├── ApiKeyInput.tsx    (removed — API key is server-side)
│   │   │   ├── Onboarding.tsx
│   │   │   └── HistorySidebar.tsx
│   │   ├── hooks/
│   │   │   ├── useChat.ts         (simplified)
│   │   │   ├── usePyodide.ts      (new)
│   │   │   └── useEmbedded.ts
│   │   ├── lib/
│   │   │   ├── extractor.ts       (new — ported from Python)
│   │   │   ├── pathRewriter.ts    (new)
│   │   │   └── download.ts        (new)
│   │   └── api/
│   │       └── client.ts          (simplified — Cloud Function only)
│   └── public/
│       └── templates/             (bundled .py template files)
├── functions/                     (single Cloud Function)
│   ├── src/
│   │   └── index.ts               (generateCode function)
│   ├── prompts/
│   │   ├── system_prompt.md
│   │   └── examples/
│   └── package.json
├── firebase.json
├── firestore.rules
├── storage.rules
└── .firebaserc
```

---

## Scaling Characteristics

| Component | Scales how | Limit |
|---|---|---|
| Pyodide execution | Each browser is its own compute | Unlimited, zero server cost |
| Cloud Function | Google auto-scales per request | 1000 concurrent/instance, auto-provisions more |
| Firebase Hosting | CDN-served static files | Effectively unlimited |
| Firestore | Google-managed | 10K writes/sec default |
| Firebase Storage | Google-managed | Unlimited |

**Primary cost driver:** Claude API usage, not infrastructure. The right cost curve — pay proportional to value delivered.

**Pyodide cold start:** ~3-5s on first load, ~20MB WASM download. Cached by browser after first visit. Mitigated by loading during UI interaction time.
