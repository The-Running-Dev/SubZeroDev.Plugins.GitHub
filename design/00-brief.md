# Brief — SubZeroDev GitHub Plugin

## Problem

GitHub repository data is provider-specific, mutable in presentation, and expensive to collect repeatedly. Consumers need a stable, versioned project model without querying GitHub directly or depending on a future automation runtime.

## Who it is for

The first user is the SubZeroDev portfolio and automation ecosystem. The plugin must also be usable by a person from a terminal, without the Automator, with a path for future providers to produce the same model.

## Non-goals

- A web UI, database, scheduler, background service, automation runtime, workflow engine, MCP server, or REST API.
- Organization and contributed-repository discovery in Phase One.
- Historical cache snapshots or per-repository output files.

## Definition of done

- Owned GitHub repositories in scope are collected once, normalized into the provider-independent model, and exported deterministically.
- Failures, rate limiting, and interruption preserve the last valid cache and report useful diagnostics without exposing secrets.
- Native and container execution meet the plugin-contract conformance requirements; release artifacts can be published consistently.

## Environment

Node.js 24+, strict TypeScript, Zod, Pino, Vitest, Docker, and GitHub REST requests. The supported platforms are Windows and Linux. The default collection profile is designed for accounts with hundreds of repositories and bounded primary and Search API budgets.

## Lifespan

Maintained for years. This is the reference implementation for future SubZeroDev plugins, so choices that look local must be assessed for their ecosystem impact.
