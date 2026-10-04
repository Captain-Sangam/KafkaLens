# Contributing to KafkaLens

For desktop development, use macOS 13+, Node.js 24, and npm 11+.

```bash
make install
make dev
```

Before opening a pull request, run `make check` (lint, typechecks, unit tests, and build). For service or desktop behavior changes, also run the relevant fixture checks in the [development guide](docs/DEVELOPMENT.md). Use disposable clusters for destructive-operation checks.

Keep pull requests focused. Describe what changed, why, and the checks you ran using the repository PR template. One maintainer approval and passing CI are required. For substantial features, open an issue describing the workflow before implementation. No CLA is required.

Read the [architecture](docs/ARCHITECTURE.md) and [agent guidelines](AGENTS.md) for implementation conventions. Report security issues privately through GitHub vulnerability reporting when available; avoid sharing credentials or sensitive payloads in public issues.

Contributions are covered by the project's [MIT license](LICENSE).
