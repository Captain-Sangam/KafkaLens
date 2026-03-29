# KafkaLens — Product Requirements Document

**Version:** 0.1 (Draft)
**Status:** In Review
**Owner:** Ajay Sangamithran
**Last Updated:** March 2026

---

## 1. Overview

### 1.1 Problem Statement

Apache Kafka is ubiquitous in modern data and event-driven architectures, yet the tooling available for observability, debugging, and configuration management remains fragmented. Commercial tools like KaDeck, Conduktor, and Confluent Control Center are expensive, often locked behind enterprise licenses, and tightly coupled to hosted Kafka providers. Developers and platform engineers need a lightweight, local-first, open-source alternative that gives them full visibility into their Kafka clusters — without needing a SaaS account or a per-seat license.

### 1.2 Product Vision

KafkaLens is a free, open-source desktop application for macOS (with cross-platform expansion in future roadmap phases) that provides a unified interface for managing, inspecting, and debugging multiple Apache Kafka clusters. It is designed for developers, platform engineers, and SREs who need fast, pragmatic access to Kafka internals: topics, messages, schemas, consumer groups, DLQs, partitions, and cluster configuration — all enriched with an AI layer that surfaces anomalies, recommends configurations, and helps interpret message payloads.

### 1.3 Target Personas

**1. The Backend Developer ("Alex")**
Alex writes services that produce and consume Kafka events. They need to quickly inspect what's in a topic, verify their messages are being produced correctly, decode a schema-registered Avro payload, and debug why messages are landing in the DLQ. They work across 2-3 clusters: local, staging, and production.

**2. The Platform / SRE Engineer ("Priya")**
Priya manages multiple Kafka clusters for different teams. They need to audit cluster configs, monitor consumer group lag, identify under-replicated partitions, track schema evolution, and validate broker settings before a deployment. They treat Kafka as infrastructure, not just a queue.

**3. The Data Engineer ("Sam")**
Sam builds pipelines that consume from Kafka into data warehouses and lakes. They need to understand the message schema, the topic retention policy, the throughput, the partitioning strategy, and potential schema drift. They frequently cross-reference the Schema Registry.

---

## 2. Goals and Non-Goals

### 2.1 Goals (v1.0)

- Native macOS desktop application, distributable via `.dmg` and Homebrew
- Connect to and manage multiple Kafka clusters simultaneously
- Full topic management: browse, search, create, delete, configure
- Message browsing with offset control, filtering, and payload decoding
- Schema Registry integration (Confluent Schema Registry compatible)
- Consumer group management and lag monitoring
- DLQ (Dead Letter Queue) identification and message inspection
- Partition-level visibility: leader, replicas, ISR, offset watermarks
- Cluster and broker configuration viewer
- AI-powered assistant layer: recommendations, anomaly highlights, message explanation
- Open-source under Apache 2.0 license

### 2.2 Non-Goals (v1.0)

- Windows or Linux builds (deferred to v1.1)
- Kafka Streams or ksqlDB management
- ACL and user/role management (deferred to v1.2)
- Multi-user collaboration or shared workspaces
- Managed cloud Kafka provider-specific features (MSK, Confluent Cloud-specific APIs)
- Message production at scale / load testing (basic single-message production is in scope)

---

## 3. Architecture Overview

### 3.1 Technical Stack

KafkaLens is built as a native macOS desktop application using the following stack:

**Frontend / UI**

- Electron (macOS-optimized) as the application shell
- React + TypeScript for the UI layer
- TailwindCSS for styling
- Zustand for state management

**Backend / Kafka Connectivity**

- Node.js backend running inside Electron's main process
- KafkaJS as the primary Kafka client library
- node-rdkafka as a fallback / high-performance option for large message throughput
- Custom Schema Registry client compatible with Confluent Schema Registry REST API
- Local SQLite database (via better-sqlite3) for persisting cluster configs, connection profiles, favorites, and AI conversation history

**AI Layer**

- Claude API (claude-sonnet) for the AI assistant
- Local embedding index (HNSWLib) for semantic search over messages and configs
- Configurable API key; users bring their own key or opt out

**Distribution**

- electron-builder for `.dmg` packaging and auto-update (electron-updater)
- Homebrew Cask formula for tap-based installation
- GitHub Releases as the distribution channel

