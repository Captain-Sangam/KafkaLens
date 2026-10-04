# KafkaLens v1 implementation and validation

Status recorded on 4 October 2026. The implementation is based on main `aade000`, refreshed from origin before work and again at closeout. The code is on `codex/complete-v1`. Version 1.0.0 is prepared locally; no production release has been published.

## Completed feature backlog

| Previously missing capability | Implemented behavior |
| --- | --- |
| Partition Inspector | Dedicated page with leaders, replicas, ISR, offsets, distribution, exports, and broker/message navigation |
| Consumer lag trends | Bounded in-session samples, trend chart, per-partition lag, member assignments, and inactive-group guards |
| Natural-language topic search | Provider-based semantic ranking restricted to actual cluster topics |
| Lag anomaly detection | Explicit per-feature opt-in, configurable growth-per-minute threshold, recent samples, and alert cooldown |
| Advanced message filters | Partition, timestamp range, key regex/exact match, JSONPath, and saved presets |
| Timestamp seeking | Timestamp, earliest/latest, explicit offsets, backward/forward paging, and progress through filtered pages |
| Produce from templates | Scoped saved templates, JSON/string/binary/Avro production, and schema validation |
| Schema field search | Subject/field search, schema ID lookup, version metadata, compatibility checks, and side-by-side diffs |
| Consumer offset export | JSON and CSV exports with real committed offsets, bounds, and lag |
| Keychain credentials | Kafka, Registry, and AI secrets in native Keychain; recoverable migration before SQLite plaintext removal |
| Broker change history | Durable bounded snapshots, differences, descriptions, cross-broker comparison, cluster defaults, and exports |

Additional work includes typed and validated IPC, renderer isolation, cancellation, raw-byte/tombstone-safe DLQ replay, partition-specific durable reviews, production confirmations, optional response-only AI history, shortcuts/focus handling, accessible theme text contrast, dependency upgrades, Apache license/contribution files, application icons, CI, macOS packaging, release preparation, and explicit update download/restart controls.

AI history is disabled by default. When enabled, only the last 50 responses and provider/feature metadata are saved; payload inputs and API keys are excluded. AI calls require enablement, sharing consent, and a Keychain-backed key. Background anomaly calls have an additional opt-in.

## Checks run locally

- `npm run check`: lint, strict main/renderer TypeScript, 39 unit tests, and production build passed.
- `npm run test:integration`: 11 checks against Kafka 3.9.1 KRaft and Confluent Schema Registry 7.9.1 passed. Includes real offsets, timestamp/filtered/backward pagination, ephemeral-group cleanup, inactive groups, reset bounds, Avro, schema reference deletion guards, config override preservation, binary headers/keys, and tombstones.
- `npm run test:performance`: the 1,000-topic, 100-group, page, and Avro acceptance checks passed after batching offset requests.
- `npm run test:desktop`: native Keychain writes and restart, absence of plaintext credentials, context isolation, populated pages, decoding, partition inspection, durable DLQ reviews, and typed production confirmations passed.
- The full desktop suite also passed against the packaged Apple Silicon app. Topic delete, offset reset, schema delete, and DLQ replay confirmations were checked; Escape cancels them. Fixture mutations and profiles are removed afterward.
- The offline desktop path passed for CI startup/Keychain/restart coverage.
- `npm audit`: zero reported vulnerabilities in the final lockfile.
- Local unsigned Apple Silicon DMG and ZIP builds passed. Workflow YAML and generated Homebrew Ruby syntax were checked locally.

GitHub CI and signed release jobs are configured; they have not been run on GitHub by this local validation.

## Measured performance

The Kafka timings measure service calls against a disposable local single-broker fixture. They include actual metadata/config/offset reads. They are one-run measurements, not guarantees for remote clusters or frontend rendering at every scale.

| Requirement | Latest measured result | Status |
| --- | --- | --- |
| Usable desktop UI under 3 s | 1,796 ms first process/profile; 375 ms restart | Passed |
| 1,000 topics under 2 s | 147 ms | Passed |
| 100 consumer groups under 3 s | 44 ms | Passed |
| 50-message page under 1 s | 23 ms | Passed |
| Avro schema fetch/decode under 200 ms | 3.9 ms cold; 0.001 ms cached | Passed |
| Idle memory with one cluster under 150 MB RSS | About 453 MiB summed RSS; main process alone about 194 MiB | **Unmet** |

