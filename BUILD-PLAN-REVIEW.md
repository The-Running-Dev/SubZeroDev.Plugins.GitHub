# Peer Review — GitHub Plugin Implementation Plan

Reviewed: `IMPLEMENTATION_PLAN.md` at commit `f892cf2`, against the Phase One
specification, ADR-0001, the existing scaffold, and CI.

**Verdict: approve with changes.** The sequencing (contracts → ports → provider →
collection → cache → serialization → CLI) is correct and the dependency
direction is right. The plan is strongest exactly where this kind of project
usually fails: secret handling, determinism, and interrupted-write safety are
treated as first-class exit criteria rather than afterthoughts. The problems
below are about _internal consistency_ and _under-specified decisions that the
plan defers past the point where they are cheap to change_, not about the shape
of the plan.

Verified scaffold state at review time: `format:check`, `lint`, `typecheck`,
`test` (11 passing), and `build` all pass.

## Resolution

This review has been actioned. It is kept as the record of _why_ the plan reads
the way it now does, not as an open queue.

- **Fixed in the repository:** B1 — the duplicate `setup/` specification and ADR
  are deleted, leaving `setup-llm/docs/` canonical.
- **Fixed in the planning documents:** B2 and B3 — `TODO-next.md` is realigned to
  the plan's milestone numbering, the output-layout contradiction is resolved in
  favor of consolidated-only, and authority is now stated explicitly (the plan
  owns sequencing, the ADRs own decisions). S1, S2, S3, S4, S5, S6, S7, and the
  smaller notes are folded into the plan's decisions table, request budget, and
  milestones. S8's vertical slice is inserted as Milestone 3.5.
- **Scheduled, not yet done:** B4 — the `windows-latest` matrix is now an explicit
  Milestone 0 deliverable rather than an unenforced exit criterion, alongside the
  `.gitattributes` and Windows entry-point-test items already sequenced there.

---

## Blocking

### B1. This branch reintroduces documentation that `main` deleted

`setup/` does not exist on `origin/main` — commit `8effcf0` moved it to
`setup-llm/`. It exists on this branch, containing two files that are
byte-identical to their `setup-llm/` counterparts:

```
setup/docs/decisions/0001-subzerodev-automator-github-plugin-hosting.md
setup/docs/specifications/subzerodev-automator-plugins-github.md
```

They came back through the merge in `0a69384`: the plugin branch wrote docs to
the pre-rename path while `main` renamed it, and the merge kept both sides. The
diff against `main` confirms these are _new_ files this branch would land.