### 3.2 Process Architecture

```
┌────────────────────────────────────────┐
│            macOS Application           │
│                                        │
│  ┌──────────────┐  ┌────────────────┐  │
│  │  Renderer    │  │   Main Process │  │
│  │  (React UI)  │◄─►  (Node.js)    │  │
│  └──────────────┘  └───────┬────────┘  │
│                            │           │
│              ┌─────────────┼──────┐    │
│              │             │      │    │
│         KafkaJS    Schema Registry  │  │
│         Client      REST Client    │  │
│              │             │      │    │
└──────────────┼─────────────┼──────┘
               │             │
         Kafka Brokers   Schema Registry
         (any cluster)    (Confluent-compat)
```

---

## 4. Feature Specifications

### 4.1 Cluster Management

**Description:** Users can register, configure, and switch between multiple Kafka clusters. Each cluster profile stores all connection parameters locally and securely.

**Requirements:**

- Add a cluster via a guided form supporting:
  - Bootstrap servers (comma-separated list)
  - Authentication: None, SASL/PLAIN, SASL/SCRAM-256, SASL/SCRAM-512, SSL/TLS (with cert upload)
  - Schema Registry URL (optional)
  - Display name, color tag, and environment label (Local / Dev / Staging / Prod)
- All credentials stored in the macOS Keychain, not in plaintext config files
- Connection test on save with clear success/error feedback
- Visual cluster switcher in the left sidebar with environment badges
- Import/export cluster configs as JSON (credentials excluded for safety)
- Support for localhost clusters, Confluent Cloud, AWS MSK, Aiven, and any standard broker

**UI Notes:**

- Cluster list in the left sidebar with colored environment dots
- Quick connection status indicator (green/red) per cluster
- "Duplicate cluster" action for creating staging from prod configs

---

### 4.2 Topic Management

**Description:** Full visibility into all topics in a cluster with search, filtering, and per-topic drill-down.

**Requirements:**

- List all topics with:
  - Topic name (sortable)
  - Number of partitions
  - Replication factor
  - Message count estimate (based on offset watermarks)
  - Retention policy (ms and bytes)
  - Cleanup policy (delete / compact)
  - Creation timestamp (if available)
- Search and filter by topic name (fuzzy match)
- Filter by topic type: internal, user-created, DLQ (auto-detected by naming pattern, configurable)
- Create topic with configurable partition count, replication factor, and advanced configs
- Delete topic with confirmation (double-confirm for production environment labels)
- View topic-level configuration key-value pairs in a readable format
- Edit topic configuration inline (alter configs)
- Favorite topics for quick access
- Topic health indicators: under-replicated partitions, offline partitions

---

### 4.3 Message Browser

**Description:** The core inspection surface. Users can browse, search, filter, and decode messages in any topic.

**Requirements:**

**Offset Control**

- Seek to: Latest, Earliest, Specific offset, Specific timestamp
- Browse forwards and backwards through messages
- Configurable page size (10, 50, 100, 500 messages)
- Live tail mode (poll for new messages, auto-scroll)

**Message Display**

- Tabular list view: offset, partition, timestamp, key (preview), value (preview)
- Full-screen message detail panel with key, value, headers, and metadata
- Payload rendering:
  - Auto-detect: JSON, Avro (via Schema Registry), Protobuf (via Schema Registry), plain string, binary (hex)
  - Pretty-print JSON with syntax highlighting and collapsible nodes
  - Avro/Protobuf decoded to JSON with schema annotation
  - Binary payloads shown as hex dump with ASCII sidebar
- Header display: list of key-value header pairs

**Filtering**

- Filter by partition
- Filter by key (exact match or regex)
- Filter by timestamp range
- Filter by value content (substring or JSONPath expression for JSON payloads)
- Saved filter presets per topic

**Produce Messages**

- Compose and produce a single message to a topic
- Specify key, value, headers, and target partition
- Support JSON / string / Avro payload types
- Produce from template (save produced messages as templates)

---

### 4.4 DLQ (Dead Letter Queue) Management

**Description:** First-class treatment of DLQs as a concept, making it easy to identify, inspect, and act on failed messages.

**Requirements:**

