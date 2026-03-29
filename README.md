# KafkaLens

A free, open-source desktop application for managing, inspecting, and debugging Apache Kafka clusters. Built for developers, platform engineers, and SREs who need fast, pragmatic access to Kafka internals.

## Features

- **Multi-cluster management** — Connect to and switch between multiple Kafka clusters with color-coded environment labels (Local/Dev/Staging/Prod)
- **Topic browser** — Search, filter, and inspect topics with sortable columns, favorites, and health indicators
- **Message inspector** — Browse messages with offset control, partition filtering, JSON syntax highlighting, and expandable message details
- **Message producer** — Compose and send messages with key, value, headers, and partition targeting
- **Consumer group monitoring** — View consumer group state, member assignments, and per-partition lag with visual bars
- **Consumer group operations** — Reset offsets (earliest/latest/timestamp/specific) with production safety confirmations
- **Schema Registry browser** — Explore schemas, view version history, register new versions, and compare schema diffs side-by-side
- **Dead Letter Queue dashboard** — Auto-detect DLQ topics, inspect failure details, replay messages to original or custom topics, and bulk replay
- **Broker configuration** — View broker configs with inline descriptions, cross-broker diff comparisons, and export
- **AI assistant** — Optional AI-powered message explanation, DLQ root cause analysis, schema diff explanation, topic config advice, and cluster health summaries (bring your own API key — supports OpenAI, Anthropic, and Google Gemini)
- **Keyboard-first** — Command palette (⌘K), page shortcuts (⌘1-7), and full keyboard navigation
- **Dark mode first** — Dense, readable interface designed for infrastructure tooling
## Tech Stack

- **Shell:** Electron 33 (macOS-optimized, `hiddenInset` title bar)
- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + Zustand
- **Backend:** KafkaJS + better-sqlite3 (SQLite with WAL mode for local persistence)
- **AI:** Raw HTTP to OpenAI, Anthropic, and Google Gemini APIs (no SDK dependencies)
- **Build:** electron-vite (Vite-powered, HMR in dev)
- **Package:** electron-builder for `.dmg` and `.zip` distribution

---

## Getting Started

### Prerequisites

- **Node.js** >= 18 (check with `node -v`)
- **npm** >= 9 (check with `npm -v`)
- **macOS** (the Electron shell is macOS-optimized; Linux/Windows support planned for v1.1)

### Step 1: Clone the repository

```bash
git clone https://github.com/your-org/kafkalens.git
cd kafkalens
```

### Step 2: Install dependencies

The `--ignore-scripts` flag skips the Electron binary download during the initial `npm install`, which avoids issues in sandboxed environments. The Electron binary is installed separately in the next step.

```bash
npm install --ignore-scripts
```

### Step 3: Install the Electron binary

```bash
node node_modules/electron/install.js
```

### Step 4: Rebuild native modules for Electron

The `better-sqlite3` native module must be compiled against Electron's Node.js version (not your system Node). Run:

```bash
npx electron-rebuild -f -w better-sqlite3
```

If that doesn't work (check by running the app — you'll see a `NODE_MODULE_VERSION` mismatch error), rebuild manually:

```bash
cd node_modules/better-sqlite3
npx node-gyp rebuild \
  --runtime=electron \
  --target=$(node -e "console.log(require('electron/package.json').version)") \
  --arch=$(uname -m | sed 's/x86_64/x64/' | sed 's/aarch64/arm64/') \
  --dist-url=https://electronjs.org/headers
cd ../..
```

### Step 5: Run in development mode

```bash
npm run dev
```

This starts:
1. The Vite dev server for the renderer process (React UI with HMR)
2. Builds the main process and preload scripts
3. Launches the Electron window

The app opens automatically. Changes to the React code hot-reload instantly. Changes to main process code trigger an automatic rebuild and app restart.

