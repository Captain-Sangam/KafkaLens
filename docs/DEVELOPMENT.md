# Development and contribution details

Use Node 24 and macOS 13+ for desktop development. Install with `npm ci --ignore-scripts`, then `node node_modules/electron/install.js`. Start with `unset ELECTRON_RUN_AS_NODE && npm run dev`.

Read [AGENTS.md](../AGENTS.md) for process boundaries, IPC conventions, styling, and destructive-action safeguards. All Kafka, Registry, persistence, credential, and AI work belongs in the main process. Keep the renderer behind the typed preload API.

Before opening a pull request, run `npm run check` and the relevant integration checks described in [release guide](RELEASE.md). Service changes need real Kafka coverage. Test destructive UI actions with a production-labeled disposable fixture. Never use a live production cluster for these checks.

Keep changes focused and explain the user-facing behavior plus validation in the pull request. One maintainer approval and passing CI are required. For substantial new features, open an issue describing the proposed workflow and tradeoffs before implementation. No CLA is required.

Report security problems privately to a repository maintainer through GitHub private vulnerability reporting, if enabled. Avoid posting credentials or sensitive payloads in public issues.

## Development commands

Run `make` or `make help` for the full target list. The [Makefile](../Makefile) wraps the npm workspace scripts.

| Command        | Purpose                                         |
| -------------- | ----------------------------------------------- |
| `make dev`     | Run Electron and the renderer with hot reload   |
| `make start`   | Build and launch the production preview         |
| `make check`   | Lint, typecheck, run unit tests, and build      |
| `make test`    | Run unit tests                                  |
| `make package` | Build unsigned local macOS DMG and ZIP previews |
| `make clean`   | Remove generated builds, packages, and coverage |

To regenerate the README screenshots using an isolated app profile and sample data:

```bash
make fixtures-up
make screenshots
make fixtures-down
```

The capture script writes to `docs/images/`, removes its demo records and temporary profile, and leaves your normal KafkaLens profile untouched.

Run real Kafka, Schema Registry, desktop, and performance checks against the disposable fixtures:

```bash
make fixtures-up
make test-integration
make test-desktop
make test-performance
make fixtures-down
```

The app uses Electron, React, TypeScript, Tailwind CSS, Zustand, KafkaJS, and SQLite. Kafka connections, persistence, credentials, and AI calls run in the main process; the isolated renderer communicates through a typed preload bridge. See [architecture](ARCHITECTURE.md) for implementation conventions.

See the [contribution quick start](../CONTRIBUTING.md) and [documentation index](README.md).
