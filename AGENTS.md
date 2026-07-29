# Repository Guidelines

## Project identity

This repository contains the SubZeroDev GitHub Plugin: a CLI-first Node.js
integration that transforms GitHub repository data into provider-independent,
versioned project models.

The package owns GitHub acquisition, normalization, caching, serialization,
command orchestration, and plugin-facing project models. It does not depend on
the workstation toolkit or a future automation runtime.

This is the **first** plugin under the SubZeroDev plugin contract, and the reference
implementation the others are scaffolded from. Two things follow from that.

**A shortcut taken here gets copied.** The next plugin author will read this repository before
reading the contract. Where the contract says one thing and convenience suggests another, the cost of
the shortcut is multiplied by every plugin that follows.

**Generic decisions do not belong here.** This plugin was specified before the contract existed, so
it accumulated an exit-code table, secret-handling rules, serialization rules, configuration
precedence, and logging levels — every one of which a second plugin faces identically. They were
promoted to the contract by contract ADR-003, and
[`adr-002-phase-one-boundaries.md`](docs/docs/decisions/adr-002-phase-one-boundaries.md) here is
marked rather than rewritten so the reasoning survives. Do not push them back down.

## Start safely

- Inspect the repository root, Git status, current branch, remotes, and available
  guidance before editing.
- Read `README.md`, this file, and applicable documentation before changing code
  or public claims.
- Discover files and tooling rather than assuming they exist.
- Preserve user changes and stage only files belonging to the current task.
- Follow the most specific applicable instruction when guidance conflicts.

Useful initial checks:

```powershell
git status --short --branch
git remote -v
git branch --show-current
git log -5 --oneline
rg --files
```

## What is GitHub-specific and stays here

Repository scope and filters; identity on GitHub's immutable numeric ID; capability-flag mapping to
GitHub's `has_*` fields; commit count via the `Link` header's `rel="last"` page number; the Search
API's separate rate-limit bucket; collection profiles and their request budgets; summary selection
rules; portfolio overrides.

## Invariants

**Identity is GitHub's immutable numeric ID.** `owner/name` is mutable metadata and never a key. A
cache keyed on the name turns a rename or a transfer into a delete plus an add, which destroys
history and re-fetches everything. Numeric identifiers serialize as **strings** — a 64-bit provider
ID does not survive a round trip through a JSON number in every language.

**No Octokit type escapes `providers/github`.** The domain models are provider-neutral, and the
moment a provider type appears in one, the abstraction is decorative.

**Pino writes to stderr.** It defaults to stdout, which corrupts the envelope and breaks every
adapter at once. This is the single most likely defect in a Node plugin, and it is why the
conformance suite forces `trace` before checking stdout.

**An interrupted write cannot damage the last valid cache.** Stage, then rename per file. Never swap
a directory — it is not atomic on Windows and fails when the destination exists. Verify this on
Windows, not only on Linux.

## Architecture and ownership boundaries

- Preserve ownership boundaries between repositories, layers, and services.
- Do not duplicate fields, contracts, validation, or behavior owned elsewhere.
- Keep presentation and CLI layers focused on rendering and input; authoritative
  behavior belongs in services and models.
- Use deterministic, serializable representations for authoritative state.
- Keep derived caches out of persisted authoritative state.
- Keep authored identity, writing, visual assets, and content original.
- Treat the versioned Zod schema in `src/models/` as the runtime validation
  boundary for public model data.
- Keep provider-specific acquisition under `src/providers/`; expose
  provider-independent types through `src/index.ts`.

## GitHub's hazards, which are the real work

These are documented in the
[GitHub plugin specification](docs/docs/reference/specification.md) and are the reason the metadata
milestone is larger than it looks:

- The statistics endpoints return `202` while GitHub computes them. A `202` must never reach a caller
  as data.
- The contributor list is capped, so a truncation flag is part of the model rather than an
  afterthought.
- `open_issues_count` includes pull requests. Reporting it as an issue count is wrong and looks
  right.
- The Search API has its own rate-limit bucket, so a budget that counts only core requests is
  incorrect for any command that searches.

## Sequencing

`BUILD-PLAN.md` holds the milestones. **Milestone 3.5 is the de-risking step** and is deliberately
out of dependency order: run `validate → sync → list` against one real account _before_ the expensive
statistics and cache work, so everything after is built against real payloads rather than mocks that
encode the same assumptions as the code.

When reality disagrees with the request budget, correct the budget. Fold every mapping correction
back into the Milestone 1 fixtures.

## Naming