> **IDE note:** Some editors (like Cursor and VS Code) set `ELECTRON_RUN_AS_NODE=1` in their integrated terminals, which prevents Electron from starting properly. If you see `Cannot read properties of undefined (reading 'isPackaged')`, unset it first:
>
> ```bash
> unset ELECTRON_RUN_AS_NODE && npm run dev
> ```

---

## Connecting to Kafka

### Add a cluster

1. Open **Settings** (⌘7 or click the gear icon in the sidebar)
2. Click **Add Cluster**
3. Fill in the connection details:
   - **Display Name** — a friendly label (e.g., "Local Dev")
   - **Bootstrap Servers** — comma-separated broker addresses (e.g., `localhost:9092`)
   - **Environment** — Local, Dev, Staging, or Prod (affects UI color coding and safety confirmations)
   - **Authentication** — None, SASL/PLAIN, SASL/SCRAM-256, SASL/SCRAM-512, or SSL/TLS
   - **Schema Registry URL** — optional, for Avro/Protobuf decoding
4. Click **Test Connection** to verify
5. Click **Save**

The cluster appears in the sidebar dropdown. Select it to connect and start browsing.

### Quick start with a local cluster

If you have Docker installed, spin up a local Kafka cluster:

```bash
docker run -d --name kafka \
  -p 9092:9092 \
  -e KAFKA_CFG_NODE_ID=0 \
  -e KAFKA_CFG_PROCESS_ROLES=controller,broker \
  -e KAFKA_CFG_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093 \
  -e KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT \
  -e KAFKA_CFG_CONTROLLER_QUORUM_VOTERS=0@localhost:9093 \
  -e KAFKA_CFG_CONTROLLER_LISTENER_NAMES=CONTROLLER \
  -e KAFKA_CFG_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
  bitnami/kafka:latest
```

Then add a cluster in KafkaLens with bootstrap servers `localhost:9092`, no auth.

---

## Configuring AI

KafkaLens supports three AI providers. You bring your own API key.

