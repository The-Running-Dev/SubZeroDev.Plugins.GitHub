---
title: Architecture
description: Ownership boundaries, the provider boundary, and the channel and identity rules the plugin contract sets.
sidebar_position: 4
---

# Architecture

The plugin separates provider-specific acquisition from provider-independent
project data. That boundary allows future consumers to depend on stable models
without importing GitHub API details.

## Current model, and the target model

The `Project` type exported today (`src/models/project.ts`) is a 4-field scaffold — `schemaVersion`,
`id`, `name`, `provider` — validated with Zod, with `SCHEMA_VERSION` at `1.0.0`. Unsupported schema
versions fail runtime validation rather than being accepted as compatible.

This is not the target shape. The
[GitHub plugin specification](./reference/specification.md) defines the full normalized project
model this plugin is building toward — identity, source, timestamps, technology, statistics,
releases, and portfolio overrides — and is the authoritative description of it. Two rules from that
specification apply to every version of the model, including the current 4-field one:

- **Identity is the provider's immutable numeric ID, serialized as a string.** `owner/name` (or the
  equivalent slug in another provider) is mutable display metadata and is never a key — not for the
  cache, not for a portfolio override, not for tie-breaking. A 64-bit provider ID does not survive a
  round trip through a JSON number in every language, which is why it serializes as a string.
- **A renamed or transferred repository resolves to the same identity.** Keying on the slug instead
  turns a rename into a delete-plus-add, discarding history and re-fetching everything.

## Provider boundary

`ProjectProvider` exposes a provider name and an asynchronous `discover()`
operation returning immutable projects. GitHub-specific discovery belongs under
`src/providers/github/`; consumers import provider-independent types through
`src/index.ts`. No Octokit type may escape `src/providers/github/` — the domain models stay
provider-neutral, or the abstraction is decorative.

## The plugin boundary

This plugin also sits inside a second, outer boundary: the
[SubZeroDev plugin contract](./reference/specification.md), which every SubZeroDev plugin
implements regardless of language. Three rules from it shape everything in `src/`, referenced here
rather than restated — see the [CLI reference](./reference/cli.md) for the full exit-code table and
[Where the implementation stands](./reference/contract-conformance.md) for how much of this is built:

- **stdout is machine-only.** The manifest, or the result envelope in JSON mode, and nothing else.
- **Logs go to stderr, at every level.** A structured logger that defaults to stdout — Pino among
  them — must be constructed against stderr explicitly, or it corrupts the envelope.
- **Secrets arrive by environment variable only** — never `argv`, never a configuration file, never a
  tool argument.

## Planned layers

The scaffold reserves focused directories under `src/` for configuration loading and validation,
provider acquisition, caching, serialization, services and orchestration, CLI command handlers, and
human-readable output. Most are currently empty (`.gitkeep` only) — see
[Where the implementation stands](./reference/contract-conformance.md) for which.

The contract also requires repository-root structure this plugin does not have yet: `schemas/` and
`examples/` directories, a `plugin.yaml` manifest, and a `CHANGELOG.md`.

Authoritative state must remain deterministic and serializable. Derived caches
must not be persisted as authoritative project state.
