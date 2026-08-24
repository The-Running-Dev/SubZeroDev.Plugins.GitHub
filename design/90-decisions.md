# Decision log

Append-only. Newest at the top. The rejected alternatives are the point — without them, every future session relitigates the same choice.

## Open

<A staging area, not a home. Things noticed mid-slice that were deliberately not acted on. `/track` turns each into a GitHub issue and removes it from here.>

---

## 2026-08-24 — Migrate planning and decision ownership to AgentKit

**Decision.** `design/` is the canonical home for this repository’s brief, architecture, contract, slice state, and future decisions. The former root build and implementation plans and the project ADR set are superseded as planning authorities. Product documentation may describe current behavior, but must not become a second decision ledger.

**Why.** The previous arrangement split the same implementation intent between a build plan, a detailed implementation plan, ADRs, and repository guidance. Current work could not identify one authoritative place for an active slice or a decision without reconciling several documents.

**Rejected.** Retain the root plans and public ADRs as parallel canonical records — that preserves their familiar paths but recreates the duplicated ownership and stale-amendment problem the migration is intended to remove.

## 2026-08-01 — Name and distribute the npm package

**Decision.** Publish `@subzerodev/plugins-github` publicly on npmjs.com; retain `subzerodev-github` as the canonical executable, with `sz-github` and `plugins-github` as packaging aliases. Release the matching multi-platform OCI image through GHCR with provenance.

**Rejected.** The singular package name, GitHub Packages as the primary registry, and only two executables. The singular name mismatched the repository, GitHub Packages prevents anonymous `npx` reads, and npm cannot choose a binary for a bare multi-binary invocation.

## 2026-07-30 — Use the native request wrapper

**Decision.** Issue GitHub requests through `fetch` and this repository’s wrapper; test HTTP with an injected, recording fetch stub. Do not depend on Octokit or its retry/throttling plugins.

**Rejected.** Octokit reconstructs `304` and statistics `202` after treating them as exceptions; plugin retry/throttling violates the explicit stop-on-budget behavior; global HTTP mocks obscure per-endpoint request counts.

## 2026-07-28 — Set Phase One boundaries

**Decision.** Collect owned repositories only, using immutable GitHub numeric identity, bounded profiles, deterministic normalized output, and atomic per-file replacement. Generic cross-plugin rules are owned by `SubZeroDev.PluginContract`.

**Rejected.** Mutable slugs as cache keys, configuration-file tokens, synthesized capability flags, and directory swaps. They lose history, expand secret exposure, present guesses as data, or are not atomic on Windows.

## 2026-07-27 — Keep the plugin CLI-first

**Decision.** The GitHub plugin is standalone, independently versioned, and may later be called by an automation runtime through its contracts.

**Rejected.** Coupling the implementation to the future Automator. That would make a current CLI dependent on a runtime that does not yet exist and prevent other runners from using its services.
