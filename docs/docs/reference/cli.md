---
title: CLI reference
description: Commands, options, and the exit-code table — the single copy of it in this repository.
sidebar_position: 1
---

# CLI reference

```text
subzerodev-github <command> [options]
```

All operational commands emit text by default and one contract result envelope with `--json` or
`--output-format json`. `manifest` always emits its canonical JSON document and requires no
configuration, credential, network, cache, or output directory.

## Global options

| Option                         | Meaning                                           | Implemented today |
| ------------------------------ | ------------------------------------------------- | ----------------- |
| `-h`, `--help`                 | Usage to stdout, exit 0. Also valid per command.  | Yes               |
| `-v`, `--version`              | Plugin version to stdout, exit 0.                 | Yes               |
| `--output-format <text\|json>` | Selects the output channel. Default `text`.       | Yes               |
| `--json`                       | Alias for `--output-format json`.                 | Yes               |
| `--config <path>`              | Configuration file location.                      | Yes               |
| `--log-level <level>`          | One of `error`, `warn`, `info`, `debug`, `trace`. | Yes               |
| `--quiet`                      | Suppress non-essential stderr output.             | Yes               |
| `--dry-run`                    | Preview `sync` or `export` with zero writes.      | Yes               |

Global options may appear before or after the command. Combining `--json` with
`--output-format text` is refused instead of silently choosing one.

## Commands

| Command    | Purpose                                            | Implemented today |
| ---------- | -------------------------------------------------- | ----------------- |
| `manifest` | Print the canonical plugin manifest.               | Yes               |
| `validate` | Validate configuration and GitHub access.          | Yes               |
| `sync`     | Incrementally synchronize repository data.         | Yes               |
| `list`     | Display repositories from the local cache.         | Yes               |
| `stats`    | Display aggregate cached statistics.               | Yes               |
| `export`   | Export deterministic normalized project documents. | Yes               |

### Command-specific options

| Command  | Option              | Meaning                                   |
| -------- | ------------------- | ----------------------------------------- |
| `sync`   | `--profile <value>` | `basic`, `standard`, or `detailed`.       |
| `sync`   | `--no-cache`        | Ignore the prior cache while collecting.  |
| `sync`   | `--include-forks`   | Include forks for this run.               |
| `list`   | `--limit <value>`   | Return 1–1000 repositories; default 100.  |
| `export` | `--format <value>`  | Export `json` or `yaml`; may be repeated. |
| `export` | `--output <path>`   | Override the configured output directory. |

Portfolio overrides are loaded from `portfolio.overrides` in configuration. The file has
`schemaVersion: "1.0.0"` and an `overrides` array; each entry carries `providerId`, an optional
human-readable `slug`, and a partial `portfolio` object. Only the immutable `providerId` matches.

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

Commands map invalid use/configuration to `2`, operational failures to `3`, partial synchronization
to `4`, authentication failures to `5`, and rate/budget stops with no usable result to `6`.
