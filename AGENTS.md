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
| `src/main/services/ai-service.ts` | Multi-provider AI (OpenAI, Anthropic, Google) via raw fetch |
| `src/main/services/store-service.ts` | SQLite persistence — clusters, favorites, settings, DLQ reviews |
| `src/main/ipc-handlers.ts` | All 43 IPC handler registrations |
| `src/renderer/src/stores/` | Zustand stores — clusterStore, dataStore, uiStore |
| `src/renderer/src/pages/` | 8 feature pages |
| `src/renderer/src/lib/mock-data.ts` | Demo mode mock data generators |
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
- Pages should never import from `@/lib/mock-data` directly. Use `useDataStore` which handles demo mode fallback internally.

### Styling

- Tailwind CSS v4 with custom theme properties defined in `src/renderer/src/index.css`.
- Dark mode is the default and only theme. Do not use `dark:` prefixes.
- Surface hierarchy: `surface-0` (darkest) → `surface-4` (lightest).
- Text hierarchy: `text-primary` → `text-secondary` → `text-muted`.
- Status colors: `success` (green), `warning` (amber), `danger` (red), `info` (blue), `accent` (indigo).
- Use Tailwind utility classes. Avoid inline styles except for dynamic values (e.g., colored dots from config).

### State Management

- `clusterStore` — Cluster configs, connections, active cluster, demo mode flag. Persists to SQLite via IPC.
- `dataStore` — All Kafka data (topics, messages, consumer groups, brokers, schemas, favorites). Handles demo mode fallback to mock data. All `fetch*` methods check `isDemoMode()`.
- `uiStore` — Navigation state, sidebar, command palette, notifications. Ephemeral.

### IPC Channels

Channels are namespaced: `domain:action` (e.g., `topics:list`, `messages:produce`, `ai:explain-message`). Every handler in `ipc-handlers.ts` wraps its service call in try/catch and returns the uniform response shape. When adding a new IPC channel:

1. Add the handler in `ipc-handlers.ts`
2. Add the corresponding method in `src/preload/index.ts`
3. Add the type signature in `src/renderer/src/env.d.ts`
4. Consume it in the appropriate store or page

### Demo Mode

The app supports a "demo mode" that activates when no real Kafka cluster is connected or when the IPC bridge is unavailable (e.g., running the renderer standalone). Mock data in `lib/mock-data.ts` provides realistic topics, messages, consumer groups, schemas, and DLQ entries. The `dataStore` checks `clusterStore.demoMode` before each fetch and uses mock generators as a fallback.

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
npx electron-rebuild -f -w better-sqlite3
unset ELECTRON_RUN_AS_NODE && npm run dev
```

Build artifacts are written to `apps/desktop/out/`. The renderer dev server runs on `localhost:5173` with Vite HMR.

## Dependencies of Note

| Package | Purpose | Where |
|---------|---------|-------|
| `kafkajs` | Kafka client (admin, consumer, producer) | Main process |
| `better-sqlite3` | Local SQLite database (native module, needs electron-rebuild) | Main process |
| `electron-vite` | Vite-based build tooling for Electron (main + preload + renderer) | Build |
| `zustand` | Lightweight state management | Renderer |
| `lucide-react` | Icon library | Renderer |
| `tailwindcss` v4 | Utility-first CSS with custom theme | Renderer |

## Testing Guidance

- When modifying IPC handlers or services, test with both a real Kafka cluster and in demo mode.
- When modifying pages, verify loading skeletons appear and data populates correctly.
- Destructive operations should always be tested against prod-labeled clusters to verify the double-confirmation flow.
- AI features require a valid API key in Settings; test the "not configured" state as well.