- Auto-detect DLQ topics by naming convention patterns (configurable defaults: `.DLT`, `-dlt`, `-dlq`, `.RETRY`, `-retry`, `-error`)
- DLQ section in the sidebar with a distinct icon and badge showing unprocessed message count
- DLQ message view includes all standard message fields plus:
  - Exception class (from header)
  - Exception message (from header)
  - Original topic (from header)
  - Original partition and offset (from header)
  - Retry attempt count (from header)
- "Replay message" action: re-produce the DLQ message to its original topic with one click
- Replay to custom topic option
- Bulk replay with filters
- Mark messages as reviewed (local annotation stored in SQLite)
- DLQ health summary widget on cluster dashboard showing DLQ topic count and total stuck messages

---

### 4.5 Schema Registry

**Description:** Integrated Schema Registry browser supporting Confluent Schema Registry API-compatible endpoints.

**Requirements:**

- Connect Schema Registry per-cluster (URL + optional basic auth)
- List all subjects
- Per-subject view:
  - All schema versions with version number and schema ID
  - Schema definition viewer (Avro JSON, Protobuf IDL)
  - Diff view between two versions (side-by-side, highlighting additions/removals/changes)
  - Compatibility mode label (BACKWARD, FORWARD, FULL, NONE)
- Schema search across subjects and field names
- Schema ID lookup: given a schema ID, show the full schema definition
- Validate a draft schema against the registry's compatibility rules before registration
- Register new schema version (for advanced users, with explicit warning)
- Delete schema version (with compatibility check and explicit confirmation)
- Automatically link schema to messages in the message browser (decode Avro/Protobuf using fetched schema)

---

### 4.6 Consumer Group Management

**Description:** Visibility into consumer group state, offsets, and lag — one of the most critical debugging surfaces for event-driven systems.

**Requirements:**

- List all consumer groups with:
  - Group ID
  - State (Stable, Rebalancing, Empty, Dead)
  - Number of members
  - Protocol type
  - Total lag (sum of partition lags across all assigned partitions)
- Per-group detail view:
  - Member list with client ID, host, and partition assignments
  - Per-partition: topic, partition, current offset, log-end offset, lag
  - Lag visualized as a bar per partition
  - Last committed timestamp per partition
- Lag trend chart: per-group lag over time (sampled every N seconds, stored in-memory per session)
- Reset offsets: to earliest, latest, specific offset, or specific timestamp (with explicit confirmation and env-label double-confirm for prod)
- Delete consumer group (when all members are inactive)
- Export group offsets as JSON or CSV

---

### 4.7 Partition Inspector

**Description:** Low-level visibility into partition topology and health.

**Requirements:**

- Per-topic partition list showing:
  - Partition ID
  - Leader broker ID and host
  - Replicas (list of broker IDs)
  - ISR (In-Sync Replicas)
  - Under-replicated flag (ISR < replication factor)
  - Log start offset and log end offset
  - Leader epoch
- Broker detail: click a broker ID to see all partitions it leads or replicates
- Under-replicated partition alert: highlighted in the topic list and in a global cluster health panel
- Partition rebalance suggestion (AI-assisted): flag hot partitions with disproportionately high message counts

---

### 4.8 Cluster and Broker Configuration

**Description:** Read-only (and optionally writable) view of broker and cluster configs.

**Requirements:**

- List all brokers with:
  - Broker ID
  - Host and port
  - Rack (if configured)
  - Controller flag
  - Log directories
- Per-broker configuration key-value viewer with descriptions (static documentation inline)
- Search configs by key name
- Cluster-level configs (via AdminClient DescribeConfigs)
- Diff view: compare config between two brokers (highlight divergences)
- Config change history: detect and surface changes since last inspection (stored in SQLite per session)
- Export broker config as JSON or properties file

---

## 5. AI Layer

### 5.1 Overview

KafkaLens includes an optional, opt-in AI assistant powered by the Claude API. Users must provide their own Anthropic API key (entered once in Preferences, stored in macOS Keychain). The AI layer is designed to be genuinely useful — not a chatbot wrapper — by surfacing context-relevant insights, recommendations, and explanations at the right moment in the workflow.

### 5.2 AI Features

**5.2.1 Message Explainer**
When viewing a message, users can invoke "Explain this message" from the message detail panel. The AI receives the decoded payload (JSON or schema-decoded) and returns:

