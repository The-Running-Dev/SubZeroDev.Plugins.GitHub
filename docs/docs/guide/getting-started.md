---
title: Getting started
description: Install, validate, and run the SubZeroDev GitHub Plugin.
sidebar_position: 1
---

# Getting Started

The plugin validates access, synchronizes GitHub repositories into a local cache, lists and
summarizes cached projects, and exports deterministic JSON and YAML documents.

## Requirements

- Node.js 24 or later
- A GitHub token supplied through an environment variable
- Docker or PowerShell 7 only for their respective workflows

## Install

Run without installing, install globally, or install as a project dependency:

```bash
npx @subzerodev/plugins-github --help
npm install -g @subzerodev/plugins-github
npm install @subzerodev/plugins-github
```

The canonical executable is `subzerodev-github`; `sz-github` is a convenience alias.

## Configure and run

Copy `examples/github.config.json`, put the token in its configured environment variable, and run:

```bash
subzerodev-github validate --json
subzerodev-github sync --json
subzerodev-github list
subzerodev-github stats
subzerodev-github export --json
```

Tokens never belong in configuration or CLI arguments. For a repository clone, `npm ci && npm run
check` runs formatting, lint, types, tests, generated artifacts, and the production build.

## Next

- [Running in Docker](./docker.md) for the container workflow
- [Configuration](./configuration.md) for settings and precedence
- [CLI reference](../reference/cli.md) for commands, options, and exit codes
- [Troubleshooting](./troubleshooting.md) for cache, rate-limit, and export recovery
