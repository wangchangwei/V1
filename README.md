# December

A browser-based development platform that lets you create, manage, and deploy web applications through AI-powered conversations.

> This project is built upon the open-source foundation of [december](https://github.com/ntegrals/december). We are grateful to the original authors for their excellent work and dedication to open source.

## Features

- **AI-Powered Development** — Describe what you want to build in plain English, and let AI generate the code
- **Live Preview** — See your changes reflected in real-time with hot-reloading
- **Docker-based Isolation** — Each project runs in its own container for security and consistency
- **Full IDE in Browser** — Monaco-powered code editor with syntax highlighting and IntelliSense
- **File Management** — Create, edit, rename, and delete files through the UI or AI chat
- **Dependency Management** — Add packages via chat commands without leaving the browser
- **Project Import** — Import existing projects from GitHub or ZIP files
- **Project Export** — Download your project as a ZIP archive
- **Community Gallery** — Browse and explore projects shared by the community

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, Tailwind CSS 4, Monaco Editor |
| Backend | Express, Bun runtime |
| AI Integration | Cursor AI SDK |
| Containerization | Docker |
| Package Manager | Bun |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (latest)
- [Docker](https://docker.com) (running)
- Cursor AI CLI configured

### Installation

```bash
# Install backend dependencies
cd backend && bun install

# Install frontend dependencies
cd frontend && bun install
```

### Running the Project

**Backend:**
```bash
cd backend
bun run src/index.ts
```
API runs on `http://localhost:4002`

**Frontend:**
```bash
cd frontend
bun run dev
```
App runs on `http://localhost:3000`

**Or use the startup script:**
```bash
./start.sh
```

## Architecture

```
V1/
├── frontend/           # Next.js web application
│   └── src/app/
│       ├── projects/   # Project management UI
│       ├── create/     # AI chat interface
│       ├── editor/     # In-browser code editor
│       └── community/  # Community project gallery
├── backend/            # Express API server
│   └── src/
│       ├── routes/     # API endpoints
│       │   ├── chat.ts        # AI chat endpoints
│       │   └── containers.ts # Container/project management
│       └── services/  # Business logic
│           ├── llm.ts         # AI/LLM integration
│           ├── project.ts     # Project lifecycle
│           ├── file.ts        # File operations
│           ├── package.ts     # Dependency management
│           ├── export.ts      # Project export
│           └── import.ts      # Project import
├── config.ts           # Shared configuration
└── start.sh           # Startup script
```

## API Reference

### Container / Project Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/containers` | List all projects |
| POST | `/containers/create` | Create new project |
| POST | `/containers/:id/start` | Start a project container |
| POST | `/containers/:id/stop` | Stop a project container |
| DELETE | `/containers/:id` | Delete a project |
| GET | `/containers/:id/files` | List files in project |
| GET | `/containers/:id/file-tree` | Get project file tree |
| GET | `/containers/:id/file` | Read file content |
| PUT | `/containers/:id/files` | Write/update file |
| PUT | `/containers/:id/files/rename` | Rename file |
| DELETE | `/containers/:id/files` | Delete file |
| POST | `/containers/:id/dependencies` | Add dependency |
| POST | `/containers/import/github` | Import from GitHub |
| POST | `/containers/import/zip` | Import from ZIP |
| GET | `/containers/:id/export` | Export as ZIP |

### Chat / AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/chat/:id/messages` | Send message to AI (stream or blocking) |
| GET | `/chat/:id/messages` | Get chat history |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4002` | Backend API port |
| `AI_API_KEY` | — | Your AI provider API key (required) |
| `AI_BASE_URL` | `https://api.openai.com/v1` | AI provider base URL |
| `AI_MODEL` | `anthropic/claude-sonnet-4` | Model to use |
| `AI_TEMPERATURE` | `0.7` | Sampling temperature (0–2) |

## License

MIT
