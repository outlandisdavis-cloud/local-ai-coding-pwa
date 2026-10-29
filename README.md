# Forge — Your local AI workspace

A local-first coding and agent harness for Linux Mint, built with Next.js, PostgreSQL, Drizzle, Monaco, and llama.cpp's OpenAI-compatible API.

## Included

- A self-hosted Monaco editor with syntax highlighting, completion, formatting, multiple tabs, file search, and autosave.
- Persistent projects and files, nested paths, project creation/renaming/deletion, and ZIP export.
- A live, origin-isolated HTML/CSS/JavaScript preview with responsive/mobile viewports, console capture, and an external preview window.
- JavaScript and Python execution, a Bash terminal, command history, output, cancellation, and persisted run history.
- Streaming AI chat with Agent, Ask, and Plan modes, current-file context, conversation history, and Markdown/code responses.
- Agent tools for listing/reading/writing project files and running saved code. Writes and execution require explicit approval by default.
- llama.cpp and OpenAI-compatible endpoint configuration, model discovery, API keys stored server-side, generation settings, and a Linux setup guide.
- An installable PWA, locally hosted editor assets/fonts, and an offline-cached app shell.

## Run on Linux Mint

Requirements: Node.js 20.9+ (Node.js 22 recommended), PostgreSQL 14+, and Python 3 for Python execution. Install llama.cpp separately for local inference.

1. Copy this project to your PC and install dependencies with `npm install`.
2. Create `.env` with your local database connection:

   `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db`

   Create the PostgreSQL database and use a role/password that you control. Do not use the example password for an exposed database.
3. Apply the schema with `npx drizzle-kit push`.
4. Build with `npm run build`.
5. Start, bound to your own machine, with `npm run start -- --hostname 127.0.0.1 --port 3000`.
6. Open **http://localhost:3000** in Chrome or Edge. The starter project is created automatically on the first request.

For development, use `npm run dev`. Keep the application bound to localhost in development as well.

## Connect llama.cpp

Download a llama.cpp Linux release from https://github.com/ggml-org/llama.cpp/releases, or build it from source. Download a GGUF model that fits your RAM/VRAM. A Qwen Coder instruct model is a useful starting point.

Start the server with a model and its native tool-calling template:

```sh
llama-server -m ./models/your-model.gguf \
  --host 127.0.0.1 --port 8080 \
  --jinja --ctx-size 16384
```

In Forge, open **Models**:

- Provider: **llama.cpp**
- API base URL: **http://127.0.0.1:8080/v1**
- API key: leave blank unless you configured `--api-key`
- Select **Test connection**, choose a discovered model, then **Save settings**.

The backend calls `GET /v1/models` and streaming `POST /v1/chat/completions`. Tool calling requires a compatible model and chat template. Ask mode works without tools. If your server is in a container, use an address reachable from the Forge server, not necessarily from your browser.

### Other OpenAI-compatible providers

Choose **OpenAI-compatible**, enter the provider's `/v1` base URL and exact model identifier, and provide an API key if required. Keys are saved in your local database and are never included in the client workspace payload. Alternatively set `LLAMA_API_KEY` or `OPENAI_API_KEY` in the server environment. Remote providers receive the conversation and file context you send; local-only privacy is not guaranteed when using a remote endpoint.

## Install as a PWA

Use Chrome/Edge's **Install Forge** / **Install page as app** menu item, or Forge's **Install app** button when the browser offers installation. HTTPS or localhost is required. Linux Mint can then launch Forge from its application menu.

The service worker caches the app shell, fonts, and Monaco assets. It never caches API responses, source-file APIs, or model conversations. The local Next.js server and PostgreSQL must be running for editing persistence, execution, and inference. An installed PWA is not a bundled native inference engine.

## Execution and safety

**This is a trusted-local developer tool, not a multi-user or public hosting service.** There is no built-in account/authentication layer. Keep Forge and PostgreSQL bound to localhost and do not expose the app to the internet.

JavaScript, Python, and shell commands execute on the machine running the Forge server with that server's OS permissions. Temporary project directories, a 15-second wall-clock timeout, CPU/file-size limits, output limits, and a reduced environment are provided, but **do not constitute an OS security sandbox**. Only execute trusted code. For untrusted agent output, retain approval mode and inspect proposed changes. Use a dedicated VM/container for stronger isolation.

Browser preview runs in an iframe with script permissions but without same-origin access to Forge. Relative CSS/JS files are resolved from your project. Preview code can still make network requests if you write code that does so. It supports plain HTML/CSS/JS, not a bundled React/TypeScript build pipeline. TypeScript editing is supported; transpile it before server execution.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Quick open files/actions | Ctrl K / Ctrl P |
| Save all files | Ctrl S |
| Run active file / refresh preview | Ctrl Enter |
| Workspace settings | Ctrl , |
| Send chat | Enter |
| New line in chat | Shift Enter |
| Recall terminal command | Up / Down |

## Structure

- `src/app/api/`: project, file, settings, runtime, execution, chat, and approval endpoints
- `src/lib/server/agent.ts`: streaming OpenAI-compatible agent loop and project tools
- `src/lib/server/execution.ts`: local process execution and resource limits
- `src/db/schema.ts`: Drizzle schema
- `src/components/`: editor, preview, assistant, settings, and workspace
- `public/monaco/`: locally served Monaco editor assets
- `public/sw.js` and `public/manifest.webmanifest`: PWA shell

No model weights are bundled. The app starts with an editable, runnable focus timer and accurately reports when no inference server is connected.

## Verification

The production app includes repeatable smoke tests:

- `node scripts/api-smoke-test.mjs` checks CRUD, model discovery, server-side API keys, streaming tool calls, approval/rejection, Ask/Plan modes, real execution, timeouts, and PWA assets against a running server at localhost:3000. It creates a temporary local mock model server and removes its test project afterward.
- `node scripts/browser-check.mjs` uses Playwright to check desktop/mobile rendering, Monaco editing, preview updates, Python/shell execution, settings, export, and offline support. Install its browser once with `npx playwright install --with-deps chromium`.

Run standard validation with `npx next typegen`, `npm exec tsc -- --noEmit`, and `npm run build`.
