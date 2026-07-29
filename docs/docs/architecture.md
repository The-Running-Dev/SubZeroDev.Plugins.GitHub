---
title: Architecture
description: Ownership boundaries and the current provider-independent model.
sidebar_position: 4
---

# Architecture

The plugin separates provider-specific acquisition from provider-independent
project data. That boundary allows future consumers to depend on stable models
without importing GitHub API details.

## Public model

The current `Project` model is validated with Zod and contains:

| Field           | Purpose                                            |
| --------------- | -------------------------------------------------- |
| `schemaVersion` | Identifies the serialized contract version.        |
| `id`            | Non-empty provider project identifier.             |
| `name`          | Non-empty display name.                            |
| `provider`      | Non-empty provider identifier, currently `github`. |

The exported `SCHEMA_VERSION` is `1.0.0`. Unsupported versions fail runtime
validation rather than being accepted as compatible.

## Provider boundary

`ProjectProvider` exposes a provider name and an asynchronous `discover()`
operation returning immutable projects. GitHub-specific discovery belongs under
`src/providers/github/`; consumers import provider-independent types through
`src/index.ts`.

## Planned layers

The scaffold reserves focused directories for:

- configuration loading and validation;
- provider acquisition;
- caching;
- serialization;
- services and orchestration;
- CLI command handlers;
- human-readable output.

Authoritative state must remain deterministic and serializable. Derived caches
must not be persisted as authoritative project state.