1. Open **Settings** (⌘7)
2. Scroll to the **AI Configuration** section
3. Toggle AI **on**
4. Select a provider:
   - **OpenAI** — models: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`
   - **Anthropic** — models: `claude-sonnet-4-20250514`, `claude-3.5-sonnet`, `claude-3-haiku`
   - **Google** — models: `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash`
5. Paste your API key
6. (Optional) Add field redaction patterns — comma-separated field names like `password,token,ssn,secret` to strip from payloads before they're sent to the AI
7. Click **Save**

AI features then appear throughout the app: "Explain with AI" on messages, "Root Cause Analysis" on DLQ entries, "AI Config Review" on broker settings, and "Get AI Health Summary" on the dashboard.

---

## Building for Production

### Compile the app

```bash
npm run build
```

This outputs optimized bundles to `apps/desktop/out/`.

### Package as a macOS `.dmg`

```bash
cd apps/desktop
npm run build:mac
```

The `.dmg` and `.zip` artifacts are written to `apps/desktop/release/`.

### Package as an unpacked directory (for testing)

```bash
cd apps/desktop
npm run build:unpack
```

---

## Project Structure

```
kafkalens/
├── apps/
│   └── desktop/                       # Electron + React application
│       ├── src/
│       │   ├── main/                  # Electron main process
│       │   │   ├── index.ts           # App lifecycle, window creation
│       │   │   ├── ipc-handlers.ts    # 43 IPC handlers across 9 domains
│       │   │   ├── prompts/           # AI system prompts (editable)
│       │   │   │   └── index.ts       # All AI prompt templates
│       │   │   └── services/
│       │   │       ├── kafka-service.ts    # KafkaJS wrapper (connections, topics, messages, groups, brokers)
│       │   │       ├── schema-service.ts   # Confluent Schema Registry REST client
│       │   │       ├── ai-service.ts       # Multi-provider AI (OpenAI, Anthropic, Google Gemini)
│       │   │       └── store-service.ts    # SQLite persistence (clusters, favorites, settings)
│       │   ├── preload/               # Context bridge — exposes typed IPC API to renderer
│       │   └── renderer/              # React UI
│       │       └── src/
│       │           ├── components/    # Layout (sidebar, status bar, command palette), shared UI
│       │           ├── pages/         # 8 feature pages (Dashboard, Topics, Messages, etc.)
│       │           ├── stores/        # Zustand stores (cluster, data, UI state)
│       │           ├── lib/           # AI guard utility
│       │           └── types/         # Shared TypeScript type definitions
│       ├── electron.vite.config.ts    # Vite config for main, preload, and renderer
│       └── package.json
├── packages/
│   ├── kafka-client/                  # KafkaJS abstraction interfaces
│   ├── schema-client/                 # Schema Registry client interfaces
│   ├── ai-layer/                      # AI provider interfaces
│   └── ui-components/                 # Shared component library (planned)
├── .github/workflows/                 # CI/CD (planned)
├── package.json                       # Root workspace config (npm workspaces)
├── PRD.md                             # Product requirements document
└── README.md
```

---

## Keyboard Shortcuts

| Shortcut | Action             |
| -------- | ------------------ |
| ⌘K       | Command Palette    |
| ⌘1       | Dashboard          |
| ⌘2       | Topics             |
| ⌘3       | Consumer Groups    |
| ⌘4       | Schema Registry    |
| ⌘5       | DLQ Dashboard      |
| ⌘6       | Brokers            |
| ⌘7       | Settings           |

---

## Current Status (v0.1)

### Implemented

All core features from the PRD are functional: cluster management, topic CRUD, message browsing with live tail, consumer group monitoring with offset reset, Schema Registry with diff viewer, DLQ dashboard with replay, broker config with cross-broker comparison, and AI-powered insights across all major views.

### Known Gaps (Planned for Next Iteration)

- **Partition Inspector page** — dedicated page for partition-level topology and health (PRD §4.7)
- **Consumer lag trend chart** — per-group lag sampled over time with in-session charting (PRD §4.6)
- **Natural language topic search** — AI-powered semantic search over topic list (PRD §5.2.6)
- **Consumer lag anomaly detection** — background AI monitoring with notifications (PRD §5.2.5)
- **Advanced message filtering UI** — timestamp range, key regex, value JSONPath filters (backend supports, UI pending)
- **Seek to timestamp** — offset mode for seeking by timestamp (backend supports, UI pending)
- **Produce from template** — save and reuse message templates (PRD §4.3)
- **Schema search** — search across subjects and field names (PRD §4.5)
- **Export consumer group offsets** — JSON/CSV export (PRD §4.6)
- **macOS Keychain integration** — credentials currently stored in SQLite; Keychain migration pending (PRD §7.2)
- **Config change history** — detect broker config changes since last inspection (PRD §4.8)

---

## Troubleshooting

### `ELECTRON_RUN_AS_NODE` error

If you see `TypeError: Cannot read properties of undefined (reading 'isPackaged')` when running `npm run dev`, your terminal has `ELECTRON_RUN_AS_NODE=1` set (common in IDE integrated terminals). Fix:

```bash
unset ELECTRON_RUN_AS_NODE && npm run dev
```

### `NODE_MODULE_VERSION` mismatch

If you see an error about `better_sqlite3.node` being compiled against a different Node.js version, rebuild it:

```bash
npx electron-rebuild -f -w better-sqlite3
```

### App starts but shows no data

No Kafka cluster is connected. Add and connect a cluster in Settings (⌘7) to see live data.

### Connection test fails

- Verify your Kafka brokers are reachable from your machine (`nc -zv localhost 9092`)
- Check that the authentication method and credentials are correct
- For SSL connections, ensure the certificate path is valid
- Firewall or VPN may block access to remote clusters

---

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
