---
title: 'SubZeroDev GitHub Plugin'
description: 'CLI-first GitHub integration that produces provider-independent, versioned project data.'
---

# SubZeroDev GitHub Plugin

CLI-first GitHub integration plugin that transforms GitHub repository data into
provider-independent, versioned project models.

This is the **first** plugin under the SubZeroDev plugin contract, and the reference
implementation the others are scaffolded from. The plugin lives in this repository but
does not depend on the workstation toolkit or a future automation runtime.

## Documentation

The complete documentation is published at
[plugins-github.subzerodev.com/docs/](/docs/):

- [Getting started](/docs/guide/getting-started)
- [Running in Docker](/docs/guide/docker)
- [CLI reference](/docs/reference/cli)
- [GitHub plugin specification](/docs/reference/specification)
- [Architecture](/docs/architecture)
- [Decisions](/docs/decisions/)
- [Development guide](/docs/development)

See
[`BUILD-PLAN.md`](https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub/blob/main/BUILD-PLAN.md)
for the milestone sequence and current status.

## Run it yourself

The plugin runs standalone. No orchestrator, no host, no service — a token in the
environment, a configuration file, and a terminal:

```bash
npx @subzerodev/plugins-github --help
npm install -g @subzerodev/plugins-github
subzerodev-github --help
```

```bash
export GITHUB_TOKEN=…          # secrets arrive by environment variable, never on the command line
subzerodev-github validate
subzerodev-github sync
subzerodev-github list
```

The Automator can run it later on a schedule, with history and approvals around it. That is an
integration layer, not a prerequisite.

## Identity

A repository's identity is GitHub's **immutable numeric ID**. `owner/name` is mutable metadata. A
rename or a transfer therefore resolves to the same repository rather than to a deletion and a new
arrival.

## Development

Requires Node.js 24 or later.

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
node dist/cli.js --help
```

### PowerShell runner

The cross-platform
[`run.ps1`](https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub/blob/main/run.ps1)
script provides the supported local and Docker workflows. Run it from
PowerShell 7 or later.

Install dependencies, run every check, build, and smoke-test the CLI:

```powershell
./run.ps1 -Mode Test
```

Build and run the local CLI. Positional arguments are passed to the CLI. Use
`-CliArgument` when an argument begins with a hyphen:

```powershell
./run.ps1 -Mode Local -CliArgument '--help'
./run.ps1 -Mode Local -SkipInstall -CliArgument '--version'
```

The CLI supports validation, incremental synchronization, cached listing and statistics, and
deterministic JSON/YAML export. `manifest`, `--help`, and `--version` work without a configuration
file, token, network, or writable mount.

Build the Docker image and run the CLI:

```powershell
./run.ps1 -Mode Docker -BuildImage -CliArgument '--help'
```

For authenticated commands, set the token in the current process and invoke the
container. The script forwards the environment variable by name; it does not
place the token value in the Docker command:

```powershell
$env:GITHUB_TOKEN = 'github_pat_replace_me'
./run.ps1 -Mode Docker -BuildImage sync
```

[Running in Docker](/docs/guide/docker) for the mounts, the
non-root user, and the direct `docker run` commands without the PowerShell wrapper.

## CLI

```bash
subzerodev-github validate
subzerodev-github sync --profile standard
subzerodev-github list --limit 100
subzerodev-github stats --json
subzerodev-github export --format json --format yaml
subzerodev-github manifest
```

Global options are `--help`, `--version`, `--output-format <text|json>`, `--json`,
`--config <path>`, `--log-level <level>`, `--quiet`, and `--dry-run`. Command options are
`sync --profile <basic|standard|detailed> --no-cache --include-forks`, `list --limit <1-1000>`, and
`export --format <json|yaml> --output <path>`. `--dry-run` previews sync and export without writes.

Exit codes and option details are documented once, in
the [CLI reference](/docs/reference/cli) — the plugin contract
is their canonical source, and this repository does not keep a second copy of that table.

## Status

Milestones 0 through 8 are implemented. The first public npm/GHCR/GitHub Release remains gated on the
stacked pull requests merging and the tagged release workflow completing successfully.

[`BUILD-PLAN.md`](https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub/blob/main/BUILD-PLAN.md)
says what comes next and in what order.

## License

Licensed under the
[MIT License](/docs/license).

[View the documentation](/docs/)
