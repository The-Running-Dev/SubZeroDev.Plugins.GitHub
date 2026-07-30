---
title: GitHub plugin specification
description: Scope, identity, collection profiles, metadata, and the normalized project model.
sidebar_position: 2
---

# SubZeroDev GitHub Plugin

| Field      | Value                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Version    | 2.0                                                                                                                |
| Status     | Phase One — implementation started                                                                                 |
| Plugin ID  | `subzerodev.github`                                                                                                |
| CLI        | `subzerodev-github`, alias `sz-github`                                                                             |
| Contract   | `SubZeroDev.PluginContract` 1.0                                                                                    |
| Package    | `@subzerodev/plugin-github`                                                                                        |
| Code       | This repository, `SubZeroDev.Plugins.GitHub`                                                                       |
| Build plan | [`BUILD-PLAN.md`](https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub/blob/main/BUILD-PLAN.md)            |
| Decisions  | [ADR-001](../decisions/adr-001-hosting-and-versioning.md), [ADR-002](../decisions/adr-002-phase-one-boundaries.md) |

Merged from the two specifications that previously described this plugin: version 1.1 under
`setup-llm/docs/` and the ecosystem draft. Both are retired, as are the plugin's own
`IMPLEMENTATION_PLAN.md` and the root `TODO-next.md` — their milestone sequence and completion state
are now in [`BUILD-PLAN.md`](https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub/blob/main/BUILD-PLAN.md).

**The plugin does not require the Automator.** It runs standalone from the CLI or its container, per
contract ADR-002. It was originally named `SubZeroDev.Automator.Plugins.GitHub`, which implied
otherwise; that name predated the architecture and is corrected above.

**This document contains only what is specific to GitHub.** Everything generic — exit codes, secret
handling, output channels, serialization, determinism, configuration precedence, logging, the
manifest, Docker requirements — lives in the plugin contract and is referenced here, never restated.
Where this document and the contract disagree, the contract is correct.

## Purpose

Collect GitHub repository and activity metadata for the authenticated user and transform it into a
stable, provider-independent project model.

The plugin is the single source of truth for portfolio data: downstream systems consume its
normalized output rather than querying GitHub directly. It runs manually today and becomes an
Automator plugin without rewriting any business logic.

## Scope

The long-term goal is every repository belonging to, or contributed to by, the authenticated user.

**Phase One delivers the first half only: repositories owned by the authenticated user.** Contributed
repositories, organization repositories, and forks-of-others need a different discovery strategy and a
much larger API budget, and are deferred until the owned path is stable.

Defaults:

| Class                 | Phase One default          |
| --------------------- | -------------------------- |
| Public and private    | Included                   |
| Archived              | Included, flagged          |
| Disabled and template | Included, flagged          |
| Forks                 | **Excluded**, configurable |
| Organization          | Deferred                   |
| Contributed           | Deferred                   |

An earlier draft excluded forks from the summary while still collecting them. Collecting costs API
budget whether or not the result is displayed, so exclusion means not collecting; a configuration flag
turns collection on.

## Identity

A repository is keyed on **GitHub's immutable numeric ID**, namespaced by provider. `owner/name` is
mutable display metadata and is never a key — not for the cache, not for portfolio overrides, not for
tie-breaking.

Keyed on the slug, a rename or transfer is indistinguishable from a deletion plus an addition, so the
cache would discard history and re-fetch on every rename, and every hand-written portfolio override
would silently detach.

## Technology

Node.js 24+, TypeScript, Zod, Pino, Vitest, Docker. JSON and YAML output. GitHub is reached through
`fetch` and this plugin's own request wrapper rather than through Octokit — see
[ADR-003](../decisions/adr-003-request-wrapper-and-http-testing.md).

## Commands

| Command    | Purpose                                              |
| ---------- | ---------------------------------------------------- |
| `sync`     | Download or incrementally update repository metadata |
| `list`     | Display repositories from cache                      |
| `stats`    | Display aggregate statistics                         |
| `export`   | Write the canonical output set from a valid cache    |
| `validate` | Validate configuration, credentials, and cache       |
| `manifest` | Print the plugin manifest — required by the contract |

Exposed to Automator: `sync`, `export`, `validate`, `stats`. `list` stays CLI-only unless a remote
use appears.

## Authentication

Reads the token from `GITHUB_TOKEN`. The configuration file may name a _different variable to read
from_; it may never carry a token value. See the contract for why the schema must be incapable of
representing one.

