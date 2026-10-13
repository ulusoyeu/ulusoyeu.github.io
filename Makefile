# Everything runs through a project-local Node installed into .tools/ (no global install).
# Usage: make setup | make dev | make build | make preview

NODE_VERSION := $(shell cat .node-version)
OS   := $(shell uname -s | tr A-Z a-z)
ARCH := $(shell uname -m | sed -e 's/x86_64/x64/' -e 's/aarch64/arm64/')
NODE_DIR := .tools/node-v$(NODE_VERSION)-$(OS)-$(ARCH)
NPM := PATH="$(CURDIR)/$(NODE_DIR)/bin:$$PATH" npm

.PHONY: setup dev build preview clean

$(NODE_DIR)/bin/node:
	mkdir -p .tools
	curl -fsSL https://nodejs.org/dist/v$(NODE_VERSION)/node-v$(NODE_VERSION)-$(OS)-$(ARCH).tar.gz | tar -xz -C .tools

node_modules: $(NODE_DIR)/bin/node package-lock.json
	$(NPM) ci
	touch node_modules

setup: node_modules

# The content cache can keep entries parsed with an old schema after
# src/content.config.ts changes, so start every dev session from fresh content.
dev: setup
	rm -f .astro/data-store.json
	$(NPM) run dev

build: setup
	$(NPM) run build

preview: build
	$(NPM) run preview

clean:
	rm -rf dist .astro node_modules .tools
