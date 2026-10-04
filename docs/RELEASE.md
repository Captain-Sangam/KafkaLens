# Releasing KafkaLens

Use Node 24 and macOS 13 or newer. `npm ci --ignore-scripts`, `node node_modules/electron/install.js`, and `npm run check` prepare and validate a checkout. SQLite 13 includes portable native prebuilds; rebuilding is only needed when a platform prebuild is unavailable.

## Local installation and packaging

Run commands from the repository root. `make install` installs the locked dependencies and Electron binary, and `make check` runs lint, typechecks, unit tests, and a production build.

```bash
make install
make check
make export
```

`make export` creates an unsigned app for local use and installs it in `/Applications` when writable, otherwise `~/Applications`. Quit KafkaLens before replacing an existing app. Override the destination with `make export APP_DEST="$HOME/Applications"`, then launch KafkaLens from Spotlight (`⌘Space`).

`make dev` starts hot reload, and `make start` builds and opens the production preview. Both clear `ELECTRON_RUN_AS_NODE` before launch. Build output is written to `apps/desktop/out/`; packaged output is written to `apps/desktop/release/`.

Use `make package` for unsigned local macOS DMG and ZIP previews. These previews are for local verification; signed distribution requires the release workflow and credentials below. KafkaLens is a local desktop app that connects to existing Kafka/Registry deployments; the disposable Docker cluster is a development fixture.

## Validation

See [Implementation and validation results](VALIDATION.md) for completed scope, measured performance, and remaining acceptance gates.

Run `docker compose -f compose.test.yaml up -d --wait`, then `npm run test:integration` and `npm run test:desktop`. The desktop harness uses an isolated temporary profile and test-only Keychain service. It never reads or writes the normal KafkaLens profile. For the packaged preview, set `KAFKALENS_EXECUTABLE` to its `Contents/MacOS/KafkaLens` executable before running the desktop suite. The harness verifies that the build supports profile and Keychain isolation before launch. Remove fixtures with `docker compose -f compose.test.yaml down -v`.

`npm run test:desktop -- --offline` runs the desktop startup, context isolation, Keychain, and restart checks without a Kafka fixture, for macOS CI. The complete desktop suite needs the fixture above.

## Signed distribution

The release workflow runs on a `v<desktop package version>` tag and creates a draft GitHub release. Before creating a tag, change the version in the root and desktop packages and regenerate the lockfile. Configure the GitHub `release` environment with:

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64 Developer ID Application signing certificate (.p12) |
| `CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_API_KEY` | Base64 contents of the App Store Connect .p8 private key (workflow writes a temporary file) |
| `APPLE_API_KEY_ID` | API key ID |
| `APPLE_API_ISSUER` | API issuer ID |

The workflow refuses to proceed if signing credentials are missing, builds both CPU architectures, verifies signatures and Gatekeeper assessment, and uploads DMG, ZIP, update manifests, and a generated Homebrew cask. Notarization is handled by electron-builder. See its [macOS documentation](https://www.electron.build/mac/) for credential formats.

Review the draft release and publish it after the artifacts pass verification. Put the generated `kafkalens.rb` into the maintained Homebrew tap. Its hashes are computed from the actual signed DMGs; no placeholder hashes are checked into the repository. This repository does not provision an Apple developer account, signing credentials, or a Homebrew tap.

For a local unsigned preview: `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac -w apps/desktop -- --publish never`. This preview is for local verification and is not a Gatekeeper-ready release.

## Updates

Installed builds check GitHub release metadata at startup and expose a manual check in Settings. Downloading and installing are explicit user actions. The release includes ZIP files and `latest-mac.yml`, which macOS updates require. Downloads never start automatically and normal app exit does not install updates. Updates require signed builds; an unsigned preview cannot validate the production update path.
