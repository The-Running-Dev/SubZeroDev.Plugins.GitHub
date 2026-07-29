---
title: CLI reference
description: Commands, options, and the exit-code table — the single copy of it in this repository.
sidebar_position: 1
---

# CLI reference

```text
subzerodev-github <command> [options]
```

This page states what the [plugin contract](./specification.md) requires of the CLI surface, and
separately what this scaffold currently implements. Where the two disagree, that is a gap tracked in
[`BUILD-PLAN.md`](https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub/blob/main/BUILD-PLAN.md),
not a documentation error — see
[Where the implementation stands](./contract-conformance.md) for the full accounting.

## Global options

| Option                         | Meaning                                           | Implemented today |
| ------------------------------ | ------------------------------------------------- | ----------------- |
| `-h`, `--help`                 | Usage to stdout, exit 0. Also valid per command.  | Yes               |
| `-v`, `--version`              | Plugin version to stdout, exit 0.                 | Yes               |
| `--output-format <text\|json>` | Selects the output channel. Default `text`.       | No                |
| `--json`                       | Alias for `--output-format json`.                 | No                |
| `--config <path>`              | Configuration file location.                      | No                |
| `--log-level <level>`          | One of `error`, `warn`, `info`, `debug`, `trace`. | No                |
| `--quiet`                      | Suppress non-essential stderr output.             | No                |
| `--dry-run`                    | Required for any command with side effects.       | No                |

The right-hand column matters: the plugin contract requires the full set, but only `--help` and
`--version` exist in the CLI parser today.

## Commands

| Command    | Purpose                                                  | Current status                                                                                     |
| ---------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `manifest` | Print the plugin manifest. **Required by the contract.** | Not implemented — the command does not exist; invoking it exits `2` as an unknown command, not `3` |
| `validate` | Validate configuration, credentials, and cache.          | Placeholder — prints a message and exits `3`                                                       |
| `sync`     | Download or incrementally update repository data.        | Placeholder — prints a message and exits `3`                                                       |
| `list`     | Display repositories from cache.                         | Placeholder — prints a message and exits `3`                                                       |
| `stats`    | Display aggregate statistics.                            | Placeholder — prints a message and exits `3`                                                       |
| `export`   | Export normalized project data.                          | Placeholder — prints a message and exits `3`                                                       |

`manifest` and `validate` are the two commands every conforming plugin must have. `manifest` must
succeed with no configuration, no secrets, no network, and no mounts — see the
[plugin specification](./specification.md) for the contract's bare-container requirement.

## Exit codes

The canonical source for this table is the plugin contract in `SubZeroDev.PluginContract`. It appears
here once, in full, so a caller of this CLI does not have to leave this site to look it up — no other
page in this repository restates it.

| Code  | Meaning                                 |
| ----- | --------------------------------------- |
| `0`   | Success                                 |
| `2`   | Usage or validation error               |
| `3`   | Operational failure                     |
| `4`   | Partial success                         |
| `5`   | Authentication or authorization failure |
| `6`   | Rate-limited or quota-exhausted         |
| `124` | Timed out                               |
| `130` | Cancelled or interrupted                |

`1` is reserved and never assigned — most runtimes return it for an uncaught exception, so leaving it
unassigned keeps "the plugin crashed" distinguishable from "the plugin reported a failure". `124` and
`130` follow `timeout(1)` and `128 + SIGINT`, so shell tooling and container runtimes already produce
them.

Today, `cli.ts` only ever returns `0` (help/version), `2` (unknown command or bad option), or `3`
(placeholder command). Codes `4`, `5`, `6`, `124`, and `130` are contract obligations this scaffold
does not yet trigger.
