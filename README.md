# V1

> An open-source, self-hosted alternative to [v0.dev](https://v0.app) — describe the web app you want in natural language, watch it come to life in a live preview, and iterate through chat.

![V1 banner](frontend/public/v1-logo.png)

## What is V1?

V1 is an AI-powered web app generator that runs on your own machine. You describe what you want in plain English ("a landing page for a coffee subscription with a hero, three pricing tiers, and a FAQ"), and an AI agent plans the work, writes the code into a per-project container, and shows you a live preview you can interact with while it's still building.

Every project runs in its own isolated Docker container, so you can spin up many apps in parallel without them stepping on each other. You keep full control of your code, your API key, and your data — nothing leaves your machine unless you choose to ship it.

**V1 is to v0 what [Ollama](https://ollama.com) is to ChatGPT**: same shape of product, but you bring the model and you run it yourself.

## Features

- **Natural language → working app** — describe what you want, get a Next.js (App Router) project scaffolded and filled in.
- **Live preview in an iframe** — see your app update in real time as the AI writes files. Hot-reload is built in.
- **Isolated project containers** — every project lives in its own Docker container on a dedicated port. Stop, start, delete without affecting the rest.
- **Iterate via chat** — the AI can read, write, rename, and delete files; install npm packages; and list project structure. All from the chat panel.
- **Bring your own model** — works with any OpenAI-compatible endpoint (OpenAI, Anthropic, OpenRouter, local Ollama, MiniMax, etc.). Just set `AI_BASE_URL` and `AI_API_KEY`.
- **Built-in design rules** — the system prompt ships with accessibility, touch target, performance, and responsive layout guidelines, so generated UIs are production-grade by default.
- **Markdown-aware chat** — assistant replies render tables, code blocks (collapsible by default), lists, and inline code.
- **Import / export** — pull in a project from a GitHub URL or a ZIP; export your work as a ZIP when you're done.
- **Community gallery** — browse and fork projects shared by other V1 users.

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
| AI integration   | Native OpenAI SDK v5 (function-calling / tool use)    |
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
│       └── community/             shared-project gallery
│
├── backend/                       Express API on Bun
│   └── src/
│       ├── routes/
│       │   ├── chat.ts            POST/GET /chat/:id/messages (SSE stream)
│       │   ├── containers.ts      project lifecycle, file CRUD, imports
│       │   └── models.ts          /models — list of supported models
│       ├── services/
│       │   ├── llm.ts             OpenAI tool-calling loop + SSE streaming
│       │   ├── tools.ts           tool definitions (read/write/rename/delete/list/install)
│       │   ├── project.ts         container spin-up, port allocation, recovery
│       │   ├── file.ts            in-container file ops
│       │   ├── package.ts         bun add wrapper
│       │   ├── import.ts          GitHub + ZIP importers
│       │   └── export.ts          ZIP exporter
│       └── utils/prompt.txt       system prompt with design rules
│
├── config.ts                      shared AI config (read by backend)
├── start.sh                       dev launcher (both servers in parallel)
└── data/                          runtime state (container metadata, etc.)
```

Each project is a clone of the [V1 Next.js template](https://github.com/ntegrals/december-nextjs-template) running in its own Docker container on a unique port (8000+). The backend writes files into the container and proxies requests as needed.

## How the AI loop works

1. You send a message.
2. The backend forwards the conversation history to your AI model, with the [tool definitions](backend/src/services/tools.ts) attached.
3. The model either returns text, or returns one or more `tool_calls` (`read_file`, `write_file`, `list_files`, etc.).
4. The backend executes each tool call against the project's container, appends the results, and asks the model for the next turn.
5. The loop continues (max 8 iterations) until the model returns a plain-text reply with no more tool calls.
6. Streaming is SSE-based: you see `tool_call` / `tool_result` / `assistant` events as they happen.

The system prompt in `backend/src/utils/prompt.txt` ships with five priority design rule categories — accessibility, touch targets, performance, style selection, and responsive layout — so generated UIs follow current best practices without you having to ask.

## API reference

See [`backend/src/routes/`](backend/src/routes) for the full surface. Highlights:

| Method | Endpoint                          | Purpose                          |
|--------|-----------------------------------|----------------------------------|
| GET    | `/containers`                     | List projects                    |
| POST   | `/containers/create`              | Create a new project             |
| POST   | `/containers/:id/start` / `stop`  | Toggle the project container     |
| DELETE | `/containers/:id`                 | Delete a project                 |
| GET    | `/containers/:id/files`           | List project files               |
| GET    | `/containers/:id/file?path=…`     | Read a file                      |
| PUT    | `/containers/:id/files`           | Write a file                     |
| DELETE | `/containers/:id/files?path=…`    | Delete a file                    |
| POST   | `/containers/:id/dependencies`    | `bun add` a package              |
| POST   | `/containers/import/github`       | Import from a GitHub URL         |
| POST   | `/containers/import/zip`          | Import from a ZIP upload         |
| GET    | `/containers/:id/export`          | Download project as ZIP          |
| POST   | `/chat/:id/messages`              | Send a chat message              |
| GET    | `/chat/:id/messages`              | Read chat history                |
| GET    | `/models`                         | List models your endpoint serves |

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
