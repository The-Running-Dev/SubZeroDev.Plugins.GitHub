---
title: Getting started
description: Install, validate, and run the SubZeroDev GitHub Plugin.
sidebar_position: 1
---

# Getting started

The SubZeroDev GitHub Plugin currently provides a stable command surface and a
versioned project model. The data commands remain explicit placeholders while
their implementation milestones are in progress.

## Requirements

- Node.js 24 or later
- npm
- PowerShell 7 or later for the repository runner
- Docker for container workflows

## Install and validate

```bash
npm ci
npm run check
node dist/cli.js --help
```

`npm run check` verifies formatting, lint rules, types, tests, and the production
build.

## Run locally

```powershell
./run.ps1 -Mode Local -CliArgument '--help'
./run.ps1 -Mode Local -SkipInstall -CliArgument '--version'
```

The runner installs locked dependencies unless `-SkipInstall` is supplied,
builds the CLI, and passes remaining arguments to it.

## Current limitation

`sync`, `list`, `stats`, `export`, and `validate` currently report that they are
not implemented and exit with code `3`. Help and version output are functional. The plugin contract
additionally requires a `manifest` command; it does not exist in this scaffold yet — see the
[CLI reference](../reference/cli.md).

## Next

- [Running in Docker](./docker.md) for the container workflow
- [CLI reference](../reference/cli.md) for the full command and option surface
