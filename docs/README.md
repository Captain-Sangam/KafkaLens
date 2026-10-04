# KafkaLens documentation

Start with [installation and setup](../README.md#install-from-source).

- [User guide](USER_GUIDE.md): features, cluster connections, AI/privacy settings, safeguards, and shortcuts.
- [Architecture](ARCHITECTURE.md): process boundaries, services, state, and persistence.
- [Development](DEVELOPMENT.md): contribution conventions, commands, fixtures, integration tests, and screenshot capture.
- [Release preparation](RELEASE.md): local packaging, signing, notarization, distribution, and updates.
- [Validation](VALIDATION.md): recorded checks, performance, coverage limits, and remaining acceptance gates.
- [Product requirements and roadmap](PRD.md): detailed feature requirements and future plans.

Local validation covers unit checks, a plaintext Kafka/Registry fixture, and an unsigned Apple Silicon desktop build. The 150 MB idle-memory target remains unmet. Signed distribution, live AI provider checks, secured multi-broker coverage, and a complete accessibility audit remain open. The validation document records the evidence and limits.

See [contribution guidelines](../CONTRIBUTING.md), [agent instructions](../AGENTS.md), and the [MIT license](../LICENSE).
