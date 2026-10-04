# KafkaLens — Agent Guidelines

## Project Overview

KafkaLens is an open-source macOS desktop application for managing, inspecting, and debugging Apache Kafka clusters. It is built as an Electron app with a React + TypeScript frontend and a Node.js backend that communicates with Kafka via KafkaJS.

## Architecture

### Monorepo Layout

- `apps/desktop/` — The main Electron application
- `packages/` — Shared libraries (kafka-client, schema-client, ai-layer, ui-components) with interfaces; implementations live in the main process services

### Process Model

The app follows Electron's multi-process architecture with strict context isolation:

- **Main process** (`src/main/`) — Node.js runtime. Owns all Kafka connections, SQLite database, and AI API calls. No direct DOM access.
- **Preload** (`src/preload/`) — Bridges main ↔ renderer via `contextBridge`. Exposes a typed `window.api` object. Never import application code here.
- **Renderer** (`src/renderer/`) — React UI. No Node.js APIs. Communicates exclusively through `window.api` IPC calls.

Data flows: **Renderer → IPC invoke → Main process service → IPC response → Renderer**

### Key Directories

| Path | Purpose |
|------|---------|
| `src/main/services/kafka-service.ts` | KafkaJS wrapper — connections, topics, messages, consumer groups, brokers |
| `src/main/services/schema-service.ts` | Confluent Schema Registry REST client |
| `src/main/services/ai-service.ts` | Multi-provider AI (OpenAI, Anthropic, Google Gemini) via raw fetch |
| `src/main/services/store-service.ts` | SQLite persistence — clusters, favorites, settings, DLQ reviews |
| `src/main/prompts/index.ts` | AI system prompts — all prompt templates in one editable file |
| `src/main/ipc-handlers.ts` | All 43 IPC handler registrations |
| `src/renderer/src/stores/` | Zustand stores — clusterStore, dataStore, uiStore |
| `src/renderer/src/pages/` | 9 feature pages |
| `src/renderer/src/lib/ai-guard.ts` | AI configuration check helper |
| `src/renderer/src/types/index.ts` | Shared TypeScript type definitions |

## Conventions

### TypeScript

- Strict mode enabled. No `any` unless absolutely necessary.
- Prefer `interface` for object shapes, `type` for unions and intersections.
- All IPC responses use the shape `{ success: boolean; data?: T; error?: string }`.
- Export types from `src/renderer/src/types/index.ts` — do not define inline types across files for shared concepts.

### React Components

- Functional components only. No class components.
- Use Zustand stores for shared state, `useState` for local-only UI state.
- Pages live in `src/renderer/src/pages/`. Layout and shared components in `src/renderer/src/components/`.
- Pages define their own sub-components (modals, table rows, etc.) within the same file when they're page-specific. Extract to `components/` only when shared across multiple pages.
- Data fetching goes through `useDataStore` which calls IPC methods on `window.api`.

### Styling

- Tailwind CSS v4 with custom theme properties defined in `src/renderer/src/index.css`.
- Dark mode is the default and only theme. Do not use `dark:` prefixes.
- Surface hierarchy: `surface-0` (darkest) → `surface-4` (lightest).
- Text hierarchy: `text-primary` → `text-secondary` → `text-muted`.
- Status colors: `success` (green), `warning` (amber), `danger` (red), `info` (blue), `accent` (indigo).
- Use Tailwind utility classes. Avoid inline styles except for dynamic values (e.g., colored dots from config).

### State Management

- `clusterStore` — Cluster configs, connections, active cluster. Persists to SQLite via IPC.
- `dataStore` — All Kafka data (topics, messages, consumer groups, brokers, schemas, favorites). All `fetch*` methods call `window.api` IPC and update store state on success.
- `uiStore` — Navigation state, sidebar, command palette, notifications. Ephemeral.

### IPC Channels

Channels are namespaced: `domain:action` (e.g., `topics:list`, `messages:produce`, `ai:explain-message`). Every handler in `ipc-handlers.ts` wraps its service call in try/catch and returns the uniform response shape. When adding a new IPC channel:

1. Add the handler in `ipc-handlers.ts`
2. Add the corresponding method in `src/preload/index.ts`
3. Add the type signature in `src/renderer/src/env.d.ts`
4. Consume it in the appropriate store or page

### AI Prompts

All AI system prompts are stored in `src/main/prompts/index.ts` as a `SYSTEM_PROMPTS` constant. This makes prompts easy to find, review, and edit without touching the AI service logic. The service imports prompts and pairs them with user context to form requests.

The AI service (`ai-service.ts`) supports three providers:
- **OpenAI** — uses `/v1/chat/completions` with `Authorization: Bearer` header
- **Anthropic** — uses `/v1/messages` with `x-api-key` header and `anthropic-version`
- **Google Gemini** — uses `generativelanguage.googleapis.com` with API key in query string

When adding a new AI feature:
1. Add the prompt to `src/main/prompts/index.ts`
2. Add the method to `ai-service.ts` that assembles the user prompt and calls `this.chat()`
3. Add the IPC handler in `ipc-handlers.ts`
4. Wire through preload and `env.d.ts`

### Error Handling

- Main process: Services throw errors; IPC handlers catch and return `{ success: false, error: message }`.
- Renderer: Stores check `.success` on IPC responses and call `uiStore.addNotification('error', message)` on failure.
- User-facing error messages should be actionable ("Could not connect to broker — check that the server is reachable") not technical ("ECONNREFUSED").

### Destructive Operations

- Topic deletion, offset resets, and schema version deletion require confirmation dialogs.
- For clusters labeled `prod`, these operations require the user to type the resource name to confirm.
- DLQ replay operations show confirmation before re-producing messages.

## Build & Run

```bash
npm install --ignore-scripts
node node_modules/electron/install.js
npm run check
unset ELECTRON_RUN_AS_NODE && npm run dev
```

Build artifacts are written to `apps/desktop/out/`. The renderer dev server runs on `localhost:5173` with Vite HMR.

## Dependencies of Note

| Package | Purpose | Where |
|---------|---------|-------|
| `kafkajs` | Kafka client (admin, consumer, producer) | Main process |
| `better-sqlite3` | Local SQLite database (native module, includes native prebuilds) | Main process |
| `electron-vite` | Vite-based build tooling for Electron (main + preload + renderer) | Build |
| `zustand` | Lightweight state management | Renderer |
| `lucide-react` | Icon library | Renderer |
| `tailwindcss` v4 | Utility-first CSS with custom theme | Renderer |
| `react-markdown` | Markdown rendering for AI responses | Renderer |

## Testing Guidance

- When modifying IPC handlers or services, test with a real Kafka cluster.
- When modifying pages, verify loading skeletons appear and data populates correctly.
- Destructive operations should always be tested against prod-labeled clusters to verify the double-confirmation flow.
- AI features require a valid API key in Settings; test the "not configured" state as well.

## PRD alignment

The previously listed feature gaps are implemented: partition inspection, lag trends, semantic topic search, optional anomaly monitoring, advanced message filters, timestamp seeking, message templates, schema field search, group exports, Keychain credentials, and broker history.

See README.md, docs/RELEASE.md, and docs/VALIDATION.md for validation, release instructions, and the remaining memory/release acceptance gates. Do not replace unavailable Kafka metadata with fabricated values: leader epochs, broker log directories, and offset commit timestamps are not exposed by KafkaJS. Signed distribution and live-provider testing require maintainer credentials.