The plugin was originally `SubZeroDev.Automator.Plugins.GitHub`, packaged as
`@subzerodev/automator-plugin-github`. That name asserted the plugin is a component of the Automator,
which the architecture rejects. It is now `SubZeroDev.Plugins.GitHub` and `@subzerodev/plugin-github`
— see the amendment in
[`adr-001-hosting-and-versioning.md`](docs/docs/decisions/adr-001-hosting-and-versioning.md). Do not
reintroduce the old form.

## What the plugin contract already decides

This repository is a plugin. `SubZeroDev.PluginContract` outranks it: where this specification and
the contract disagree, the contract is correct and this document has drifted.

**Do not restate any of these here.** Reference them.

| Decided in the contract                                                               |
| ------------------------------------------------------------------------------------- |
| The exit-code table, and that `1` is reserved for uncaught exceptions                 |
| Secrets from the environment only — never `argv`, never config, never a tool argument |
| stdout is machine-only; logs go to stderr at every level                              |
| The result envelope, and its schema                                                   |
| Serialization: UTF-8, LF, stable ordering, `null` over omission                       |
| Atomic replacement by per-file rename, never a directory swap                         |
| Schema-version compatibility: accept the same major, refuse a higher one              |
| Configuration precedence, and config-relative path resolution                         |
| Logging levels                                                                        |
| Determinism as a testable requirement                                                 |
| The plan-apply pattern for writes to external systems                                 |
| Manifest shape, capabilities, and the trust levels                                    |

A rule copied here to make this document "self-contained" is the second copy that drifts. It cost
this project a pair of exit-code tables that disagreed about whether `5` meant authentication failure
or partial success.

**The test for a new decision:** would a second plugin face this same question? If yes it belongs in
the contract, even while only one plugin exercises it. If genuinely unclear, the contract is the
safer home.

## The plugin runs standalone

Whatever the Automator can invoke, a person can invoke from a terminal, with the same commands and
the same envelope. If a change makes a command meaningless without the Automator, the change is
wrong.

## Repository layout

```text
src/
├── cache/           cache implementations
├── commands/        CLI command handlers
├── configuration/   configuration loading and validation
├── models/          provider-independent versioned models
├── output/          human-readable command output
├── providers/       provider contracts and GitHub implementation
├── serialization/   persisted/exported representations
└── services/        orchestration and application behavior

tests/               Vitest tests
docs/docs/           authored documentation
docs/docs/index.md   generated documentation landing page; do not edit
docs/src/pages/index.md
                     generated from README.md; do not edit
build/               generated documentation tooling
.config/             documentation validation rules
schemas/contract/    the plugin contract's manifest and result-envelope schemas, vendored
                     byte-for-byte; never hand-edit them — see schemas/contract/VENDORED.md
                     for provenance and the refresh procedure
```

`docs/docs/decisions/` **is** this repository's ADR directory. Do not create a second `adr/` at the
root — that duplication is exactly the failure the ecosystem specifications were written to stop.

Most `src/` subdirectories above are currently placeholders (`.gitkeep` only). Beyond the vendored
contract schemas, the plugin contract also requires `examples/`, `plugin.yaml`, and a `CHANGELOG.md`
at the repository root, plus this plugin's own generated `schemas/projects.schema.json` — none of which
exist yet. `BUILD-PLAN.md` tracks when each lands, and `IMPLEMENTATION-PLAN.md` says how.

## Documentation

The shared Docusaurus template owns the documentation project under `docs/`.
Authored pages belong under `docs/docs/`, grouped by section (`guide/`, `reference/`, `decisions/`,
plus top-level pages). Navigation is autogenerated, with `sidebar_position` front matter declaring
reading order within each level.

`README.md` is the source for `docs/src/pages/index.md`, which serves the custom
domain root. `docs/docs/index.md` is a hand-authored `/docs/` landing page — under
`routeBasePath: 'docs'`, the homepage generator only ever produces `docs/src/pages/index.md`. Never
edit `docs/src/pages/index.md` directly. After changing the README, regenerate it with:

```powershell
./docs.ps1 -BuildOnly
```

Then validate:

```powershell
./build/Test-Documentation.ps1
```

Documentation is published at <https://plugins-github.subzerodev.com/> with:

```typescript
url: 'https://plugins-github.subzerodev.com',
baseUrl: '/',
routeBasePath: 'docs'
```

Keep all three aligned with the real hosting arrangement. Treat generated files
as outputs, update cross-references when pages or headings move, and verify
claims against authoritative sources. External references must use published
URLs, never relative traversal into another repository.

