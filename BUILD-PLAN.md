# GitHub Plugin — Build Plan

Companion to the [GitHub plugin specification](docs/docs/reference/specification.md) and to
[`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md), which is the concrete architecture underneath this
document — files, types, and test strategy per milestone. This document owns milestone numbering, exit
criteria, and the PR sequence at a high level; `IMPLEMENTATION-PLAN.md` is what an implementer works
from directly. Merged from the retired `IMPLEMENTATION_PLAN.md` and root `TODO-next.md`, which
described the same milestones in two places with two numbering schemes. See
[`BUILD-PLAN-REVIEW.md`](BUILD-PLAN-REVIEW.md) for the review that produced this plan.

This is **Phase 1** of `SubZeroDev.Ecosystem/18-roadmap.md`, which owns phase numbering for the
ecosystem. Milestone numbers below are local to this plugin.

Everything generic — exit codes, secrets, envelope, serialization, determinism, configuration,
logging, the manifest — is in the plugin contract and referenced, never restated.

## Current state

The plugin exists and is green: a Node.js 24+, strict TypeScript, ESM package with a CLI entry point
carrying the Phase One command names, a minimal versioned `Project` schema, a provider-independent
boundary, Vitest, ESLint, Prettier, and Docker.

The commands intentionally return "not implemented". No GitHub API, configuration, synchronization,
cache, export, or statistics behaviour exists yet.

**Milestone 0 is pending CI observation.** The `[ubuntu-latest, windows-latest]` matrix and
`fail-fast: false` are configured in this branch, but a green Windows run has not yet been observed.
The container job remains a Milestone 8 deliverable. This repository's git history does not contain a
PR #11; an earlier version of this section claimed both a PR and a completed Windows run, which was
wrong.

## Ordering principle

Contracts first, provider access second, persistence third, user-facing commands last. Two
deliberate departures from that, both de-risking:

- **Milestone 3.5** runs against a real account before the expensive statistics and cache work, so
  everything after is built against real payloads rather than mocks that encode the same assumptions
  as the code.
- **The `manifest` command and envelope** come early, because conformance depends on them.

## Milestone 0 — Close decisions and stabilize the scaffold — **partially complete**

- [x] Phase One boundary decisions recorded in
      [ADR-002](docs/docs/decisions/adr-002-phase-one-boundaries.md)
- [x] Specification reconciled; contradictions and open questions closed
- [x] Root `.gitattributes` pinning text to LF, so `format:check` agrees across platforms
- [x] Installed-entry-point test made portable, probing symlink support and skipping where the
      platform forbids it
- [x] `[ubuntu-latest, windows-latest]` CI matrix, `fail-fast: false`, defaulting to bash
- [ ] Matrix check suite observed green on both Windows and Linux
- [x] CLI exit codes defined, `1` reserved for uncaught exceptions

## Milestone 1 — Domain contracts and canonical schemas

- [ ] Versioned `Project`, `Repository`, `LanguageStatistics`, `Release`, `ReleaseAsset`, `Branch`,
      `Contributor`, `RepositoryStatistics`, `Summary`, and the top-level documents
- [ ] Provider-namespaced identity on GitHub's immutable numeric ID, with `owner` and `name` as
      mutable metadata
- [ ] Schema-version compatibility check: accept same major, reject otherwise
- [ ] Zod schemas as the source of truth, preferring `null` over `.optional()` for serialized fields
- [ ] `projects.schema.json` generated with `z.toJSONSchema()` — do not add `zod-to-json-schema`,
      which targets Zod 3
- [ ] Fixtures: minimum, complete, private, archived, fork, template, Unicode

**Exit:** valid fixtures round-trip without semantic change; invalid versions, timestamps, URLs,
percentages, and duplicate IDs fail with useful paths; a renamed repository resolves to the same
identity; language percentages total 100 under a documented rounding rule; no provider type appears
in a domain model.

## Milestone 2 — Ports, configuration, and secret safety

- [ ] Versioned `github.config.json`: filters, collection profile, directories, formats,
      concurrency, request budget, token variable name
- [ ] Precedence and config-relative path resolution per the contract
- [ ] Provider-neutral discovery and detail-fetch contracts carrying rate-limit and partial-failure
      results
- [ ] Clock, logger, cache, and serializer interfaces
- [ ] Pino constructed against **stderr**, with redaction for authorization headers, token fields,
      request errors, and nested causes

**Exit:** the configuration schema cannot represent a raw token; malformed and incompatible config
produce stable errors and exit codes; secret canary tests prove tokens reach no stdout, stderr, log,
or serialized error.

## Milestone 3 — GitHub adapter and repository discovery

- [ ] Octokit construction from the resolved environment token
- [ ] Authenticated connectivity check
- [ ] Paginated owned-repository discovery with the configured filters
- [ ] Mapping into provider-neutral records
- [ ] Central request wrapper: ETags, rate-limit capture, retries, error classification, redaction
- [ ] Bounded concurrency, starting conservative

Test with mocked HTTP: empty, one-page, and multi-page accounts; filter combinations; private
repositories and missing optional fields; 401, 403, 404, 429, 5xx, network interruption, and
response-shape drift; primary and secondary rate limits.

**Exit:** Octokit imports remain under `providers/github`; every owned repository discovered exactly
once; errors carry context without secrets.

## Milestone 3.5 — First runnable slice

**The de-risking step.** Everything after this is built against real payloads.

- [ ] `validate`, plus a discovery-and-core-metadata `sync`, plus enough `list` to read the cache
- [ ] Run `validate → sync → list` against one real account
- [ ] Compare observed request counts against the budget; correct the budget if reality disagrees
- [ ] Fold every mapping correction back into the Milestone 1 fixtures

## Milestone 4 — Metadata and statistics

- [ ] Endpoint-and-budget table carrying, per field: endpoint, pagination, ETag support, cost,
      rate-limit bucket, fallback, and whether absence is partial failure or valid null
- [ ] Core metadata and the capability flags GitHub actually exposes
- [ ] Language bytes and normalized percentages
- [ ] Releases, tags, branches, contributors with truncation flag, issues and pull requests
- [ ] Commit count via `per_page=1` and the `Link` `rel="last"` page number
- [ ] Collection profiles: `basic`, `standard`, `detailed`
- [ ] Aggregate statistics and summary selection with deterministic tie-breakers

The hazards this must handle are in the
[GitHub plugin specification](docs/docs/reference/specification.md): `202` while statistics compute, the
contributor cap, `open_issues_count` including pull requests, and the Search API's separate bucket.

**Exit:** request count bounded and observable, within the per-repository budget; large paginated
fixtures lose and duplicate nothing; unavailable statistics produce `null` plus diagnostics; a `202`
never reaches a caller as data.

## Milestone 5 — Cache and incremental synchronization

- [ ] Versioned manifest: schema and cache versions, owner identity, last complete sync, per-resource
      ETags and fetch times, repository identity and content hash, deletion reconciliation, and
      secret-free diagnostics
- [ ] First sync; conditional requests; reuse of valid unchanged data
- [ ] Addition, change, rename, transfer, archive, and deletion reconciliation, keyed on immutable
      identity so a rename is not a delete-plus-add
- [ ] Staging writes then per-file `rename` — never a directory swap
- [ ] Startup cleanup of abandoned staging data; integrity validation; incompatible-version handling

**Exit:** an interrupted write cannot damage the last valid cache, verified on Windows as well as
Linux; an unchanged second sync is byte-identical and measurably cheaper; partial failure exits `4`,
retains prior valid data, and records actionable diagnostics.

## Milestone 6 — Serializers and exports

- [ ] Deterministic `projects.json`, `projects.schema.json`, `statistics.json`, `summary.json`,
      `projects.yaml`, and `sync-report.json`
- [ ] Optional `raw/` retention, off by default and excluded from determinism comparison
- [ ] Every document serialized to staging before any is renamed

**Exit:** golden-file tests byte-stable across runs; every document validates against its schema;
export failure leaves the previous complete output set intact.

## Milestone 7 — Application services and CLI commands

- [ ] `sync`, `list`, `stats`, `export`, `validate`, `manifest`
- [ ] Global and command-specific options through two-stage `parseArgs`
- [ ] Result envelope and `--output-format`
- [ ] Exit codes wired through

**Exit:** command tests use injected services, needing neither network nor real filesystem;
end-to-end tests cover success, invalid use, authentication failure, partial sync, rate limiting,
corrupt cache, and export failure; help text and README match actual options.

## Milestone 8 — Docker, documentation, release

- [x] Non-root container user
- [x] Writable cache and output mounts
- [x] Token injection documented without secrets in image layers
- [ ] Read-only configuration mount
- [ ] A `container` CI job, which does not exist yet — create it, do not extend it (see
      `IMPLEMENTATION-PLAN.md` §10)
- [ ] Documentation: quick start, token setup, configuration, commands, schemas, cache recovery,
      rate limits, troubleshooting — stating that incompatible exports are regenerated, not migrated
- [ ] Recorded HTTP fixtures or a controlled fixture account; never a developer's live account in CI
- [ ] Signed image and signed manifest attestation
- [ ] Conformance suite passes
- [ ] Packaging blockers cleared: `private: true` blocks publish, and neither `license` nor
      `repository` is declared. A `LICENSE` file already exists at the repository root but is not
      mirrored into `package.json`
- [ ] **npm package published to npmjs.com** as `@subzerodev/plugins-github`, with the tarball also
      attached to the GitHub Release, and `npx @subzerodev/plugins-github` working with no `.npmrc`
      configured (`IMPLEMENTATION-PLAN.md` §1.8). GitHub Packages is deliberately not the primary
      registry — it has no anonymous npm read, which would break `npx` for everyone
- [ ] **Package renamed** from `@subzerodev/plugin-github` to `@subzerodev/plugins-github`, mirroring
      the repository name. This settles ecosystem work item X14 for this plugin, which asked for naming
      to be fixed before first publish — the touchpoints and the ADR are listed in §1.8
- [x] Coverage gates a release — **decided**: `@vitest/coverage-v8`, enforced in `npm run check`
      starting at Milestone 1 (`IMPLEMENTATION-PLAN.md` §1.2)
- [ ] Decide whether `npm audit` gates a release

**Release gate:** `npm ci && npm run check` on Windows and Linux; image runs non-root with writable
mounts, exercised both as UID 10001 and under the host-user override; fixture flow runs
`validate → sync → list → stats → export`; a second unchanged sync demonstrates cache reuse; output
validates and is byte-identical on repeat; no secret canary anywhere; `package.json`, `plugin.yaml`,
the git tag, and the image's version label all state the same version, and a mismatch fails the release
rather than shipping four artifacts that disagree.

## Pull request sequence

Keep reviews bounded and the branch green. Each PR includes tests for its exit criteria and leaves
`npm run check` passing.

| PR  | Milestone                                 |
| --- | ----------------------------------------- |
| 1   | M0 — decisions and scaffold stabilization |
| 2   | M1 domain schemas and fixtures            |
| 3   | M2 ports, configuration, secret safety    |
| 4   | M3 adapter, discovery, rate limits        |
| 5   | M3.5 first runnable slice                 |
| 6   | M4 metadata, statistics, profiles         |
| 7   | M5 cache and atomic synchronization       |
| 8   | M6 serializers and export                 |
| 9   | M7 CLI and wiring                         |
| 10  | M8 Docker, docs, conformance, release     |

## Definition of done

- Every Phase One deliverable in the
  [GitHub plugin specification](docs/docs/reference/specification.md) is implemented, and every
  non-goal is absent
- No Octokit type escapes `providers/github`
- Repository identity survives a rename or transfer
- An unchanged resync is deterministic and measurably cheaper, shown by a request count
- Interrupted and partial synchronization preserve the last valid cache
- Every serialized document is explicitly versioned and schema-valid
- The plugin passes contract conformance
- Windows, Linux, local, and Docker validation paths each pass in a job rather than by habit
- Documentation takes a new user from token setup through a validated export

## Deferred

Out of scope for Phase One, each with the condition that would bring it back into scope.

- **Organization and contributed repositories.** The specification's long-term goal; deferred because
  it needs a different discovery strategy and a much larger request budget. Revisit once the owned-repo
  path (this plan) is stable and a consumer asks for it.
- **Historical cache snapshots.** Phase One atomically replaces current state only. Revisit if a
  consumer needs point-in-time history rather than current state.
- **Per-repository output files.** Output is deliberately consolidated — one canonical document per
  concern, covering every project. Revisit only if a consumer's access pattern genuinely needs
  per-repository fetches at a scale where the consolidated documents become impractical.
- **The shared contract conformance suite.** Specified in `SubZeroDev.PluginContract/17-conformance.md`
  but not implemented anywhere in the ecosystem yet. Milestone 8 implements checks C1–C9 as this
  repository's own container-job assertions in the meantime — revisit once the shared runner exists,
  by lifting those assertions into it rather than duplicating them.

`gh auth token` reuse is **not** on this list — see `IMPLEMENTATION-PLAN.md` §1.7. It is implemented in
Phase One as a direct read of the GitHub CLI's own credential file, not deferred.