- Plain English summary of what the event represents
- Key fields and their likely business meaning
- Any anomalies in the payload structure (missing required fields, unexpected nulls, etc.)

The raw payload is sent to the API; users are warned about this before enabling and can configure field redaction rules.

**5.2.2 DLQ Root Cause Assistant**
When viewing a DLQ message, the AI receives the exception class, exception message, and original message payload and returns:

- Probable root cause of the failure
- Suggested fix (code-level where possible)
- Whether the message is safe to replay

**5.2.3 Topic Configuration Advisor**
When viewing topic configuration, the AI compares the current settings against known best practices and the observed usage pattern (message rate, retention, partition count, consumer group lag) and returns:

- Configuration recommendations with justification
- Risk flags (e.g., retention too low relative to downstream consumer lag, replication factor too low for a production topic)
- Suggested new config values

**5.2.4 Schema Diff Explainer**
When viewing a schema version diff, the AI explains:

- What changed between versions in plain English
- Whether the change is backward / forward compatible and why
- Impact on existing consumers and producers

**5.2.5 Consumer Lag Anomaly Detection**
A background job (when AI is enabled) periodically checks consumer group lag trends. If lag is growing faster than a configurable threshold, a notification is shown with an AI-generated summary:

- Which consumer group and topic is lagging
- Probable causes (throughput spike, consumer crash, rebalance storm)
- Suggested remediation steps

**5.2.6 Natural Language Topic Search**
Users can type a plain English query ("find topics related to payments") and the AI searches the topic list semantically, returning ranked matches with a brief explanation of why each topic matched.

**5.2.7 Cluster Health Summary**
On the cluster dashboard, a "Get AI Summary" button generates a plain English health report covering:

- Under-replicated or offline partitions
- Consumer groups with high or growing lag
- Topics with unusual retention or compaction configs
- Schema Registry subjects with compatibility issues

### 5.3 AI Configuration

- API key stored securely in macOS Keychain
- Users can enable/disable AI globally or per feature
- Configurable field redaction: specify JSON field name patterns (e.g., `password`, `token`, `ssn`) to strip from payloads before sending
- All AI prompts and responses are ephemeral (not stored server-side by KafkaLens); user controls their Claude API account's data retention settings independently

---

## 6. User Interface

### 6.1 Layout

The application uses a three-column layout:

```
┌──────────┬─────────────────────────┬──────────────────┐
│  Sidebar │  Main Content Panel     │  Detail / AI     │
│          │                         │  Panel           │
│ Cluster  │  Topic list / Message   │  Message detail  │
│ nav tree │  browser / Config view  │  AI assistant    │
│          │                         │  Schema viewer   │
└──────────┴─────────────────────────┴──────────────────┘
```

The right detail panel is collapsible. A bottom status bar shows connection status, last refresh time, and cluster version.

### 6.2 Design Principles

- **Dark mode first:** Kafka tooling is infrastructure tooling. Engineers live in dark mode. Default to dark, support light mode.
- **Dense but readable:** Information density matters for power users. No marketing whitespace. But still legible.
- **Keyboard-first navigation:** Full keyboard shortcut coverage. Tab between panels, `cmd+k` for command palette, `cmd+r` to refresh, `cmd+t` to open topic.
- **Instant feedback:** Loading skeletons, not spinners. Optimistic UI where safe.
- **Zero configuration to first value:** A user with an unauthenticated local Kafka cluster should see topics within 15 seconds of installing the app.

### 6.3 Key Screens

1. **Cluster Dashboard** — health summary, topic count, consumer group count, broker status, DLQ summary widget
2. **Topic List** — sortable/filterable table with all topics
3. **Message Browser** — split list/detail view with offset controls and payload renderer
4. **DLQ Dashboard** — aggregated view of all DLQ topics with replay actions
5. **Schema Registry Browser** — subject list + version explorer + diff viewer
6. **Consumer Groups** — group list + per-group partition lag table + trend chart
7. **Broker Config** — broker list + per-broker config with search
8. **Preferences** — cluster management, AI key, display options, keyboard shortcuts

---

## 7. Non-Functional Requirements

### 7.1 Performance

