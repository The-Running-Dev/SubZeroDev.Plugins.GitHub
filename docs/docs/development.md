---
title: Development
description: Local workflows, tests, Docker, and documentation maintenance.
sidebar_position: 6
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

Authored pages live under `docs/docs/`, grouped into `guide/`, `reference/`, and `decisions/`
sections plus a few top-level pages, with `sidebar_position` front matter setting reading order
within each level. The site homepage — `docs/src/pages/index.md`, not `docs/docs/index.md` — is
generated from `README.md`. Do not edit it directly; after changing the README, regenerate it:

```powershell
./docs.ps1 -BuildOnly
```

`docs.ps1` needs Docker. Without it, invoke the generator directly with the arguments recorded in
`.config/DocumentationRules.psd1`:

```powershell
./build/ConvertTo-DocumentationHomepage.ps1 -ReadmePath ./README.md `
  -Title 'SubZeroDev GitHub Plugin' `
  -Description 'CLI-first GitHub integration that produces provider-independent, versioned project data.' `
  -SiteUrl 'https://plugins-github.subzerodev.com/' -RouteBasePath 'docs' `
  -OutputPath docs/src/pages/index.md
```

Then validate:

```powershell
./build/Test-Documentation.ps1
```

`specs/` — the staged specifications for other, not-yet-split SubZeroDev repositories — is excluded
from this gate and from Prettier. It follows another repository's conventions and is not part of
this plugin's documentation; see `AGENTS.md`.

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
