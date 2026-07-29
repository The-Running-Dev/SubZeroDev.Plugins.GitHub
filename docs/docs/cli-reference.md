---
title: CLI reference
description: Commands, options, and stable exit codes.
sidebar_position: 3
---

# CLI reference

```text
subzerodev-github <command> [options]
```

## Global options

| Option            | Meaning                                |
| ----------------- | -------------------------------------- |
| `-h`, `--help`    | Show usage and command help.           |
| `-v`, `--version` | Print the version from `package.json`. |

## Commands

| Command    | Intended responsibility                           | Current status |
| ---------- | ------------------------------------------------- | -------------- |
| `sync`     | Download or incrementally update repository data. | Placeholder    |
| `list`     | Display repositories.                             | Placeholder    |
| `stats`    | Display aggregate statistics.                     | Placeholder    |
| `export`   | Export normalized project data.                   | Placeholder    |
| `validate` | Validate configuration and cached data.           | Placeholder    |

Until implemented, each command prints an explanatory message to standard error
and exits with code `3`.

## Exit codes

| Code | Meaning                               |
| ---- | ------------------------------------- |
| `0`  | Success                               |
| `2`  | Usage or validation error             |
| `3`  | Operational failure                   |
| `4`  | Partial synchronization               |
| `5`  | Authentication or authorization error |
| `6`  | Rate-limited before completion        |

Exit code `1` is intentionally unused so uncaught exceptions remain distinct
from handled failures.
