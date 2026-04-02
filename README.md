# MaxPyLang Studio

Generate Max for Live audio plugins from natural language prompts.

> "Make me a chorus effect with rate and depth knobs" → downloads a working `.amxd`

## How it works

1. Describe the plugin you want in plain English
2. An LLM (Claude or OpenAI) generates [maxpylang](https://github.com/chrishyoroklee/MaxPyLang) code
3. The code runs in-browser via Pyodide to produce a `.amxd` file
4. Download and drag into Ableton Live

## Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Cloud Functions (LLM proxy)

```bash
cd functions
npm install
firebase emulators:start --only functions
```

Open http://localhost:5173, enter your API key, and start generating.

## Requirements

- Node.js 18+
- An API key for Claude (Anthropic) or OpenAI
- Ableton Live with Max for Live to use generated plugins

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Code Execution**: Pyodide (in-browser Python) + maxpylang
- **LLM Proxy**: Firebase Cloud Functions
- **Database**: Firebase Firestore
- **LLM**: Claude / OpenAI via litellm
- **Audio**: maxpylang → .amxd (Max for Live)

## License

MIT