This matters directly to the plan. Milestone 0 says "update the specification so
Phase One has no contradictory or open acceptance criteria" — with two tracked
copies, that edits one and silently drifts the other, and the whole Milestone 0
exit criterion ("the specification, ADR, and checklist describe the same Phase
One") becomes unverifiable.

**Action:** delete the `setup/` copies before anything else, and make Milestone 0
state the single canonical path for the spec and ADRs.

### B2. The plan and `TODO-next.md` contradict each other, in the same commit

`TODO-next.md` still lists three decisions as open (`[ ]` commit count, output
layout, portfolio metadata) that the plan's "Phase One Decisions" table already
closes. Worse, one of them is closed _differently_:

| Topic         | `TODO-next.md`                                                   | `IMPLEMENTATION_PLAN.md`                                               |
| ------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Output layout | Consolidated canonical files **plus optional per-project files** | Canonical consolidated documents **only**; per-project is future scope |

This is not cosmetic — it changes schemas, serializers, cache keys, and atomic
write granularity, which is exactly what the plan itself says in review finding
#4. Two documents in one commit giving two answers is how the wrong one gets
implemented.

**Action:** declare which document is authoritative for decisions (recommend:
the ADR, with both checklists referencing it), then make them agree.

### B3. Milestone numbering diverges between the two checklists

The plan is Milestone 0–8; `TODO-next.md` is "Current Step" + Milestone 1–8, and
they are offset by one throughout:

| Work                      | Plan          | TODO-next      |
| ------------------------- | ------------- | -------------- |
| Close decisions           | M0            | "Current Step" |
| Domain contracts          | M1            | M2             |
| Config + secret safety    | M2            | M3             |
| Provider + discovery      | M3            | M4             |
| Metadata + statistics     | M4            | M5             |
| Cache                     | M5            | M6             |
| Serializers/exports + CLI | M6 **and** M7 | M7 (collapsed) |
| Docker/docs/release       | M8            | M8             |

The plan then mandates "each pull request must update `TODO-next.md`". Reviewers
will be reconciling two numbering schemes on every PR, and "Milestone 5" will
mean different things depending on which file someone has open.

**Action:** renumber one to match the other, or reduce `TODO-next.md` to a
pointer at the plan's milestones rather than a parallel list.

### B4. Milestone 0 claims a Windows gate that CI cannot enforce

Exit criterion: _"The full check suite passes on Windows and GitHub Actions."_
Both jobs in `.github/workflows/subzerodev-automator-github.yml` are
`runs-on: ubuntu-latest`. Windows is where two of the plan's own review findings
live (finding #8: line endings and the symlink test), and where the atomic-write
design is most at risk (see S6). An unenforced criterion on the exact platform
the plan flags as unstable will not hold.

**Action:** add `windows-latest` to a build matrix for the `validate` job, or
drop the Windows claim and state explicitly that Windows is developer-verified
only.

---

## Substantive gaps — resolve before Milestone 1

### S1. Repository identity is never pinned down

The plan requires rename, transfer, and deletion reconciliation (M5) and a
tie-break by "normalized repository ID" (decisions table), but never says what
that identifier _is_. Today `Project.id` is a bare `z.string().min(1)`.

If identity is `owner/name`, rename and transfer reconciliation are
unimplementable — a rename is indistinguishable from a delete plus an add. It
must be GitHub's immutable numeric `id` (or `node_id`), namespaced by provider,
with `owner/name` carried as mutable metadata.

This is a Milestone 1 contract decision, not a Milestone 5 discovery. Getting it
wrong means re-cutting the schema after `projects.schema.json` is published.

### S2. Schema-version compatibility policy is undefined

Three top-level documents each carry `schemaVersion`. The plan does not say
whether they version together or independently, and the existing schema uses
`z.literal(SCHEMA_VERSION)` — a hard rejection of every other version, with no
migration path. Milestone 8 then promises "migration" documentation for a
mechanism that was never designed.

**Action:** in M1, state the accept/reject policy (e.g. accept same major,
reject otherwise), decide shared vs. independent versioning per document, and
either build a migration hook or state plainly that pre-1.0 exports are
regenerate-only. The last option is fine — but it should be a decision, not a
gap.

### S3. Review finding #7 is right but incomplete

The plan flags `packages` as a capability GitHub does not expose as a repository
property. `releases` has the same problem — the spec's metadata list asks for
"Wiki, discussions, projects, releases, and packages capability flags", and the
REST repository object provides `has_issues`, `has_projects`, `has_wiki`,
`has_pages`, `has_downloads`, `has_discussions`. Neither `has_releases` nor
`has_packages` exists.

**Action:** widen finding #7 and the decisions table to cover both, and state the
general rule: capability flags are mapped only where GitHub exposes them
directly; nothing is synthesized from a probe request.

### S4. Milestone 4's budget table is the right idea, missing the known hazards

The plan says to build an endpoint-and-budget table before implementing, which is
the correct instinct. But the hazards that actually blow up commit and issue
counting are not named anywhere, so the table will be built without them:

- **`/stats/*` returns `202` while GitHub computes** the data, with no body. This
  needs a documented retry-with-backoff and a give-up-to-`null` path, and it
  interacts directly with the "unavailable optional statistics produce `null`
  plus diagnostics" exit criterion.
- **`/contributors` is capped** (500 contributors) and excludes anonymous
  contributors by default. "Contributors and contribution counts" therefore
  cannot be exact for large repositories — the model needs a truncation flag or
  the field is quietly wrong.
- **`open_issues_count` on the repository object includes pull requests.** Using
  it as the issue count is a classic off-by-PRs bug.
- **Closed issue/PR counts realistically need the Search API**, which has a
  _separate_ rate-limit bucket (~30 requests/minute authenticated) and is
  eventually consistent — so it can disagree with itself between two syncs,
  which collides with the determinism requirement.
- **Commit count already has a known bounded strategy**: request
  `/commits?per_page=1` and read the `rel="last"` page number from the `Link`
  header — one request per repository. The plan defers commit count "until an
  exact, bounded strategy is enabled" without noting that the strategy exists.
  That deferral may no longer be necessary.

**Action:** make these columns in the M4 table (pagination, ETag support, `202`
behavior, truncation, rate-limit bucket, null-vs-partial-failure), and revisit
the commit-count decision in light of the `Link` header approach.

### S5. There is no numeric API budget

"Bounded concurrency; begin conservatively and make it configurable" gives no
number, and M4's exit criterion — "request count is bounded and observable" —
has no target to test against. Observable against what?

At roughly 8 endpoints per repository, a 200-repository account is ~1600
requests per full sync against a 5000/hour primary limit, before the separate
Search bucket and secondary limits. That is fine; it should be _written down_ so
there is a threshold a test can assert and a regression can trip.

**Action:** state a per-repository request budget, a full-sync ceiling, and a
default concurrency value. Note that `304` responses do not count against the
primary rate limit — that is the actual payoff of the M5 ETag work and belongs in
the budget math.

### S6. Atomic replacement is under-specified for Windows

The plan says "output replacement is all-or-nothing where the filesystem
permits it" and "staging-directory writes followed by atomic replacement". On
Windows, directory replacement is not atomic and fails outright when the target
directory exists — so the staging-directory-swap pattern that works on Linux
will not port.

Given Windows is a first-class target here (`run.ps1`, PowerShell 7, the
Windows-specific review findings), the hedge is the wrong call.

**Action:** specify per-file `rename` onto existing targets (which does replace
atomically on both platforms) rather than a directory swap, and define what
"all-or-nothing" means for a multi-file output set — the honest answer is that
five separate renames are not one transaction, so the recovery story needs
stating.

### S7. The argument-parsing decision is deferred by omission

Milestone 7 calls for global options (`--config`, `--cache`, `--output`,
`--log-level`, `--json`, `--quiet`), command-specific help, and "strict option
validation". The current CLI uses `node:util` `parseArgs` with one global option
table, which cannot express per-command options cleanly — every command would
accept every other command's flags, or the parser has to be run twice with
hand-rolled splitting.

This is not a detail: it determines whether `src/cli.ts` stays a single file or
becomes a dispatch layer, and it changes the CLI smoke tests already in CI.

**Action:** decide in M0/M1 — keep `parseArgs` with explicit two-stage parsing,
or take a parser dependency. Either is defensible; leaving it implicit means it
gets decided by whoever writes M7 under deadline.

### S8. Nothing is end-to-end runnable until PR 8 of 9

`sync` is the only command that populates the cache, and it lands in Milestone 7.
So Milestone 6 builds serializers and exports with no real data to serialize,
and the first contact between this code and the actual GitHub API — the place
where response-shape surprises live — happens in the second-to-last pull
request. The mocked provider tests in M3 will not surface a mapping assumption
that is wrong about real payloads.

**Action:** insert a thin vertical slice after M3: `validate` plus a minimal
`sync` that discovers repositories and writes only core metadata, exercised
against a real account once. It costs one small PR and de-risks every milestone
after it. The plan's "keep reviews bounded and preserve a green branch" goal
survives intact.

---

## Smaller points

- **ADR-0002 has no path.** Given B1, name it explicitly
  (`setup-llm/docs/decisions/0002-...`) and say whether plugin ADRs belong under
  the toolkit docs site at all — ADR-0001 itself notes the repository
  "temporarily contains both the workstation toolkit and this product plugin".
- **`exactOptionalPropertyTypes: true` will fight Zod across M1's wide model
  surface.** `.optional()` infers `T | undefined`, which is awkward to construct
  under that flag. Decide the convention now: prefer `null` over optional for
  serialized fields. That also helps byte-stable output, since a present `null`
  is deterministic where an absent key is a branch.
- **JSON Schema generation needs no new dependency.** The installed `zod@4.4.3`
  ships `z.toJSONSchema()` (verified). Milestone 1 should name it, and avoid
  `zod-to-json-schema`, which targets Zod 3.
- **No coverage tooling or threshold** exists or is mentioned anywhere in the
  plan, despite `coverage/` being gitignored and prettier-ignored. Either add a
  gate or say coverage is not gated.
- **`npm audit --audit-level=high` runs in CI but is absent from the release
  gate** (`npm ci && npm run check`). A new advisory in a transitive dependency
  will red the branch for reasons unrelated to any PR. Decide whether it blocks.
- **Exit code `1` is skipped, which is correct** — Node uses it for uncaught
  exceptions — but say so, or someone will "fix" the gap. Also note that the
  current `not implemented` return of `3` becomes "operational failure" under the
  new table.
- **`run.ps1` overrides the container user on Linux** (`--user $(id -u):$(id -g)`
  to make bind mounts writable), so the documented UID 10001 path is not what
  Linux actually exercises. Milestone 8's gate — "runs as non-root with writable
  mounted cache/output" — should cover both the default user and the override.
- **The `container` CI job builds the image but never runs it.** Milestone 8 adds
  smoke validation; make sure it lands in the workflow rather than only in docs.
- **No `.gitattributes` exists anywhere in the repository** (verified), so
  Milestone 0's line-ending item is a concrete file to add, not a config to
  adjust.

---

## What the plan gets right

Worth stating, because these are the parts that are easy to skip and expensive to
retrofit:

- **Contracts before integration.** Defining models and ports before touching
  Octokit is what makes the "no GitHub types outside the provider" rule
  enforceable rather than aspirational.
- **Secret safety as an exit criterion.** "A raw token cannot be represented by
  the configuration schema" is a much stronger guarantee than "do not log
  tokens", and the canary tests across stdout, stderr, logs, and serialized
  errors close the realistic leak paths. Deciding to reject config-file tokens
  outright — and flagging that it contradicts the spec, rather than quietly
  diverging — is the right call handled the right way.
- **Determinism treated as testable.** Byte-stable golden files, documented
  rounding for language percentages, and explicit tie-breakers turn "deterministic"
  from a principle into a gate.
- **Interrupted-write safety.** Staging plus atomic replacement, startup cleanup
  of abandoned staging data, and "an interrupted write cannot damage the last
  valid cache" is the correct cache-first posture. (See S6 for the Windows
  caveat.)
- **Honest review findings.** The plan opens by listing the specification's own
  contradictions instead of implementing around them. Findings #1, #2, and #4 are
  all real and correctly diagnosed.

---

## Suggested order

1. Delete the duplicate `setup/` docs (B1).
2. Reconcile plan ↔ `TODO-next.md` — authority, contradictions, numbering
   (B2, B3).
3. Fold S1, S2, S3, S7 into the Milestone 0 decision set and ADR-0002; add the
   Windows CI matrix or drop the claim (B4).
4. Build the M4 endpoint-and-budget table with the S4 hazard columns and the S5
   numbers, then revisit the commit-count deferral.
5. Add the S8 vertical slice between the provider and collection milestones.
