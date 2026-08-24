# Contract — SubZeroDev GitHub Plugin

## Ownership

`SubZeroDev.PluginContract` is authoritative for rules shared by more than one plugin. This repository owns GitHub scope and filters, GitHub capability mapping, the numeric GitHub identity, collection profiles and budgets, summary selection, and portfolio overrides.

## Invariants

- Identity is the immutable GitHub numeric ID, namespaced by provider; `owner/name` is never a key.
- GitHub types do not escape `src/providers/github`; consumers receive provider-neutral models.
- The configuration can name a token environment variable but cannot contain a token value.
- Logging writes to stderr; stdout remains the machine-readable result envelope.
- Persisted authoritative outputs are versioned, deterministic, and validated at their boundary.
- Cache and export writes preserve the last complete valid state under interruption or partial failure.
- Unavailable data is explicit (`null` plus diagnostics), never a plausible fabricated value.
- Output ordering uses the project’s deterministic code-unit comparison, never locale-dependent sorting.

## GitHub semantics

Phase One covers repositories owned by the authenticated user. Forks are excluded by default but configurable; private, archived, disabled, and template repositories remain in scope and are flagged. Organization and contributed repositories are deferred.

GitHub’s `open_issues_count` is not an issue count because it includes pull requests. Contributor lists carry truncation state. Commit count derives from the last page in the `Link` header. Search API usage is budgeted separately and its eventually consistent results must not create false changes.

## Error semantics

Authentication, validation, operational failure, rate limiting, and partial success follow the plugin contract’s result-envelope and exit-code rules. Partial synchronization retains prior valid data for a failed repository, writes successful results, and reports diagnostics. A `202` from a statistics endpoint is never surfaced as data, and `304 Not Modified` is a successful cache outcome.

## Acceptance boundary

The definitive executable surface is declared by the CLI, schemas, and tests. Product-facing details belong in [`docs/docs/reference/specification.md`](../docs/docs/reference/specification.md); this file states the invariants that implementation and documentation must not weaken.
