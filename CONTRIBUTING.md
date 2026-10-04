# Contributing to KafkaLens

Use Node 24 and macOS 13+ for desktop development. Install with `npm ci --ignore-scripts`, then `node node_modules/electron/install.js`. Start with `unset ELECTRON_RUN_AS_NODE && npm run dev`.

Read [AGENTS.md](AGENTS.md) for process boundaries, IPC conventions, styling, and destructive-action safeguards. All Kafka, Registry, persistence, credential, and AI work belongs in the main process. Keep the renderer behind the typed preload API.

Before opening a pull request, run `npm run check` and the relevant integration checks described in [RELEASE.md](docs/RELEASE.md). Service changes need real Kafka coverage. Test destructive UI actions with a production-labeled disposable fixture. Never use a live production cluster for these checks.

Keep changes focused and explain the user-facing behavior plus validation in the pull request. One maintainer approval and passing CI are required. For substantial new features, open an issue describing the proposed workflow and tradeoffs before implementation. No CLA is required.

Report security problems privately to a repository maintainer through GitHub private vulnerability reporting, if enabled. Avoid posting credentials or sensitive payloads in public issues.
