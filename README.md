# MaxPyLang Studio

Generate Max for Live audio plugins from natural language prompts.

> "Make me a chorus effect with rate and depth knobs" → downloads a working `.amxd`

## How it works

1. Describe the plugin you want in plain English
2. An LLM (Claude or OpenAI) generates [maxpylang](https://github.com/chrishyoroklee/MaxPyLang) code
3. The code runs in a sandbox to produce a `.amxd` file
4. Download and drag into Ableton Live

## Quick Start

### Backend

```bash
cd backend
pip install -e .
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, enter your API key, and start generating.

## Requirements

- Python 3.11+
- Node.js 18+
- [maxpylang](https://github.com/chrishyoroklee/MaxPyLang) installed
- An API key for Claude (Anthropic) or OpenAI
- Ableton Live with Max for Live to use generated plugins

## Tech Stack

- **Backend**: FastAPI (Python)
- **Frontend**: React + Vite + TypeScript
- **Database**: Firebase Firestore
- **LLM**: Claude / OpenAI via litellm
- **Audio**: maxpylang → .amxd (Max for Live)

## License

MIT
