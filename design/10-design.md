# Design — SubZeroDev GitHub Plugin

## Architecture

The CLI is a thin runner over provider-neutral application services. GitHub acquisition is isolated under `src/providers/github`; normalized models, serialization, cache coordination, and command orchestration must not expose GitHub response types. The project tree is the canonical source for the module layout and runtime shapes.

The adapter uses `fetch` through one request wrapper rather than Octokit. The wrapper owns conditional-request headers, rate-limit accounting, response classification, bounded retry for network and 5xx failures, and secret-safe diagnostics. `304` is a cache success; statistics `202` is a bounded-retry outcome; rate limiting stops cleanly rather than sleeping through the budget.

## Data and persistence

Repository identity is the GitHub numeric repository ID, namespaced by provider and serialized as a string. A slug is mutable display metadata. The cache is keyed by that identity and retains resource ETags, successful-sync state, and per-repository diagnostics. Writes stage each file and replace it by rename so interruption cannot corrupt the last valid cache.

The canonical outputs are consolidated, versioned documents. User-authored portfolio overrides remain separate from acquired provider data and are keyed by the same immutable identity.

## Operational boundaries

Collection profiles make request cost explicit. GitHub’s primary and Search rate-limit buckets are tracked separately; a run warns at half the primary budget and stops at the configured safety limit with partial-success diagnostics. Statistics that cannot be acquired are `null` with diagnostics, never invented as zero.

The package runs standalone through the CLI and Docker image. A later automation runtime may invoke the same public contracts but is not a dependency or a required runner.

## Failure modes

- A rename or transfer must update the same cache record, not create a deletion and an addition.
- Truncated contributors, eventually consistent Search counts, and computing statistics must remain visibly approximate or unavailable rather than silently becoming authoritative values.
- Logs go to stderr so machine-readable stdout stays a single result envelope.
- API-response drift is rejected at the provider boundary by runtime validation.

## Canonical references

The GitHub-specific user reference remains [`docs/docs/reference/specification.md`](../docs/docs/reference/specification.md). The plugin contract owns cross-plugin semantics such as exit codes, secret handling, serialization, configuration precedence, logging, manifest shape, and determinism. This document owns the architecture and failure-mode rationale for this repository.