- Application launch to usable state: < 3 seconds on Apple Silicon
- Topic list load (up to 1,000 topics): < 2 seconds
- Message page load (50 messages): < 1 second
- Schema fetch and decode for Avro messages: < 200ms per message (with caching)
- Consumer group lag load: < 3 seconds for up to 100 groups
- Memory usage at idle with one cluster connected: < 150MB RSS

### 7.2 Security

- All credentials in macOS Keychain; never written to disk in plaintext
- TLS verification on by default for all Kafka and Schema Registry connections
- AI payloads transmitted only with explicit user consent; field redaction configurable
- No telemetry by default; opt-in anonymous usage metrics only

### 7.3 Reliability

- Connection loss handled gracefully with automatic reconnect and user notification
- No data modification operations without explicit user confirmation
- Destructive actions (delete topic, reset offsets) require a secondary confirmation on production-labeled clusters
- All local state (favorites, filters, AI history) backed by SQLite with WAL mode for durability

### 7.4 Accessibility

- Full keyboard navigation
- Screen reader support via ARIA labels on all interactive elements
- Sufficient color contrast ratios (WCAG AA minimum)
- Configurable font size

---

## 8. Open Source Strategy

### 8.1 License

Apache License 2.0. Commercial use permitted. No CLA required for contributions.

### 8.2 Repository Structure

```
kafkalens/
├── apps/
│   └── desktop/          # Electron + React application
├── packages/
│   ├── kafka-client/     # KafkaJS abstraction layer
│   ├── schema-client/    # Schema Registry REST client
│   ├── ai-layer/         # Claude API integration
│   └── ui-components/    # Shared React component library
├── docs/                 # Documentation site source (Docusaurus)
└── .github/
    └── workflows/        # CI/CD: lint, test, build, release
```

### 8.3 Contribution Model

- Issue triage: maintainer response SLA of 3 business days for bug reports
- PRs require one maintainer approval and passing CI
- Feature requests go through an RFC (Request for Comments) process for non-trivial changes
- All releases signed and notarized for macOS Gatekeeper

### 8.4 Roadmap (Post-v1.0)

| Version | Theme          | Key Features                                             |
| ------- | -------------- | -------------------------------------------------------- |
| v1.1    | Cross-platform | Linux AppImage and Windows NSIS installer                |
| v1.2    | Access Control | ACL viewer and editor, user/role management              |
| v1.3    | Collaboration  | Export/import snapshots, shareable topic profiles        |
| v1.4    | Pipeline       | Message transformation preview, Kafka Connect viewer     |
| v2.0    | Cloud-native   | Web UI mode (Electron-optional), self-hosted server mode |

---

## 9. Success Metrics

### 9.1 Adoption (6 months post-launch)

- 2,000+ GitHub stars
- 500+ weekly active installs (measured via opt-in telemetry)
- < 2% crash rate per session

### 9.2 Engagement

- Average session duration > 8 minutes (indicative of actual debugging use, not just browsing)
- AI feature adoption: > 30% of active users enable AI layer
- DLQ replay used in > 20% of sessions where DLQ topics exist

### 9.3 Community Health

- < 72-hour response on new issues
- > 20 external contributors within 6 months
- Documentation NPS > 40 (measured via inline feedback)

---

## 10. Open Questions

1. **Protobuf support without a Schema Registry:** Should we support inline `.proto` file upload for topics not backed by a registry? (Likely yes, v1.1)
2. **MSK IAM Authentication:** AWS IAM auth for MSK is complex to implement; is it a blocker for v1.0 given the AWS-heavy user base?
3. **AI key sharing / proxy mode:** Should we offer a hosted proxy for the AI layer so users without their own API key can still use it (rate-limited free tier)? This changes the open-source purity of the project.
4. **Kafka 4.x / KRaft mode:** KRaft-mode clusters behave differently for controller discovery. Do we target Kafka 2.8+ or focus on 3.x+ where KRaft is stable?
5. **Windows timeline:** Several target users are on Windows (especially enterprise SREs). Should Windows be pulled into v1.0?

## 11. Answers to Open Questions

1. Yes
2. No need for v1.0
3. The settings tab should allow for users to bring in their own api key and select the model. We should offer openai, claude and gemini options in the settings page
4. Yes, focus on the stable build only for Kraft
5. NOT A PRIORITY
