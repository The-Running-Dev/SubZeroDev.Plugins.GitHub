---
title: 'ADR-003: The request wrapper, and how HTTP is tested'
description: Why the GitHub adapter talks to fetch directly instead of through Octokit, which packages were rejected, and how requests are mocked.
sidebar_position: 4
---

# ADR-003: The Request Wrapper, and How HTTP Is Tested

## Status

Accepted — 2026-07-30

## Context

Milestone 3 needs one place where every GitHub request passes: it attaches the credential, applies
conditional-request headers, counts requests per rate-limit bucket, classifies failures into the
`ProviderError` kinds the result envelope reports, and scrubs the token out of anything it emits.

The obvious question is how much of that an existing package supplies. `IMPLEMENTATION-PLAN.md` §1.2
had already answered it for the plugins — `@octokit/plugin-throttling` sleeps and retries under rate
pressure, where this plugin must warn at 50% and **stop cleanly at 90%** reporting partial success, and
`@octokit/plugin-retry` treats HTTP `202` as success, which is exactly what the specification forbids
for `/stats/*`. Both were rejected, along with `p-limit` (no budget check between task starts, no
per-item outcomes) and `msw`/`nock` (both patch globals process-wide, and neither makes per-endpoint
request **counts** convenient, which is an exit criterion here).

What that left unanswered is the question underneath: with every plugin rejected, was `@octokit/rest`
itself still carrying its weight? The first implementation of this milestone assumed yes and kept it —
and shipped a client that constructed an `Octokit` instance, handed it the token, and never issued a
request through it. A review found it unreferenced.

## Decision

**The adapter issues requests through `fetch` and its own wrapper. `@octokit/rest` is removed from the
dependencies.**

Three things the wrapper must do are the reason:

1. **`304` and `202` are outcomes, not errors.** A conditional request answering `304` is the cheap
   success the cache exists to produce, and a `202` from `/stats/*` means "still computing". Octokit
   throws on every non-2xx, so both would arrive as a caught `RequestError` to be reconstructed into
   the success they actually are.
2. **Every response's headers are needed even when the request failed.** `x-ratelimit-remaining`
   decides whether a `403` is an exhausted primary limit or a permission problem; `retry-after` decides
   whether it is a secondary limit; `Link` carries the `rel="last"` page number that Milestone 4's
   commit count is derived from. These are read off the `Response` directly.
3. **Payloads are validated by Zod, not trusted from types.** `githubRepositorySchema` is the boundary,
   because provider drift must surface as a `response-shape` error rather than as a type that quietly
   lies. Octokit's endpoint types would therefore have decorated code that does not rely on them.

`Retry-After` is honoured where present, and `5xx` and network failures are retried with bounded
exponential backoff and full jitter against the injected `Sleeper` and `Clock` — about thirty lines,
and every request this plugin issues is a `GET`, so the usual non-idempotent-retry hazard does not
apply. **Rate limiting is not retried**, by the same argument that rejected the throttling plugin:
stopping cleanly and reporting partial success is the specified behavior.

**HTTP is tested through a hand-rolled `fetch` stub** (`tests/support/fetch-stub.ts`), injected as the
`fetch` option on the client. It records every request, so tests assert exact per-endpoint counts, the
presence of `If-None-Match`, bodyless `304`/`202` responses, and `Link` headers — each one line
returning a `new Response(...)`. An unmatched route answers `501` and fails the test loudly rather than
falling through to the network.

The ESLint restriction on `@octokit/*` outside `src/providers/github/` **stays**, now covering `tests/`
as well. The dependency is gone, so the rule guards against a reintroduction landing in the wrong place
rather than policing a current import.

## Consequences

**Costs, plainly.** Endpoint knowledge that Octokit encodes — route strings, pagination conventions,
media types, the `X-GitHub-Api-Version` header — is now this repository's to maintain, and a breaking
change in GitHub's API surfaces as a failing test here rather than as a dependency upgrade. Anything
Octokit would have handled for free, including request `id` correlation and GitHub App authentication,
has to be written if it is ever needed. A future need for GitHub App installation tokens or GraphQL is
the most likely reason to revisit this decision, and revisiting it is cheap: the wrapper is one file
behind one interface.

**What it buys.** One runtime dependency fewer in a plugin whose distribution is checked for secret
leakage layer by layer; no adapter code shaped around throw-on-non-2xx; and a transport whose behavior
under `304`, `202`, `403`, and `Link` is defined here, next to the tests that pin it.

**Amends the plan.** `IMPLEMENTATION-PLAN.md` §1.2 listed `@octokit/rest` as "already declared,
currently unused — M3 makes it real", and §1.3 described the stub as injected _through_ Octokit. Both
are superseded by this record; `BUILD-PLAN.md`'s Milestone 3 checklist and exit criteria are amended to
match.

## Alternatives rejected

**Keep Octokit and route requests through `octokit.request`.** Every classification would begin by
catching `RequestError` and re-deriving the status, and `304` — the outcome the cache is built to
produce — would arrive as an exception on the happy path. The dependency would then be load-bearing for
route strings alone.

**Keep the dependency declared but unused, as scaffolding for later milestones.** This is what the
first implementation did. An unused client constructed with a live credential is a second copy of the
token in memory that nothing scrubs, and a dependency nobody exercises is one nobody notices breaking.
Milestones declare intent; `package.json` should describe what the code actually uses.

**Adopt `@octokit/plugin-retry` for the 5xx path only.** Its `202`-as-success behavior is precisely the
defect this plugin's exit criteria forbid, and configuring one behavior off leaves the other in place
for anyone who adds an endpoint later.