The memory measurement launches the packaged app without a debugger, uses a fresh temporary profile with one small local cluster, waits 12 seconds at the dashboard, and records only the app and its descendants via `ps`. Summed process RSS includes shared pages; the main process itself also exceeds the target. Reproduce with `node scripts/measure-memory.mjs` after building and starting the local fixture.

The topic benchmark exposed excessive per-topic metadata/offset requests. A small adapter captures the existing KafkaJS admin cluster and uses its bulk offset requests, with the public per-topic path as fallback. KafkaJS is pinned to 2.2.4; upgrade the adapter and rerun integration/performance checks together when changing that dependency. No additional Kafka connection is created by the adapter.

Key regular expressions use [RE2 WebAssembly](https://github.com/google/re2-wasm) to avoid exponential backtracking. Unsupported lookaround/backreference patterns produce an actionable error.

## Dashboard loading regression

The dashboard previously hid every summary card while any section was loading, and background monitoring duplicated the initial group request. Consumer lag also fetched topic end offsets repeatedly and read groups sequentially, which magnified remote-broker latency.

Summary cards now load independently and preserve successful snapshots during refreshes, including empty snapshots. Pending reads are shared across pages, refreshes, and monitoring. Group coordinators are read with bounded concurrency and all groups share one topic end-offset snapshot. Restricted or deleted topics show unavailable lag; they are excluded from lag samples and anomaly analysis. Unknown group states no longer break dashboard rendering.

App shutdown attempts normal Kafka disconnection and caps the wait for broker requests at five seconds. SQLite is closed exactly once before exit. Unit tests cover normal completion and a permanently pending disconnect.

The desktop harness deliberately holds the group response pending and checks that topic/broker cards appear, repeated refreshes share one request, cached counts remain visible, and an unfamiliar group state renders. It runs in the isolated first process; restart restores the real services for the full Kafka checks. The regression passed against both development output and the packaged app. Screenshots are in `output/playwright/dashboard-partial.png` and `dashboard-refresh.png`.

The local 100-group benchmark improved from the previously recorded 830 ms to 44 ms. This is a local-fixture comparison, not a promised timing for remote clusters.

The installed Spotlight app was updated and manually relaunched. The existing cluster profile connected and all summary totals and consumer-group rows populated. A manual refresh preserved the visible data. The installed `app.asar` hash matches the validated local bundle.

## Remaining acceptance and release gates

1. **Idle memory target:** the 150 MB requirement remains open. Further memory profiling and architectural tradeoffs are needed; changing this requirement needs a maintainer decision. It has not been silently relaxed.
2. **Signed distribution:** Developer ID signing and Apple notarization credentials must be configured in the GitHub release environment. Both architectures, Gatekeeper assessment, and the installed-app update path must be verified with signed artifacts. Only the local unsigned arm64 preview was built and run here.
3. **Release publication/Homebrew:** review the signed draft release, publish it, and register its generated cask in the maintained tap. No signing secrets, tag, published release, or tap were created by this work.
4. **Live provider and secured-cluster validation:** AI protocol/consent/redaction/cancellation logic is covered locally with mocked providers; live API calls need maintainer keys. The real Kafka fixture uses one plaintext broker. Multi-broker TLS/SASL and Registry-auth scenarios need suitable fixtures before claiming that deployment coverage.
5. **Accessibility certification:** focus, keyboard flows, labels, font preferences, and theme contrast received implementation checks. A complete VoiceOver/WCAG audit has not been certified.

Broker log directories, leader epochs, broker Kafka version, and offset commit timestamps are not exposed by the current KafkaJS path and are shown as unavailable. Kafka offset spans are labeled as such where relevant; they are not exact retained record counts for compacted/transactional topics. The dark-only appearance follows repository instructions.

Linux/Windows distribution, MSK IAM, ACL editing, Kafka Connect, standalone `.proto` upload, HNSW indexing, and a native-client fallback remain outside the v1 implementation scope. See the PRD's later roadmap and open-question answers.

See [Release preparation](RELEASE.md) for reproduction and signing instructions. Raw local measurements and screenshots are under ignored `output/`; unsigned preview artifacts are under ignored `apps/desktop/release/`.
