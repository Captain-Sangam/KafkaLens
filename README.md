<p align="center">
  <img src="apps/desktop/build/icon.iconset/icon_512x512.png" width="128" alt="KafkaLens app icon: connected nodes forming a K">
</p>

<h1 align="center">KafkaLens</h1>

<p align="center"><strong>A free, open-source desktop workspace for Apache Kafka on macOS.</strong></p>

Browse messages, investigate consumer lag, compare schemas, and replay failed records from one window. KafkaLens brings topic, partition, consumer group, Schema Registry, and broker views together, with an optional AI assistant for explanations and troubleshooting.

![KafkaLens dashboard showing topic health, consumer groups, broker count, and dead letter queues on a local demo cluster](docs/images/dashboard.png)

> [!NOTE]
> Version 1.0.0 is in release preparation. Local source builds are available; signed distribution and remaining acceptance gates are tracked in [Validation results](docs/VALIDATION.md).

## Screenshots

Screenshots show the actual app connected to a disposable local Kafka cluster with sample order, payment, and inventory events.

<details>
<summary><strong>Browse messages</strong> — offsets, partitions, decoded values, and filters</summary>

![KafkaLens message browser showing JSON order events, keys, partitions, and offset controls](docs/images/messages.png)

</details>

<details>
<summary><strong>Inspect consumer groups</strong> — lag, committed offsets, and exports</summary>

![KafkaLens consumer group view showing session lag and committed offsets across three partitions](docs/images/consumer-groups.png)

</details>

<details>
<summary><strong>Compare schemas</strong> — subjects, versions, and field changes</summary>

![KafkaLens Schema Registry view comparing two Avro versions with an added optional warehouse field](docs/images/schema-registry.png)

</details>

## Install from source

Requires macOS 13+, Node.js 24, npm 11+, and a reachable Kafka cluster. Schema Registry, Docker, and an AI provider key are optional.

```bash
git clone https://github.com/Captain-Sangam/KafkaLens.git kafkalens
cd kafkalens
make install
make check
make export
```

Launch **KafkaLens** from Spotlight (`⌘Space`). `make export` installs an unsigned local build to `/Applications` when writable, otherwise `~/Applications`. Quit an existing instance before replacing it. Choose another destination with `make export APP_DEST="$HOME/Applications"`.

For development, run `make dev`. To connect, open **Settings → Add Cluster**, enter your bootstrap servers and authentication details, test the connection, and save.

For a disposable local cluster, run `make fixtures-up` with Docker Compose. Use `localhost:19092` without authentication and Schema Registry `http://localhost:18081`. Remove the sandbox and its volumes with `make fixtures-down` when finished.

## Documentation and contributing

See [docs](docs/README.md) for the user guide, architecture, development, validation, and release instructions. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

[MIT](LICENSE). Third-party attribution is retained in [NOTICE](NOTICE).
