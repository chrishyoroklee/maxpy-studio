# MaxPy Studio

Generate Max for Live audio plugins from natural language prompts.

> "Make me a chorus effect with rate and depth knobs" → downloads a working `.amxd`

## How it works

1. Describe the plugin you want in plain English
2. Claude generates [maxpylang](https://github.com/chrishyoroklee/MaxPyLang) Python code via OpenRouter
3. The code runs in-browser via Pyodide to produce a `.amxd` file
4. A visual patch graph and syntax-highlighted code are displayed for inspection
5. Download and drag into Ableton Live

## Architecture

```
Browser (React + Vite)
  ├── Chat UI → sends prompt to Cloud Function
  ├── Cloud Function → calls OpenRouter (Claude) → streams response
  ├── Frontend extracts Python code + plugin description from response
  ├── Pyodide executes maxpylang code in-browser → produces .amxd bytes
  ├── .amxd is parsed → patch graph rendered with React Flow
  ├── .amxd uploaded to Firebase Storage for re-download
  └── User downloads .amxd
```

## Prerequisites

- **Node.js 20+**
- **Firebase CLI**: `npm install -g firebase-tools`
- **OpenRouter API key** (for LLM access to Claude)
- **Firebase project access**: You need to be added to the `maxpylang-studio` Firebase project
- **Ableton Live** with Max for Live (to use generated plugins)

## Local Development Setup

### 1. Install dependencies

```bash
cd frontend && npm install
cd ../functions && npm install
```

### 2. Environment files

**Frontend** (`frontend/.env`) — should already exist. If not, copy from `frontend/.env.example`:
```env
VITE_FUNCTIONS_BASE=http://127.0.0.1:5055/maxpylang-studio/us-central1
VITE_FIREBASE_API_KEY=AIzaSyB-PLAOGHtGbCnrusgoXROtlNqauL5D4fw
VITE_FIREBASE_AUTH_DOMAIN=maxpylang-studio.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=maxpylang-studio
VITE_FIREBASE_STORAGE_BUCKET=maxpylang-studio.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=206567485397
VITE_FIREBASE_APP_ID=1:206567485397:web:e4ea7da4099cee2430d75c
```

These are public Firebase client config values — not secrets.

**Functions** (`functions/.env.maxpylang-studio`) — rate limit config:
```env
RATE_LIMIT_PER_HOUR=20
RATE_LIMIT_UNAUTH_PER_HOUR=5
```

### 3. API key

The `OPENROUTER_API_KEY` is stored in Google Cloud Secret Manager. The local emulator can't pull it automatically, so you need to pass it as an environment variable:

```bash
OPENROUTER_API_KEY=sk-or-... firebase emulators:start
```

Get the key from a team member or fetch it yourself if you have GCP access:
```bash
gcloud secrets versions access latest --secret=OPENROUTER_API_KEY --project=maxpylang-studio
```

### 4. Start emulators (Terminal 1)

```bash
OPENROUTER_API_KEY=sk-or-... firebase emulators:start
```

This starts:
| Service | Port |
|---------|------|
| Auth | 9399 |
| Firestore | 8181 |
| Storage | 9599 |
| Functions | 5055 |
| Emulator UI | 4002 |

### 5. Start frontend dev server (Terminal 2)

```bash
cd frontend && npm run dev
```

Open **http://localhost:5173**

### Note on email verification

Email verification is required for password-based signups but doesn't work in the emulator (no real emails sent). The verification gate is automatically skipped in dev mode. You can also sign in with Google to bypass it entirely.

## Project Structure

```
maxpy-studio/
├── frontend/                   # React + Vite app
│   ├── src/
│   │   ├── components/         # Chat, CodePatchTabs, PatchGraph, Dashboard
│   │   ├── hooks/              # useChat, useAuth, usePyodide
│   │   ├── lib/                # extractor, patchGraphParser, firestore, storage
│   │   └── api/                # LLM streaming client
│   └── .env                    # Firebase client config
├── functions/                  # Firebase Cloud Functions
│   ├── src/index.ts            # generateCode function (LLM proxy)
│   └── prompts/
│       └── system_prompt.md    # System prompt for Claude
├── firestore.rules             # Firestore security rules (uid-scoped)
├── storage.rules               # Storage security rules
└── firebase.json               # Emulator & hosting config
```

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript
- **Code Execution**: Pyodide (in-browser Python) + maxpylang
- **Patch Visualization**: React Flow (node graph) + CodeMirror (syntax highlighting)
- **LLM**: Claude via OpenRouter API
- **Backend**: Firebase Cloud Functions (LLM proxy + rate limiting)
- **Database**: Firebase Firestore (uid-scoped security rules)
- **Storage**: Firebase Storage (persistent .amxd file storage)
- **Auth**: Firebase Auth (email/password + Google sign-in)

## Key Features

- **Auto-retry with error feedback**: Up to 5 attempts if code generation fails, with accumulated error history so the LLM doesn't repeat mistakes
- **Patch graph visualization**: Interactive node graph rendered from the generated .maxpat JSON
- **Python syntax highlighting**: CodeMirror with Python language support in the Code tab
- **Plugin description**: LLM generates a 2-3 sentence summary of each plugin
- **Template library**: Pre-built templates (Chorus, Reverb, Delay, etc.) for quick starts
- **Max for Live integration**: Embedded mode via jweb for in-Ableton use
- **Per-user rate limiting**: 20 generations/hour (configurable)

## Production Deployment

```bash
# Deploy functions
cd functions && npm run deploy

# Deploy frontend + rules
firebase deploy --only hosting,firestore,storage
```

The `OPENROUTER_API_KEY` secret is already configured in Google Cloud Secret Manager for production — no manual setup needed for deploys.

## License

MIT
