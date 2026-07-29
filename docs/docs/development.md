---
title: Development
description: Local workflows, tests, Docker, and documentation maintenance.
sidebar_position: 5
---

# Development

## Application checks

```bash
npm ci
npm run check
node dist/cli.js --help
```

The test suite uses Vitest. TypeScript is configured in strict NodeNext mode,
with unchecked indexed access and exact optional-property types enabled.

The supported PowerShell equivalent is:

```powershell
./run.ps1 -Mode Test
```

## Docker image

The production image uses a Node.js 24 build stage and installs production
dependencies in a slim runtime stage. It runs as the unprivileged user
`subzerodev` with UID 10001.

On Linux, bind-mounted directories may require running the container with the
host UID and GID. The PowerShell runner handles that automatically unless
`-DockerUser` is supplied.

## Documentation

Authored pages live under `docs/docs/`. The homepage is generated from
`README.md`; do not edit `docs/docs/index.md` directly.

```powershell
./docs.ps1 -BuildOnly
./build/Test-Documentation.ps1
```

The documentation build uses the shared template image pinned by immutable
digest. Pull requests run the Markdown gate and a production-equivalent build.
Pushes to `main` build and deploy through GitHub Pages.

## Before committing

```powershell
npm run check
node dist/cli.js --help
./build/Test-Documentation.ps1
git diff --check
```
