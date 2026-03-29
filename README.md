# KafkaLens

A free, open-source desktop application for managing, inspecting, and debugging Apache Kafka clusters. Built for developers, platform engineers, and SREs who need fast, pragmatic access to Kafka internals.

## Features

- **Multi-cluster management** — Connect to and switch between multiple Kafka clusters with color-coded environment labels (Local/Dev/Staging/Prod)
- **Topic browser** — Search, filter, and inspect topics with sortable columns, favorites, and health indicators
- **Message inspector** — Browse messages with offset control, partition filtering, JSON syntax highlighting, and expandable message details
- **Consumer group monitoring** — View consumer group state, member assignments, and per-partition lag with visual bars
- **Schema Registry browser** — Explore schemas, view version history, and compare schema versions side-by-side
- **Dead Letter Queue dashboard** — Auto-detect DLQ topics, inspect failure details, and replay messages
- **Broker configuration** — View broker configs with inline descriptions and cross-broker diff comparisons
- **AI assistant** — Optional AI-powered message explanation, DLQ root cause analysis, and config recommendations (bring your own API key — supports OpenAI, Anthropic, and Google)
- **Keyboard-first** — Command palette (⌘K), page shortcuts (⌘1-7), and full keyboard navigation
- **Dark mode first** — Dense, readable interface designed for infrastructure tooling

## Tech Stack

- **Shell:** Electron 33 (macOS-optimized, `hiddenInset` title bar)
- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + Zustand
- **Build:** electron-vite (Vite-powered)
- **Package:** electron-builder for `.dmg` distribution

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9

### Install & Run

```bash
npm install --ignore-scripts
node node_modules/electron/install.js
npm run dev
```

> **Note:** If running in an environment where `ELECTRON_RUN_AS_NODE=1` is set (e.g., some IDEs), unset it before running: `unset ELECTRON_RUN_AS_NODE && npm run dev`

### Build for Production

```bash
npm run build
```

### Package as `.dmg`

```bash
cd apps/desktop
npm run build:mac
```

## Project Structure

```
kafkalens/
├── apps/
│   └── desktop/                   # Electron + React application
│       ├── src/
│       │   ├── main/              # Electron main process
│       │   ├── preload/           # Context bridge (IPC)
│       │   └── renderer/          # React UI
│       │       └── src/
│       │           ├── components/  # Layout, shared components
│       │           ├── pages/       # Feature pages
│       │           ├── stores/      # Zustand state
│       │           ├── lib/         # Utilities, mock data
│       │           └── types/       # TypeScript types
│       ├── electron.vite.config.ts
│       └── package.json
├── packages/
│   ├── kafka-client/              # KafkaJS abstraction (planned)
│   ├── schema-client/             # Schema Registry client (planned)
│   ├── ai-layer/                  # AI provider integration (planned)
│   └── ui-components/             # Shared component library (planned)
├── .github/workflows/             # CI/CD (planned)
├── package.json                   # Root workspace config
└── PRD.md                         # Product requirements
```

## Keyboard Shortcuts

| Shortcut | Action          |
| -------- | --------------- |
| ⌘K       | Command Palette |
| ⌘1       | Dashboard       |
| ⌘2       | Topics          |
| ⌘3       | Consumer Groups |
| ⌘4       | Schema Registry |
| ⌘5       | DLQ Dashboard   |
| ⌘6       | Brokers         |
| ⌘7       | Settings        |

## License

Apache License 2.0