The documentation base image is pinned by immutable digest in `docs/Dockerfile`,
`docs.ps1`, `.github/workflows/docs-ci.yml`, and
`.github/workflows/docs-deploy.yml`. Update all four references together after
inspecting the current published digest.

## Repository bootstrap decisions

`AGENT-SETUP.md` is a reusable bootstrap template, not standing execution
authority. Apply it only when the user explicitly invokes it. This file and any
higher-level workspace instructions continue to govern its execution,
including approval requirements for external writes.

Before making structural changes to a new or partially initialized repository,
confirm:

1. Repository owner, name, visibility, default branch, and license.
2. Project ownership boundaries and companion repositories.
3. Whether a documentation site is required.
4. Documentation structure, supported tooling, public routes, hosting origin,
   custom domain, and compatibility requirements.
5. Contribution and repository-guidance conventions.

Discussing a decision does not authorize unrelated external writes. Creating a
remote repository, changing visibility, pushing, opening or merging pull
requests, changing a domain, and deploying require user authorization.

When a documentation site is approved, inspect the existing documentation
system first. If using the shared template, pull and read its current installer
instructions before running it. Dry-run the installer, use its supported
consumer layout, and do not recreate its overlay or workflow behavior by hand.

## Development and validation

Requires Node.js 24 or later.

```powershell
npm ci
npm run check
node dist/cli.js --help
```

`npm run check` runs formatting verification, lint, type checking, tests, and
the production TypeScript build.

Before committing:

```powershell
./build/Test-Documentation.ps1
git diff --check
git status --short --branch
```

Run the production documentation build when documentation or its tooling
changes. Do not claim testing, CI, deployment, or public routes succeeded until
each has been confirmed.

Once GitHub API behavior exists: `npm ci && npm run check` must be green on **both** Windows and
Linux — the line-ending policy exists because `format:check` disagreed across platforms. A secret
canary must be present in no output, log, artifact, cache, error, or image layer. An unchanged
resync must be byte-identical and measurably cheaper, shown by a request count rather than by
assertion.

## Git and GitHub delivery

- Work on a focused `agent/<description>` branch.
- Keep commits scoped and stage only intended paths.
- Open a draft pull request unless the user requests ready-for-review.
- Do not reply to or resolve review threads without authorization.
- Merge only after required application and documentation checks pass.
- After merge, fast-forward local `main`, verify merge-triggered workflows, and
  check representative public routes.
- Do not delete files, branches, or history unless explicitly authorized.

## Completion checklist

- [ ] Existing guidance and repository state inspected.
- [ ] User work preserved.
- [ ] Ownership and structural decisions approved.
- [ ] README, hygiene files, and guidance updated consistently.
- [ ] Generated documentation regenerated from its declared source.
- [ ] Documentation links, anchors, terminology, and production build pass.
- [ ] Application formatting, lint, type checking, tests, build, and CLI smoke
      test pass.
- [ ] `git diff --check` passes.
- [ ] External writes remain within the authorized scope.
- [ ] CI, deployment, and published routes are verified before being reported.
- [ ] No secret canary anywhere in output, log, artifact, cache, error, or image layer.

## Conventions

These hold in every SubZeroDev specification repository. The canonical copy of this block is
`AGENTS.md` in the Architecture repository (`SubZeroDev.Ecosystem`); it is repeated here because a
repository has to stand on its own. If that block changes there, change it here in the same commit —
the point of naming a canonical copy is that a reviewer can check the others against it.

- **Reference, never restate.** A rule that lives in another document is linked, not copied. Two
  copies of a rule is a promise they will diverge and a guarantee nobody will notice which is stale.
- **The plugin contract outranks plugin specifications.** Where a plugin document and the contract
  disagree, the contract is correct and the plugin document has drifted. See ADR-003 in
  `SubZeroDev.PluginContract`.
- **A decision gets an ADR.** Status is exactly one of `Proposed`, `Accepted`, `Superseded`, or
  `Deprecated`, under a `## Status` heading. An accepted ADR states its context, the decision, the
  consequences _including the costs_, and the alternatives it rejected and why. "Accepted in existing
  practice" is not a status — ratifying current practice is a note in the context.
- **Move, never copy.** A specification has exactly one home. Where another repository needs the
  text, it references a tagged commit rather than duplicating the file.
- **Give reasons.** These documents are read by people deciding what to build. An assertion with no
  reason cannot be evaluated, and cannot be safely revised by someone who was not there when it was
  written.
- **Markdown is Prettier-formatted**, 100 columns, LF endings.
