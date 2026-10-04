# Thin wrappers over the npm scripts in package.json — those scripts stay the
# source of truth for how KafkaLens is built and run.

.DEFAULT_GOAL := help
.PHONY: help install dev build start typecheck lint test check audit package export clean \
	test-integration test-desktop test-performance fixtures-up fixtures-down

NPM ?= npm
NODE ?= node
DOCKER ?= docker
APP_DEST ?=

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  make %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install locked dependencies and the Electron binary
	$(NPM) ci --ignore-scripts
	$(NODE) node_modules/electron/install.js

dev: ## Run the Vite dev server and Electron window
	env -u ELECTRON_RUN_AS_NODE $(NPM) run dev

build: ## Build the main process, preload, and renderer
	$(NPM) run build

start: build ## Build and launch the production Electron preview
	env -u ELECTRON_RUN_AS_NODE $(NPM) run preview

typecheck: ## Typecheck the main process and renderer
	$(NPM) run typecheck

lint: ## Lint the project
	$(NPM) run lint

test: ## Run unit tests
	$(NPM) test

check: ## Run lint, typechecks, unit tests, and the production build
	$(NPM) run check

audit: ## Check dependencies for known vulnerabilities
	$(NPM) audit --audit-level=high

fixtures-up: ## Start the disposable Kafka and Schema Registry fixtures
	$(DOCKER) compose -f compose.test.yaml up -d --wait --wait-timeout 120

fixtures-down: ## Remove the disposable fixtures and their volumes
	$(DOCKER) compose -f compose.test.yaml down -v

test-integration: ## Run real Kafka/Registry checks (needs fixtures-up)
	$(NPM) run test:integration

test-desktop: build ## Run the macOS desktop suite (needs fixtures-up)
	env -u ELECTRON_RUN_AS_NODE $(NPM) run test:desktop

test-performance: ## Run Kafka performance benchmarks (needs fixtures-up)
	$(NPM) run test:performance

package: ## Build unsigned local macOS DMG and ZIP previews
	@test "$$(uname -s)" = Darwin || { echo "macOS packaging requires macOS."; exit 1; }
	CSC_IDENTITY_AUTO_DISCOVERY=false $(NPM) run build:mac -w apps/desktop -- --publish never

export: ## Build/install unsigned KafkaLens.app for Spotlight (macOS)
	@test "$$(uname -s)" = Darwin || { echo "App installation requires macOS."; exit 1; }
	CSC_IDENTITY_AUTO_DISCOVERY=false $(NPM) run build:unpack -w apps/desktop -- --mac --publish never --config.directories.output=release/export
	@set -eu; \
	kafkalens_app=$$(find apps/desktop/release/export -maxdepth 2 -type d -name KafkaLens.app -print -quit); \
	if [ -z "$$kafkalens_app" ]; then echo "KafkaLens.app not found under apps/desktop/release/export/"; exit 1; fi; \
	kafkalens_dest="$(APP_DEST)"; \
	if [ -z "$$kafkalens_dest" ]; then \
		if [ -w /Applications ]; then kafkalens_dest=/Applications; else kafkalens_dest="$$HOME/Applications"; fi; \
	fi; \
	mkdir -p "$$kafkalens_dest"; \
	kafkalens_stage=$$(mktemp -d "$$kafkalens_dest/.kafkalens-install.XXXXXX"); \
	trap 'rm -rf "$$kafkalens_stage"' 0; \
	ditto "$$kafkalens_app" "$$kafkalens_stage/KafkaLens.app"; \
	rm -rf "$$kafkalens_dest/KafkaLens.app"; \
	mv "$$kafkalens_stage/KafkaLens.app" "$$kafkalens_dest/KafkaLens.app"; \
	echo "Installed $$kafkalens_dest/KafkaLens.app — launch it from Spotlight (⌘Space → KafkaLens)"

clean: ## Remove generated builds, packages, and coverage
	rm -rf apps/desktop/out apps/desktop/release coverage
