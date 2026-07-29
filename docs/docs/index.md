---
title: 'SubZeroDev GitHub Plugin'
description: 'CLI-first GitHub integration that produces provider-independent, versioned project data.'
sidebar_position: 1
---

# SubZeroDev GitHub Plugin

CLI-first GitHub integration that produces provider-independent, versioned project data. This is the
first plugin under the SubZeroDev plugin contract, and the reference implementation the others are
scaffolded from.

The scaffold builds and its command surface is stable, but the data commands are placeholders — see
[`BUILD-PLAN.md`](https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub/blob/main/BUILD-PLAN.md)
for what is implemented and what is next.

## Where to go

- **[Using the plugin](./guide/getting-started.md)** — install it, run it locally, run it in Docker.
- **[Reference](./reference/cli.md)** — the CLI, the GitHub plugin specification, and where the
  implementation currently stands against the plugin contract.
- **[Architecture](./architecture.md)** — code layout and the provider boundary.
- **[Decisions](./decisions/index.md)** — the ADRs behind this plugin's design.
- **[Development](./development.md)** — local workflows, tests, and documentation maintenance.
