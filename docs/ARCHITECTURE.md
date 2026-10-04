# KafkaLens architecture

KafkaLens is an Electron application with a React and TypeScript UI, a Node.js main process, and KafkaJS connectivity. The following describes the current implementation; the [product requirements](PRD.md) also contain planned capabilities.

## Monorepo layout

- `apps/desktop/` — The main Electron application
- `packages/` — Shared libraries (kafka-client, schema-client, ai-layer, ui-components) with interfaces; implementations live in the main process services

## Process model

The app follows Electron's multi-process architecture with strict context isolation:

- **Main process** (`apps/desktop/src/main/`) — Node.js runtime. Owns all Kafka connections, SQLite database, and AI API calls. No direct DOM access.
- **Preload** (`apps/desktop/src/preload/`) — Bridges main ↔ renderer via `contextBridge`. Exposes a typed `window.api` object. Never import application code here.
- **Renderer** (`apps/desktop/src/renderer/`) — React UI. No Node.js APIs. Communicates exclusively through `window.api` IPC calls.

Data flows: **Renderer → IPC invoke → Main process service → IPC response → Renderer**

## Key directories

| Path | Purpose |
|------|---------|
| `apps/desktop/src/main/services/kafka-service.ts` | KafkaJS wrapper — connections, topics, messages, consumer groups, brokers |
| `apps/desktop/src/main/services/schema-service.ts` | Confluent Schema Registry REST client |
| `apps/desktop/src/main/services/ai-service.ts` | Multi-provider AI (OpenAI, Anthropic, Google Gemini) via raw fetch |
| `apps/desktop/src/main/services/store-service.ts` | SQLite persistence — clusters, favorites, settings, DLQ reviews |
| `apps/desktop/src/main/prompts/index.ts` | AI system prompts — all prompt templates in one editable file |
| `apps/desktop/src/main/ipc-handlers.ts` | IPC handler registrations |
| `apps/desktop/src/renderer/src/stores/` | Zustand stores — clusterStore, dataStore, uiStore |
| `apps/desktop/src/renderer/src/pages/` | Feature pages |
| `apps/desktop/src/renderer/src/lib/ai-guard.ts` | AI configuration check helper |
| `apps/desktop/src/renderer/src/types/index.ts` | Shared TypeScript type definitions |

## Dependencies

| Package | Purpose | Where |
|---------|---------|-------|
| `kafkajs` | Kafka client (admin, consumer, producer) | Main process |
| `better-sqlite3` | Local SQLite database (native module, includes native prebuilds) | Main process |
| `electron-vite` | Vite-based build tooling for Electron (main + preload + renderer) | Build |
| `zustand` | Lightweight state management | Renderer |
| `lucide-react` | Icon library | Renderer |
| `tailwindcss` v4 | Utility-first CSS with custom theme | Renderer |
| `react-markdown` | Markdown rendering for AI responses | Renderer |

## Persistence and external services

The main process owns Kafka connections, Confluent-compatible Schema Registry requests, SQLite, macOS Keychain access, and optional AI calls. SQLite keeps cluster metadata, preferences, favorites, filters, templates, DLQ reviews, and broker snapshots. Kafka, Registry, and AI credentials live in Keychain. Renderer code has no Node.js access and calls the typed preload API.

AI system prompts live in `apps/desktop/src/main/prompts/index.ts`. The service uses raw fetch for OpenAI, Anthropic, and Google Gemini. Enablement, sharing consent, and a configured API key are required before requests. See the [user guide](USER_GUIDE.md#ai-assistant-and-privacy) for redaction, history, and background-analysis controls.

## Extension and verification

Follow [AGENTS.md](../AGENTS.md) for IPC, React, state, styling, error handling, and destructive-operation conventions. Contributor workflows and fixture checks are in [development](DEVELOPMENT.md); signed distribution is in [release preparation](RELEASE.md).
