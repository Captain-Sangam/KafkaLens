# KafkaLens user guide

## Highlights

- **Multiple clusters** — Saved connection profiles, environment colors, TLS, SASL/PLAIN, and SASL/SCRAM authentication; profile imports and exports exclude credentials.
- **Topics and partitions** — Search, favorites, topic creation and configuration, plus partition leaders, replicas, ISR, offset bounds, and exports.
- **Message inspection** — JSON, Avro, Schema Registry Protobuf, string, and binary decoding; bounded live tail, timestamp seeking, forward/backward paging, and saved timestamp/key/JSONPath filters.
- **Message production** — Compose JSON, string, binary, and Avro records with keys, headers, partition targeting, schema validation, and reusable templates.
- **Consumer groups** — Member assignments, per-partition lag, session trends, offset resets, and JSON/CSV offset exports.
- **Schema Registry** — Subject and field search, schema ID lookup, version history, compatibility checks, registration, and side-by-side diffs.
- **Dead letter queues** — Discover DLQ topics, inspect failure metadata, persist reviews, and replay selected records with original bytes, headers, and tombstones preserved.
- **Broker configuration** — Descriptions, defaults, cross-broker comparisons, durable change history, and exports.
- **Optional AI** — Message explanations, DLQ analysis, schema and configuration advice, health summaries, semantic topic search, and opt-in lag anomaly monitoring.
- **Keyboard access** — Command palette, page navigation, topic search, and refresh shortcuts.


## Connect a cluster

1. Open **Settings** (`⌘,` or `⌘7`) and choose **Add Cluster**.
2. Enter a name, bootstrap servers, environment label, and authentication details. Add a Schema Registry URL if needed.
3. Choose **Test Connection**, save the profile, then select it in the sidebar to connect.

For a local sandbox, start the checked-in Kafka and Schema Registry fixtures:

```bash
make fixtures-up
```

Use bootstrap server `localhost:19092`, no authentication, and Schema Registry URL `http://localhost:18081`. Create a topic and produce a record to start exploring. When finished, `make fixtures-down` removes the disposable fixtures and their volumes.

If a connection fails, check broker reachability, advertised listener addresses, VPN access, and the profile's TLS/SASL settings.


## AI assistant and privacy

AI is disabled by default. In **Settings → AI Configuration**, enable AI, select OpenAI, Anthropic, or Google Gemini, choose a model, and add your API key. Explicitly consent to sharing selected payloads and configuration with that provider, then save the settings. Individual features can be disabled independently; background lag anomaly analysis requires an additional opt-in.

Configured field patterns redact matching content before requests leave the app. Review these settings against your data before using AI. Kafka browsing and management work without an AI key.

Kafka, Schema Registry, and AI credentials are stored in the macOS Keychain. SQLite stores connection metadata, preferences, favorites, filter presets, templates, DLQ reviews, and broker snapshots. Existing plaintext credentials are migrated before removal, with the original data recoverable if Keychain access fails.

AI history is also disabled by default. If enabled, it keeps the last 50 generated responses and provider/feature metadata locally; request inputs and API keys are excluded. Generated responses may still contain information derived from the supplied context.


## Operational safeguards

Topic deletion, offset resets, and schema version deletion require confirmation. Production-labeled clusters also require the resource name to be typed. DLQ replay shows a confirmation before producing records, with an additional typed confirmation for production.

Unavailable Kafka metadata is shown as unavailable. KafkaJS does not expose broker log directories, leader epochs, broker Kafka versions, or offset commit timestamps through the current implementation. Offset spans are not exact retained record counts for compacted or transactional topics.


## Keyboard shortcuts

| Shortcut                  | Action                                     |
| ------------------------- | ------------------------------------------ |
| `⌘K`                      | Command palette                            |
| `⌘R`                      | Refresh the current page                   |
| `⌘T`                      | Open topics and focus search               |
| `⌘,`                      | Settings                                   |
| `⌘1` / `⌘2` / `⌘3`        | Dashboard / Topics / Consumer Groups       |
| `⌘4` / `⌘5` / `⌘6` / `⌘7` | Schema Registry / DLQ / Brokers / Settings |


See [installation](../README.md#install-from-source) and the [documentation index](README.md).