GitHub CLI token reuse (`gh auth token`) is **opt-in and recorded in the run report**, never a silent
fallback. It inherits whatever scopes the user's `gh` session holds — usually far broader than the
read access this plugin needs — so it widens access beyond what the manifest declared.

Future: GitHub App, OAuth.

## Collection profiles

Statistics vary enormously in cost. Profiles make that an explicit choice rather than an
implementer's constant.

| Profile    | Contents                                                      | Approximate cost per repository |
| ---------- | ------------------------------------------------------------- | ------------------------------- |
| `basic`    | Repository endpoint data only                                 | 0 additional requests           |
| `standard` | Basic plus languages, latest release, branch count, tag count | ~4                              |
| `detailed` | Standard plus contributors, PR and issue counts, commit count | ~10, plus Search API            |

Default is `standard`. Against the 5000/hour primary limit, a 200-repository account costs roughly
800 requests on `standard` and 2000 on `detailed`.

Budget guards, regardless of profile: default concurrency 4; warn at 50% of the primary limit
consumed; stop cleanly at 90% and report partial success. Search API usage stays at or below 20 per
minute — a separate bucket from the primary limit.

A `304 Not Modified` does not consume primary quota, which is what makes an unchanged resync
approach zero consumption rather than merely fewer requests.

## Repository metadata

Provider, provider repository ID, node ID, owner, name, full name, description, visibility, private,
fork, archived, disabled, template, created/updated/pushed timestamps, default branch, homepage,
documentation URL (inferred or configured), clone/SSH/web URLs, topics, license, primary language,
language distribution, size, stars, forks, watchers, open issue count, capability flags, latest
release, tags, branch count, contributor summary, pull-request summary, issue summary.

### Capability flags are only what GitHub exposes

The REST repository object provides `has_issues`, `has_projects`, `has_wiki`, `has_pages`,
`has_downloads`, and `has_discussions`.

There is **no `has_packages` and no `has_releases`**. Neither is collected, and neither may be
synthesized by probing an endpoint and inferring a flag. An earlier draft listed both; they were
removed rather than faked.

## Statistics and counting semantics

Commit count, release count, tag count, branch count, contributors, open and closed pull requests,
open and closed issues, latest release, latest tag.

Several of these are easy to collect incorrectly in ways that produce a plausible wrong number rather
than an error:

- **`open_issues_count` includes pull requests.** It is not the open-issue count.
- **Closed issue and pull-request counts need the Search API**, which uses a separate rate-limit
  bucket and is eventually consistent — two syncs of unchanged data can legitimately disagree, and
  that must not be recorded as a change.
- **Contributor lists are capped by GitHub** and exclude anonymous contributors, so contributor data
  carries a truncation flag rather than presenting a partial list as complete.
- **Commit count** comes from requesting a single-item commit page and reading the last page number
  from the `Link` header — one request per repository. Null when the header is absent, as for an
  empty repository.
- **`/stats/*` answers `202` with no body** while GitHub computes the result, requiring a bounded
  retry with backoff and a give-up path to null.
- **An uncollectable statistic is null with a diagnostic, never zero.** A repository with no commits
  and one whose commit count could not be read are different facts.

## Language statistics

Name and byte count per language. Byte counts are the source of truth; percentages are derived.

The rounding rule is documented and applied identically on every run, and rounded percentages total
100 within the chosen precision — a remainder distributed by an undefined rule is a source of output
churn between otherwise identical syncs. Languages are ordered deterministically, not by GitHub's
response order.

## Releases, branches, contributors

- **Releases**: version, published date, draft and prerelease flags, assets, notes URL.
- **Branches**: name, default flag, protected flag, last commit. The protected flag is **nullable** —
  branch protection is not readable under every token scope and plan, and an unreadable flag is not
  the same as an unprotected branch.
- **Contributors**: user, contribution count, profile URL, account type, and the truncation flag for
  the containing list.

## Normalized project model

GitHub response shapes must not appear in output. `status` is derived, not collected: `archived`
when GitHub reports the repository archived, otherwise `active`.

```json
{
  "schemaVersion": "1.0.0",
  "provider": "github",
  "providerId": "123456789",
  "slug": "the-running-dev/project",
  "name": "Project",
  "description": "…",
  "visibility": "public",
  "status": "active",
  "source": { "url": "…", "defaultBranch": "main" },
  "timestamps": { "createdAt": "…", "updatedAt": "…", "pushedAt": "…" },
  "technology": { "primaryLanguage": "TypeScript", "languages": [] },
  "statistics": {},
  "releases": {},
  "portfolio": {}
}
```

