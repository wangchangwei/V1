# V1

**English** | [简体中文](README.zh-CN.md)

> An open-source, self-hosted alternative to [v0.dev](https://v0.app) — describe the web app you want in natural language, watch it come to life in a live preview, and iterate through chat.

## Screenshots

| Home — project list & prompt | Workspace — AI chat + live preview |
|-------------------------------|-------------------------------------|
| ![V1 home](.assets/home.png)  | ![V1 editor](.assets/editor.png)    |

## What is V1?

V1 is an AI-powered web app generator that runs on your own machine. You describe what you want in plain English ("a landing page for a coffee subscription with a hero, three pricing tiers, and a FAQ"), and an AI agent plans the work, writes the code into a per-project container, and shows you a live preview you can interact with while it's still building.

Every project runs in its own isolated Docker container, so you can spin up many apps in parallel without them stepping on each other. You keep full control of your code, your API key, and your data — nothing leaves your machine unless you choose to ship it.

**V1 is to v0 what [Ollama](https://ollama.com) is to ChatGPT**: same shape of product, but you bring the model and you run it yourself.

## Features

- **Natural language → working app** — describe what you want, get a Next.js (App Router) project scaffolded and filled in.
- **Live preview in an iframe** — see your app update in real time as the AI writes files. Hot-reload is built in.
- **Isolated project containers** — every project lives in its own Docker container on a dedicated port. Stop, start, delete without affecting the rest.
- **Iterate via chat** — the AI can read, write, rename, and delete files; install npm packages; and list project structure. All from the chat panel.
- **Built-in design rules** — the system prompt ships with accessibility, touch target, performance, and responsive layout guidelines, so generated UIs are production-grade by default.
- **Markdown-aware chat** — assistant replies render tables, code blocks (collapsible by default), lists, and inline code.
- **Import / export** — pull in a project from a GitHub URL or a ZIP; export your work as a ZIP when you're done.
- **Community gallery** — browse and fork projects shared by other V1 users.
- **Style Gallery** — pick a visual style (glassmorphism, brutalism, neumorphism, etc.) before generating.
- **Templates** — start from a curated project template instead of a blank slate.
- **Edit & Regenerate** — edit a past message and the AI re-generates from that point with full filesystem snapshot recovery.
- **Deploy to Vercel** — ship your project to Vercel with a single click directly from the workspace.
- **Multi-client SSE** — open the same project in multiple tabs; all receive the same live streaming events with automatic reconnect recovery.

## Quick Start

You'll need [Bun](https://bun.sh) (≥ 1.1) and [Docker](https://docker.com) running. Node 20+ also works if you'd rather use `npm`/`pnpm`.

### 1. Clone and install

```bash
git clone https://github.com/wangchangwei/V1.git
cd V1

# Backend
cd backend && bun install && cd ..

# Frontend
cd frontend && bun install && cd ..
```

### 2. Configure the AI backend

V1 talks to any OpenAI-compatible API. The two most common setups:

**OpenAI (default):**
```bash
cp backend/.env.example backend/.env  # if you have an example; otherwise just create it
cat > backend/.env <<'EOF'
AI_API_KEY=sk-...
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o
AI_TEMPERATURE=0.7
EOF
```

**Anthropic via OpenAI-compatible proxy** (e.g. through LiteLLM, or `api.minimaxi.com`):
```bash
cat > backend/.env <<'EOF'
AI_API_KEY=sk-ant-...
AI_BASE_URL=https://api.minimaxi.com/v1
AI_MODEL=MiniMax-M3
AI_TEMPERATURE=0.7
EOF
```

The backend auto-appends `/v1` if your `AI_BASE_URL` doesn't include a version segment, so both `https://api.openai.com` and `https://api.openai.com/v1` work.

### 3. Start the dev servers

Open two terminals, or use the included script:

```bash
./start.sh
```

Or run them separately:

```bash
# Terminal 1 — backend (port 4002)
cd backend && bun run start

# Terminal 2 — frontend (port 3000)
cd frontend && bun run dev
```

Then open <http://localhost:3000>.

### 4. Build something

Click **"New Project"**, type a prompt like:

> A SaaS landing page for an AI note-taking app. Dark theme, hero with email signup, three feature cards, a pricing section with two tiers, and a footer. Use shadcn/ui and lucide-react.

Watch the chat panel on the left as the AI plans the work, calls tools, and writes files. The preview on the right updates live. Ask follow-up questions ("make the hero taller", "swap the CTA color to emerald") to iterate.

## Tech Stack

| Layer            | Choice                                                |
|------------------|-------------------------------------------------------|
| Frontend         | Next.js 15 (App Router), React 19, Tailwind CSS 4     |
| Code editor      | Monaco                                                |
| Markdown         | react-markdown + remark-gfm                           |
| Backend          | Express on the Bun runtime                            |
| AI agent         | PI Agent sidecar (Docker) + OpenAI-compatible API      |
| Containerization | Docker (one container per project)                    |
| Package manager  | Bun                                                   |

## Architecture

```
V1/
├── frontend/                      Next.js 15 web app
│   └── src/app/
│       ├── projects/              project list, cards, workspace dashboard
│       ├── create/                AI chat interface for generating new apps
│       ├── editor/                in-browser file editor (Monaco)
│       ├── templates/             curated project templates
│       └── community/             shared-project gallery
│
├── backend/                       Express API on Bun
│   └── src/
│       ├── routes/
│       │   ├── chat.ts            POST/GET/PATCH /chat/:id/messages
│       │   ├── containers.ts     project lifecycle, file CRUD, imports
│       │   ├── deploy.ts         Vercel deployment
│       │   └── turnStream.ts     SSE broadcaster for multi-client sync
│       ├── services/
│       │   ├── piProxy.ts        PI Agent sidecar proxy (chat streaming)
│       │   ├── piContainerManager.ts  PI sidecar lifecycle
│       │   ├── turnBroadcaster.ts    SSE broadcast fan-out to all clients
│       │   ├── chatSessions.ts   session history + message store
│       │   ├── snapshots.ts      filesystem snapshots for edit/recover
│       │   ├── locks.ts          per-project mutex
│       │   ├── project.ts        container spin-up, port allocation, recovery
│       │   ├── file.ts           in-container file ops
│       │   ├── package.ts         bun add wrapper
│       │   ├── import.ts         GitHub + ZIP importers
│       │   └── export.ts         ZIP exporter
│       └── pi-http-entry.ts       HTTP entry for PI sidecar
│
├── template/                      vendored Next.js project template (scaffold)
├── config.ts                      shared AI config (read by backend)
├── start.sh                       dev launcher (both servers in parallel)
└── data/                          runtime state (container metadata, etc.)
```

Each project is instantiated from the vendored `template/` directory (Next.js + shadcn/ui), running in its own Docker container on a unique port (8000+). The backend writes files into the container and proxies requests as needed.

## How the AI loop works

1. You send a message.
2. The backend proxies the conversation to the **PI Agent** sidecar (a Docker container running the coding agent) over HTTP streaming.
3. The PI Agent executes tool calls (read/write/list files, install packages, etc.) against the project container and streams SSE events back.
4. The backend fan-outs those events to **all connected clients** via `TurnBroadcaster`, so every open tab sees the same live output.
5. On page reload, the client re-subscribes to the in-progress turn and recovers state automatically from the broadcaster.
6. The `PATCH /chat/:id/messages/:id` endpoint lets you edit a past user message — the backend restores the filesystem to that message's snapshot and re-streams the AI's response from that point.

Streaming is SSE-based: you see `tool_call` / `tool_result` / `assistant` / `done` / `error` events as they happen. The system prompt ships with five priority design rule categories — accessibility, touch targets, performance, style selection, and responsive layout.

## API reference

See [`backend/src/routes/`](backend/src/routes) for the full surface. Highlights:

| Method | Endpoint                               | Purpose                              |
|--------|----------------------------------------|--------------------------------------|
| GET    | `/containers`                          | List projects                        |
| POST   | `/containers/create`                  | Create a new project                 |
| POST   | `/containers/:id/start` / `stop`       | Toggle the project container         |
| DELETE | `/containers/:id`                     | Delete a project                     |
| GET    | `/containers/:id/files`                | List project files                   |
| GET    | `/containers/:id/file?path=…`          | Read a file                         |
| PUT    | `/containers/:id/files`                | Write a file                        |
| DELETE | `/containers/:id/files?path=…`         | Delete a file                       |
| POST   | `/containers/:id/dependencies`         | `bun add` a package                 |
| POST   | `/containers/import/github`            | Import from a GitHub URL             |
| POST   | `/containers/import/zip`                | Import from a ZIP upload            |
| GET    | `/containers/:id/export`               | Download project as ZIP             |
| POST   | `/chat/:id/messages`                   | Send a chat message (JSON or SSE)  |
| GET    | `/chat/:id/messages`                  | Read chat history                   |
| PATCH  | `/chat/:id/messages/:mid`             | Edit a message & regenerate         |
| GET    | `/chat/:id/turn-stream`               | SSE subscription for live events    |
| POST   | `/deploy/:id`                          | Deploy project to Vercel            |

## Environment variables

All configuration lives in `backend/.env`:

| Variable          | Default                    | Description                                              |
|-------------------|----------------------------|----------------------------------------------------------|
| `PORT`            | `4002`                     | Backend API port                                         |
| `AI_API_KEY`      | —                          | API key for your AI provider (required)                  |
| `AI_BASE_URL`     | `https://api.openai.com/v1`| OpenAI-compatible base URL (`/v1` auto-appended if missing) |
| `AI_MODEL`        | `gpt-4o`                   | Model identifier passed to the provider                  |
| `AI_TEMPERATURE`  | `0.7`                      | Sampling temperature (0–2)                               |

## License

MIT.

## Acknowledgements

V1 is built on the shoulders of [December](https://github.com/ntegrals/december), an open-source AI web app generator. December provided the core architecture — the per-project Docker container model, the file-system-as-tool-call interface, the chat-driven workflow, and the Next.js template. V1 keeps that foundation and adds a native OpenAI tool-calling refactor, a streaming-first chat backend, a markdown-aware message renderer, and a built-in design-rules system prompt.

Thanks to the December team for open-sourcing their work. If you're evaluating V1 for production use, you should also look at the upstream project — it's a great read and a solid base to fork from.