Future providers — GitLab, Azure DevOps, Bitbucket, Gitea, Forgejo — populate this same model. Each
must supply an equivalently stable immutable identifier.

## Portfolio overrides

User-authored metadata that does not exist in GitHub, in a local overrides file **keyed by the
immutable provider repository ID**. The file may carry the slug alongside as a human-readable
comment; the ID is what matches.

Fields: featured, hidden, display name, summary, category, status, display order, custom
technologies, demo URL, docs URL, screenshots, business relevance, personal contribution, start and
end dates, notes.

Provider data and user-authored data stay separable, so a resync can never overwrite a hand-written
value and the two are never confused in output.

## Output

```text
output/
  projects.json
  projects.yaml
  statistics.json
  summary.json
  projects.schema.json
  sync-report.json
  raw/            optional, off by default
```

`raw/` retains unmodified API responses for diagnosing provider drift. It is excluded from
determinism comparison and off by default, because it contains far more data than the normalized
model and no filtering.

### Summary determinism

"Largest" and "most active" are opinions until defined, and an undefined selection changes the
summary between runs over unchanged data. Every selection breaks ties by ascending repository
identity:

| Selection   | Definition               |
| ----------- | ------------------------ |
| Largest     | Greatest repository size |
| Most active | Latest `pushedAt`        |
| Newest      | Latest `createdAt`       |
| Oldest      | Earliest `createdAt`     |

An empty project set yields null for each rather than an omitted key.

The summary also carries total, public, private, and archived counts, languages, and star, fork, and
release totals.

## Cache

Keyed on repository identity, so a rename updates an entry rather than orphaning it.

Tracks ETags per resource, last successful synchronization time, GitHub API version, retry-after
state, and per-repository partial-failure diagnostics. Conditional requests reuse unchanged data.

Phase One atomically replaces current state; historical snapshots are future scope. Interrupted or
partial synchronization preserves the last valid cache — see the contract for the atomic-replacement
rule this relies on.

## Partial success

One repository failing does not invalidate the rest. The run exits `4`, retains prior valid cached
data for what failed, writes what succeeded, and records diagnostics naming the affected
repositories in `sync-report.json` and the result envelope.

## Configuration

`github.config.json`, versioned and schema-validated. Covers the token environment-variable name,
repository filters, collection profile, cache and output directories, export formats, and rate-limit
budget.

Organization settings are absent, not merely unused: a setting that is read but not honored is worse
than a missing one.

## Phase One acceptance

- Authenticates from the environment and refuses to start without a token
- Discovers every owned repository in scope exactly once
- Collects `basic` and `standard` profiles within budget
- Normalizes into the project model with no GitHub type escaping the provider
- Writes the canonical output set, deterministically and byte-stably on repeat
- Handles rate limiting and partial failure without corrupting the cache
- Runs natively under Node and through Docker
- Passes the contract conformance suite
- Ships tests and documentation taking a new user from token setup to validated export

## Non-goals

Web UI, database, scheduling, background services, automation runtime, workflow engine, MCP, REST
API. These belong to the Automator or to future phases.

## Future

- **Commands**: `analyze`, `portfolio`, `activity`, `releases`, `languages`, `roadmap`, `graph`,
  `export markdown`, `export sqlite`
- **Statistics**: traffic, clones, views, downloads
- **Scope**: organization and contributed repositories
- **Consumers**: portfolio site, resume generator, documentation, dashboards, AI analysis, project
  search, MCP server, REST API

## Decisions on previously open points

None of these blocks Phase One — portfolio overrides give all three somewhere to land without a schema
change — but the answers are settled so nobody relitigates them later.

**Commit activity, when it lands, is weekly.** GitHub's own statistics endpoint returns weekly
buckets, so weekly is the finest granularity available without reconstructing it from commit
timestamps. Aggregating weeks into months or years afterwards is lossless; going the other way is
impossible.

**AI-generated summaries are stored in portfolio overrides with their provenance** — model, prompt
version, source digest, timestamp — not regenerated on read. Regenerating means output changes without
input changing, which contradicts the determinism the whole plugin is built around. Stored, a summary
is data; regenerated, it is a moving target.

**Screenshots, logos, and badges stay external**, referenced by URL from portfolio overrides. Binary
asset management is a different problem with its own storage, sizing, and retention concerns, and
folding it in would turn a metadata collector into an asset pipeline.
