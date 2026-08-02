# Implementation Plan — Milestones 1 through 8

Companion to [`BUILD-PLAN.md`](BUILD-PLAN.md), which owns milestone numbering, exit criteria, and the
PR sequence at a high level. This document is the concrete architecture underneath it: the files,
types, and test strategy for each milestone, written so a different session or agent can execute
directly from it without re-deriving the design.

Not a specification. Everything GitHub-specific is owned by
[the specification](docs/docs/reference/specification.md); everything generic — exit codes, secrets,
the envelope, serialization, determinism, configuration precedence, logging, the manifest — is owned
by the plugin contract and referenced here, never restated.

**Corrections to `BUILD-PLAN.md`'s current claims, verified against this repository:**
`.github/workflows/ci.yml` is a single `ubuntu-latest` job today — no matrix, no `windows-latest`, no
`fail-fast: false`, no container job. This repository's git history (5 commits, max PR #4) does not
contain the PR #11 the "Current state" section cites for a green Windows run. M8's premise that a
`container` CI job already exists and merely needs a "running" step is also false — none exists. Both
get fixed here: PR 2 (§12) folds in the CI matrix, and Milestone 8 creates the container job.
`BUILD-PLAN.md` itself needs its "Current state" section corrected to match (tracked in §11).

**Decisions taken**, each resolved by the repository owner before this plan was finalized:

| Decision                           | Choice                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `gh auth token` reuse              | **Included** in Phase One — via a direct read of the GitHub CLI's own credential file, not a subprocess. See §1.7. |
| `sync` idempotency                 | `idempotent` (matches the current contract reference example)                                                      |
| Commands declared in `plugin.yaml` | All six — `manifest`, `validate`, `sync`, `list`, `stats`, `export`                                                |
| Coverage gate                      | **Added**: `@vitest/coverage-v8`, enforced in `npm run check`                                                      |

---

## 1. Cross-cutting decisions (apply throughout, stated once)

### 1.1 The two contract schemas are already vendored

```
schemas/
  contract/
    plugin-manifest.schema.json     vendored byte-for-byte, never edited here — DONE
    result-envelope.schema.json     vendored byte-for-byte, never edited here — DONE
    VENDORED.md                     provenance: source path, schema $id, contract version
                                     1.0.0-draft, copy date, sha256 — honestly stating no
                                     upstream commit SHA exists yet (contract repo not split out) — DONE
  projects.schema.json              generated from Zod — this plugin owns it (M6)
  sync.input.schema.json            generated (M7)
  sync.output.schema.json           generated (M7)
  export.output.schema.json         generated (M7)
```

**These three files already exist at `schemas/contract/` in this repository** — vendored ahead of
Milestone 2 because their original source (a staged, untracked copy of the ecosystem specifications)
was relocated out of this repository before Milestone 1 started, and a plan telling an implementer to
vendor from a path that no longer resolves is a dead end. `VENDORED.md` records the honest provenance,
including that no upstream commit SHA exists yet, and the refresh procedure to follow once
`SubZeroDev.PluginContract` becomes its own repository. What remains as **M2 work**: the ajv test suite
below, which does not exist yet.

`tests/contract/ajv.ts` — shared `Ajv2020` factory (`ajv/dist/2020.js` + `ajv-formats`, `strict: true`).
`tests/contract/manifest.test.ts` and `envelope.test.ts` validate positive cases from this plugin's own
output **and** a battery of negatives (unknown key under `capabilities`; non-development docker runtime
missing `digest`; `commands[].id` with a dot; `succeeded` paired with `exitCode: 4`; `exitCode: 1`; a
`+02:00` timestamp; `partial` with empty `errors`; artifact paths `../etc`, `C:\secret`,
`\\server\share`). The negatives are what prove the validator is wired up, not just present.

### 1.2 Dependency decisions

| Package                      | Kind    | Verdict                            | Why                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ajv` ^8, `ajv-formats` ^3   | dev     | **Add**                            | Only a draft-2020-12 validator can check the vendored schemas; `ajv` currently resolves to `6.15.0` transitively (via ESLint) and cannot validate this draft at all.                                                                                                                                                                                                                           |
| `@vitest/coverage-v8`        | dev     | **Add**                            | Per the coverage-gate decision above. Configure in `vitest.config.ts` (new file — none exists today) with a threshold; fold into `npm run check`.                                                                                                                                                                                                                                              |
| `@octokit/plugin-throttling` | runtime | **Do not add**                     | Its job is to sleep-and-retry under rate pressure; the spec requires warning at 50% and **stopping cleanly at 90%**, reporting partial success — the opposite behavior. It also can't supply the per-endpoint request counts, 304-exclusion, or the separate 20/min Search bucket the spec requires; all of that is bespoke regardless.                                                        |
| `@octokit/plugin-retry`      | runtime | **Do not add**                     | It treats HTTP `202` as success — exactly what the spec forbids for `/stats/*`. The bounded-202-retry-to-null loop is bespoke either way. Its remaining value (5xx/network backoff) is ~30 lines against an injected `Sleeper`, and every request this plugin makes is a `GET`, so the usual non-idempotent-retry hazard doesn't apply — record this reasoning in an ADR (§11).                |
| `p-limit`                    | runtime | **Do not add**                     | Need three things it lacks: a budget check between task starts so dispatch halts at 90%; per-item outcomes (partial success is first-class, not `Promise.all` reject-on-first-failure); results index-aligned to input regardless of completion order. Hand-rolled `mapConcurrent` (M3) gives all three directly.                                                                              |
| `msw` / `nock`               | dev     | **Do not add**                     | See §1.3.                                                                                                                                                                                                                                                                                                                                                                                      |
| `zod-to-json-schema`         | —       | **Never**                          | Targets Zod 3; `z.toJSONSchema()` is built into the installed `zod@4`.                                                                                                                                                                                                                                                                                                                         |
| `yaml`, `pino`               | runtime | Already declared, currently unused | M6 / M2 make each real.                                                                                                                                                                                                                                                                                                                                                                        |
| `@octokit/rest`              | runtime | **Removed, 2026-07-30**            | Superseded by [ADR-003](docs/docs/decisions/adr-003-request-wrapper-and-http-testing.md). With every Octokit plugin above rejected, what remained was route strings and types the Zod boundary does not rely on; M3's first implementation constructed an `Octokit` with the live token and issued no request through it. §1.3's stub is now injected as the client's `fetch` option directly. |

Net new: three devDependencies (`ajv`, `ajv-formats`, `@vitest/coverage-v8`), zero new runtime
dependencies.

### 1.3 HTTP mocking: a hand-rolled `fetch` stub

**Decision: a hand-rolled stub injected as the client's `fetch`**, not `msw` or `nock`.

> **Amended 2026-07-30.** This section was written as "injected through Octokit", via
> `new Octokit({ request: { fetch } })`. Octokit is no longer a dependency
> ([ADR-003](docs/docs/decisions/adr-003-request-wrapper-and-http-testing.md)); the stub is passed to
> `createGitHubClient({ fetch })` instead. Everything below about _why_ a hand-rolled stub beats `msw`
> and `nock` is unaffected, and the seam is now one option on this repository's own client rather than a
> documented behavior of `@octokit/request`.

`@octokit/request` resolves `requestOptions.request?.fetch ?? globalThis.fetch` — a documented,
per-instance seam. `nock` intercepts `http.ClientRequest`, which Octokit v22's native-fetch requests on
Node 24 don't go through (v14's undici support patches process-wide globals and is newer/riskier).
`msw` does intercept native fetch but exists to give browser/Node parity with request-handler ergonomics
this project doesn't need, and it also patches globals process-wide, which fights parallel test workers.
The stub, by contrast, asserts exactly what this spec needs and a request-handler library makes
awkward: exact per-endpoint request **counts** (budget verification is an exit criterion), presence of
`If-None-Match`, a bodyless `304`/`202`, and a `Link` header with `rel="last"` — each one line returning
`new Response(...)`.

```ts
// tests/support/fetch-stub.ts
export interface StubRoute {
  readonly method: 'GET';
  readonly pathPattern: RegExp;
  readonly respond: (request: RecordedRequest, callIndex: number) => StubResponse;
}
export interface StubResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown; // undefined => no body, for 304 and 202
}
export interface FetchStub {
  readonly fetch: typeof globalThis.fetch;
  readonly requests: readonly RecordedRequest[];
  countMatching(pattern: RegExp): number;
  assertNoUnmatchedRoutes(): void;
}
export function createFetchStub(routes: readonly StubRoute[]): FetchStub;
```

An unmatched request returns `501` and is recorded, so a test hitting an endpoint the budget didn't
account for fails loudly. Honest cost: the stub bypasses undici, proving nothing about real TLS or
redirects — which is exactly why M3.5's real-account run and the live-verification test are
non-negotiable, opt-in via an env var, and never run in CI with a real token.

### 1.4 `commands/` versus `services/` — enforced, not just documented

- **`src/commands/*`** are thin CLI adapters: parse their own option table, call one service, return a
  `CommandResult`. A command module never writes to stdout, never calls `process.exit`, never chooses
  an exit code numerically.
- **`src/services/*`** hold the orchestration, constructor-injected with ports (`Clock`, `Sleeper`,
  `Logger`, `FileSystemPort`, `CacheStore`, `RepositoryProvider`) — no `process`, no direct `node:fs`,
  no `console`, no argv.
- **`src/output/*`** renders — text renderers plus the envelope builder/writer (the _only_ place that
  writes to `process.stdout` in JSON mode).
- **`src/models/*`** are pure Zod plus pure comparators — no I/O, no provider imports.

Enforce with ESLint `no-restricted-imports`:

| Scope                                                    | Forbidden                                                                                   | Protects                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/**` and `tests/**` except `src/providers/github/**` | `@octokit/*`                                                                                | "No GitHub type escapes `providers/github`". **Implemented.** The dependency was removed by ADR-003, so the rule now guards against a reintroduction; `tests/**` is in scope because that is where a "just for a type" import gets written first |
| `src/models/**`                                          | `src/providers/**`, `node:fs`, `pino`                                                       | Domain purity                                                                                                                                                                                                                                    |
| `src/services/**`                                        | `node:fs`, `node:process`, `console`, `pino`, `src/commands/**`                             | Unit-testable without real I/O                                                                                                                                                                                                                   |
| `src/commands/manifest.ts`                               | `configuration/**`, `providers/**`, `cache/**`, `services/**`, `pino`, `@octokit/*`, `yaml` | The bare-container requirement (§1.5)                                                                                                                                                                                                            |

### 1.5 The `manifest` command and the bare-container requirement

Three structural moves:

1. **Lazy dispatch.** `src/commands/registry.ts` maps command name → `() => import('./sync.js')`, so a
   `manifest` invocation never evaluates any other command's module graph.
2. **Short-circuit before any shared startup.** `runCli` handles `--help`, `--version`, and `manifest`
   before constructing the logger or touching configuration.
3. **`manifest` emits pre-canonicalized bytes, verbatim.** `plugin.yaml` at repo root is the authored
   source. `tools/build-manifest.ts` (runs before `tsc` in `npm run build`) parses it, ajv-validates
   against the vendored schema, canonicalizes (recursive key sort, LF, one trailing newline) via
   `src/serialization/canonical-json.ts`, and writes `dist/plugin.manifest.json`.
   `src/commands/manifest.ts` reads those bytes and writes them to stdout **unchanged** — no
   `JSON.parse`/re-stringify, which is what makes a future signed attestation byte-identical to what
   `manifest` prints. Its only runtime imports are `node:fs`, `node:url`.

Enforcement beyond the ESLint rule: an **import-graph test**
(`tests/commands/manifest-isolation.test.ts`) that reads `dist/commands/manifest.js`, follows every
static import transitively, and asserts the closure contains nothing under `configuration/`,
`providers/`, `cache/`, `services/`, and no third-party package. Plus a CI step:
`docker run --rm --network none <image> manifest` with no mounts, no env.

**`plugin.yaml` content, per the decisions above:** all six commands declared;
`runtimes[].entrypoint` for docker is `["node", "dist/cli.js"]` (the current `Dockerfile` never links
the package's own `bin`, so the reference example's `["subzerodev-github"]` wouldn't actually resolve —
fix the manifest rather than adding a symlink to make a cosmetic name work); the all-zero placeholder
`digest` stays until M8's release; `github-token` → `GITHUB_TOKEN`; capabilities unchanged from the
reference example (`network.required: true`, `destinations: [api.github.com]`,
`filesystem.read: [config]`, `write: [cache, output]`) — `processExecution` stays absent, because the
`gh auth token` reuse feature is implemented as a direct file read rather than a subprocess (§1.7), so
it never needs it. `inputSchema`/`outputSchema` are added progressively — absent until M7, when option
tables exist to generate them from.

**`idempotency` per command.** The manifest schema makes this a **required** field on every entry in
`commands[]`, so all six need a value — not just `sync`. Every command in this plugin is `idempotent`,
because none of them writes to any system outside this plugin's own cache and output, and repeating any
of them over unchanged inputs produces the same result. Stated explicitly rather than left to inference,
because `idempotency` is what a host's retry policy keys on:

| Command    | `idempotency` | Why                                                                                                                                                              |
| ---------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest` | `idempotent`  | Prints fixed bytes from the build; no inputs, no state.                                                                                                          |
| `validate` | `idempotent`  | Reads and checks only; performs no writes at all.                                                                                                                |
| `sync`     | `idempotent`  | An unchanged upstream reproduces the same cache and output byte-for-byte — the determinism M5 and M6 exist to prove.                                             |
| `list`     | `idempotent`  | Reads the cache and renders.                                                                                                                                     |
| `stats`    | `idempotent`  | Derives aggregates from the cache; no collection, no writes.                                                                                                     |
| `export`   | `idempotent`  | **The one that looks side-effecting and is not.** It writes files, but rewrites the same canonical bytes from the same cache, so a repeat is a no-op in content. |

None is `conditional`, so no `idempotencyCondition` is needed anywhere — which is why the earlier
decision to keep `sync` at `idempotent` rather than `conditional` matters beyond `sync` itself. Search
API eventual consistency is handled where it actually belongs, in the cache's `VOLATILE_FIELDS` exclusion
(§7), so it never reaches the artifacts whose stability this field describes.

### 1.6 Threading global options through two-stage `parseArgs`

`src/commands/global-options.ts` defines `GLOBAL_OPTIONS` (`help`, `version`, `output-format`, `json`,
`config`, `log-level`, `quiet`, `dry-run`) and `splitAtCommand(argv)`, which walks argv with an explicit
value-taking-option set so `--config path sync` correctly finds `sync` as the command, not `path`.

1. Stage 1: parse global options up to the command token (`strict: true` — unknown global → exit 2).
2. No command → help, exit 0 (preserved). Unknown command → exit 2 (preserved — `manifest` stops being
   "unknown" here).
3. Stage 2: parse the remainder against `{ ...GLOBAL_OPTIONS, ...command.options }`, so globals work on
   either side of the command token and each command declares only its own extras. Globals from both
   stages merge (stage 2 wins), then resolve once into a `GlobalOptions` object.

Resolution rules worth stating because the wrong-but-tempting alternative is real: `--json` together
with `--output-format text` is exit `2` naming both, never last-wins silently. `--log-level` precedence
is CLI → `SUBZERODEV_LOG_LEVEL` env → config → `info`. `--config` resolves relative to the **cwd**;
paths _inside_ the file resolve relative to **the file** — two different bases, and conflating them is
the documented failure mode. `manifest`'s handler takes no `CommandContext` at all — a type-level
statement of the bare-container rule (§1.5).

### 1.7 `gh auth token` reuse — a direct credential-file read, not a subprocess

The specification treats GitHub CLI token reuse as optional, opt-in, and always recorded — never a
silent fallback, because it inherits whatever scopes the user's `gh` session holds, usually broader
than what this plugin needs. The obvious implementation shells out to `gh auth token`, which is why an
earlier draft of this plan deferred the feature: spawning a process for an opt-in convenience means
declaring `capabilities.processExecution: true`, widening the security surface of the reference plugin
every other plugin gets scaffolded from, for a feature most runs never use.

**Decision: read `gh`'s own stored credential file directly, and hand the token to the request wrapper
exactly like any other resolved token — no subprocess, no CLI dependency, no new capability.** `gh` persists its
OAuth token in `hosts.yml` under its config directory (`$GH_CONFIG_DIR`, else the platform default —
`~/.config/gh` on Linux/macOS, `%AppData%\GitHub CLI` on Windows), already YAML, which the `yaml`
dependency already declared reads. The resolved token flows through the exact same
`ResolvedToken`/`registerSecret` path as an environment-variable token (§3) — nothing downstream needs
to know which source it came from.

```ts
// src/services/gh-cli-credentials.ts
export interface GhCliCredentialSource {
  read(): Promise<{ readonly token: string; readonly configPath: string } | null>;
}
export function createGhCliCredentialSource(
  fileSystem: FileSystemPort,
  environment: Readonly<NodeJS.ProcessEnv>,
): GhCliCredentialSource;
```

**Token resolution order** (`src/services/token.ts`, extended): the configured environment variable, if
set → else, if `auth.allowGhCliTokenReuse` is `true` in configuration, the `gh` credential file → else
refuse to start, exit `5`. Whichever source resolved is always present in `validate`'s output and the
run report — `ResolvedToken.source: 'environment' | 'gh-cli'` is a required field, not merely loggable,
which is what keeps this "recorded, never silent" structurally rather than by convention. When
`allowGhCliTokenReuse` is enabled but the credential file is absent or unparsable, that is itself a
reported diagnostic ("gh CLI token reuse enabled, no credential found at `<path>`"), not a quiet
no-op — the run still refuses without a token, but says why.

**Scoped to native execution.** This is a workstation convenience: `gh`'s config lives in the invoking
user's home directory, outside the plugin's declared filesystem scopes (`config`/`cache`/`output`/
`workspace`), and the capability model has no scope for an arbitrary host credential file. Under the
`node-local` development runtime, or a bare install on a workstation, the plugin runs as the same user
as `gh` and simply finds the file. Under the `docker` runtime it will not, by design — the credential
directory isn't among the declared mounts and adding one would be exactly the capability-widening this
design avoids. That is expected and should be documented (M8, `docs/docs/guide/configuration.md`), not
treated as a defect: in Docker, `allowGhCliTokenReuse` degrades to "not found," and the run refuses
without a token exactly as it does with no reuse configured at all.

**Test strategy:** unit, against a fake `GhCliCredentialSource` and `memoryFileSystem` — no real
filesystem, no real `gh` installation. Resolution precedence: env var present → gh-cli source never
consulted; env var absent + reuse disabled → refuse, exit 5, no gh-cli lookup attempted; env var absent

- reuse enabled + credential found → resolves, `source: 'gh-cli'`, `registerSecret` called; env var
  absent + reuse enabled + credential file absent → refuse, exit 5, with the specific diagnostic naming
  the path checked. A hand-built `hosts.yml` fixture (valid, missing `github.com` entry, malformed YAML)
  exercises the parser. Redaction canary applies here too: the gh-cli token value must be absent from
  logs and the envelope exactly as an environment-sourced one is (§3's redaction test extends to cover
  this source).

**Exit:** an environment-variable token is always preferred over `gh` reuse when both are available; a
missing credential file with reuse enabled produces a named, actionable diagnostic rather than a silent
refusal; the resolved token source is present in `validate`'s output and the run report on every run
that has one; no `processExecution` capability is declared in `plugin.yaml`; a token sourced from `gh`'s
credential file is redacted from logs and the envelope identically to an environment-sourced one.

### 1.8 npm package, publishing, and `npx`

The plugin ships as an npm package in addition to the OCI image, so it can be installed and run through
Node with no container. Landed in **Milestone 8** (§10); recorded here because it constrains
`package.json` and the `bin` surface from the start.

**Published to npmjs.com, with the tarball also attached to each GitHub Release.** GitHub Packages was
considered and rejected as the primary registry for one disqualifying reason: it has **no anonymous read
for npm packages**, even public ones, so every consumer — including `npx` — must first configure an
authenticated `.npmrc`. That defeats the point of offering `npx` at all. npmjs.com is the registry that
makes a zero-setup `npx` work; the GitHub Release tarball covers provenance and archival, and gives
anyone who prefers it a direct, versioned download.

**Package name: `@subzerodev/plugins-github`** — mirroring the repository name
`SubZeroDev.Plugins.GitHub`. This is a rename from the current `@subzerodev/plugin-github` (singular)
and settles ecosystem work item X14 for this plugin, which explicitly asked for naming to be fixed
_before first publish_ — free now, expensive after. The plugin contract's name-mapping table lists the
language-package row as "per-ecosystem convention" and gives `@subzerodev/plugin-github` only as an
example, so this is a convention choice rather than a contract violation — but the divergence is real
and must be recorded, not left to be discovered. Touchpoints for the rename:

| File                                                    | Change                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                          | `name` → `@subzerodev/plugins-github`                                                                                  |
| `docs/docs/reference/specification.md`                  | The identity table's `Package` row                                                                                     |
| `AGENTS.md`                                             | The "Naming" section, which currently states the singular form as current                                              |
| `docs/docs/decisions/adr-001-hosting-and-versioning.md` | **Add a dated amendment** — do not edit the Decision or the existing amendments. An ADR records what was decided when. |
| New ADR                                                 | Records the rename, the npmjs.com-over-GitHub-Packages decision, and the anonymous-read reasoning above                |

Upstream, the contract's own name-mapping example and reference `plugin.yaml` should be updated to match
once `SubZeroDev.PluginContract` is its own repository — otherwise the next plugin author copies the
singular form. Out of scope for this repository; note it in the new ADR so it is not lost.

**`package.json` changes** (Milestone 8):

```jsonc
{
  "name": "@subzerodev/plugins-github",
  // "private": true is REMOVED — it currently blocks publish entirely
  "license": "MIT", // a LICENSE file already exists at the root but is not mirrored here
  "repository": {
    "type": "git",
    "url": "git+https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub.git",
  },
  "bugs": { "url": "https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub/issues" },
  "homepage": "https://plugins-github.subzerodev.com",
  "publishConfig": {
    "access": "public", // scoped packages default to restricted; without this, publish fails
    "registry": "https://registry.npmjs.org", // explicit, so a stray .npmrc cannot retarget a publish
  },
  "bin": {
    "subzerodev-github": "./dist/cli.js", // canonical, per the contract's name mapping
    "sz-github": "./dist/cli.js", // convenience alias; automation must not depend on it
    "plugins-github": "./dist/cli.js", // exists ONLY so `npx @subzerodev/plugins-github` resolves
  },
  "files": ["dist", "schemas", "plugin.yaml"], // npm always adds package.json, README, LICENSE
  "scripts": {
    "prepublishOnly": "npm run check", // nothing publishes without the full gate having passed
  },
}
```

**Why the third `bin` entry.** `npx @scope/name` resolves by looking for a bin matching the _unscoped
package name_ — here `plugins-github`. With only `subzerodev-github` and `sz-github` declared, npm
cannot determine which to run and errors with "could not determine executable to run", so the bare
`npx @subzerodev/plugins-github` the feature exists to provide would fail. The alternative is requiring
`npx -p @subzerodev/plugins-github subzerodev-github <command>` — correct but hostile. One extra `bin`
line buys the clean form; it is packaging glue, not a fourth CLI identity, and the docs should present
`subzerodev-github` as the command's name throughout.

Supported invocations after this lands, all of which the M8 documentation must show working:

```bash
npx @subzerodev/plugins-github --help          # zero install
npm install -g @subzerodev/plugins-github      # then: subzerodev-github --help  /  sz-github --help
npm install @subzerodev/plugins-github         # as a dependency; ./node_modules/.bin/subzerodev-github
node dist/cli.js --help                        # from a clone, unchanged from today
```

**Release workflow** (`.github/workflows/release.yml`, new). Triggered on a `v*` tag push, plus
`workflow_dispatch`. Needs `permissions: { contents: write, id-token: write }` — `contents: write` to
create the Release and upload the tarball, `id-token: write` for npm provenance.

1. `npm ci`, then `npm run check` on the matrix — a release must not be the first place the suite runs.
2. **Assert version consistency**: `package.json` `version` === `plugin.yaml` `version` === the git tag
   (minus `v`) === the image's `org.opencontainers.image.version` label. A mismatch fails the release
   rather than shipping four artifacts that disagree about what they are. This is a scripted check, not
   a review step.
3. `npm pack`, then **assert the tarball's contents** with `npm pack --dry-run --json`: `dist/`,
   `schemas/`, and `plugin.yaml` present; `tests/`, `docs/`, `.github/`, and any `.env` absent. The
   `files` allowlist makes this likely, not certain — a packaging mistake that ships tests is noise, but
   one that ships a fixture token is a secret leak, so it gets an assertion.
4. `npm publish --provenance --access public` with `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`.
   `--provenance` ties the published package to this repository and the exact commit via OIDC; it
   requires the `id-token: write` permission above and a public repository.
5. Build, push, and sign the OCI image; replace `plugin.yaml`'s placeholder digest with the real one
   (§10, already planned).
6. Create the GitHub Release and `gh release upload` the `.tgz` from step 3 alongside the signed image
   digest and the conformance report.

**Use `files`, never `.npmignore`.** Two mechanisms for the same decision drift, and `files` is an
allowlist — the safer default, since a new top-level directory is excluded by omission rather than
included by oversight.

**Test strategy.** A packaging test (`tests/packaging/package-metadata.test.ts`) asserting, without
publishing anything: `private` is absent; `license`, `repository`, and `homepage` are present; every
`bin` target resolves to a file that exists after a build and begins with the `#!/usr/bin/env node`
shebang; `files` includes `dist`, `schemas`, and `plugin.yaml`; and `version` matches `plugin.yaml`. The
existing `tests/cli.test.ts` already covers the installed-binary-symlink path that a global install
relies on, and must keep passing unedited. Actual `npx` resolution cannot be tested without publishing;
verify it once manually against the first published version and record the result in the release PR.

**Exit:** `npm pack --dry-run` lists `dist/`, `schemas/`, and `plugin.yaml` and lists no file under
`tests/`, `docs/`, or `.github/`; `package.json` carries no `private` field and declares `license`,
`repository`, and `homepage`; every declared `bin` target exists after a build and carries a shebang;
the release workflow refuses to publish when `package.json`, `plugin.yaml`, the git tag, and the image
label do not all state the same version; `npx @subzerodev/plugins-github --help` exits 0 against the
published package with no `.npmrc` configured, and that verification is recorded rather than assumed.

---

## 2. Milestone 1 — Domain contracts and canonical schemas

**Files.** `src/models/` split by concern (not one file — a single file would exceed 600 lines and
every change would touch it): `schema-version.ts`, `primitives.ts`, `identity.ts`, `diagnostics.ts`,
`language.ts`, `release.ts`, `branch.ts`, `contributor.ts`, `statistics.ts`, `repository.ts`,
`portfolio.ts`, `project.ts` (filename preserved — existing public export path), `summary.ts`,
`documents.ts`, `index.ts` (barrel). `src/index.ts` updated. `tests/models/*.test.ts` one per concern
plus `round-trip.test.ts`, `identity.test.ts`, `language-rounding.test.ts`.
`tests/fixtures/projects/{minimum,complete,private,archived,fork,template,unicode}`,
`tests/fixtures/invalid/{bad-schema-version,non-utc-timestamp,bad-url,bad-percentage,duplicate-id,numeric-provider-id}`.
Repo root: `.github/workflows/ci.yml` gains the `[ubuntu-latest, windows-latest]` matrix,
`fail-fast: false` (the M0 remediation).

**Key types:**

```ts
export const providerIdSchema = z.string().regex(/^[0-9]+$/); // string, never a JSON number
export const timestampSchema = z.string().regex(RFC3339_UTC); // NOT z.date() — unrepresentable in JSON Schema
export function compareProviderId(a: string, b: string): -1 | 0 | 1; // BigInt comparison — see below
export function compareIdentity(a: ProjectIdentity, b: ProjectIdentity): -1 | 0 | 1;

export type ProjectStatus = 'active' | 'archived'; // DERIVED, never collected directly
export interface Branch {
  readonly protected: boolean | null; // null = unreadable under this token/plan, NOT unprotected
}
export interface ContributorSummary {
  readonly total: number | null;
  readonly truncated: boolean; // GitHub caps the list and omits anonymous contributors
}
export interface IssueSummary {
  readonly open: number | null; // corrected: open_issues_count minus open PRs
  readonly closed: number | null; // Search API, eventually consistent
}
export function distributeLanguagePercentages(
  byteCounts: readonly { name: string; bytes: number }[],
): readonly LanguageStatistics[];
```

**Decisions this milestone settles:**

- **Total order on identity: `compareProviderId` compares numerically via `BigInt`, ascending.**
  Lexicographic string comparison orders `"10"` before `"9"` — not what "ascending identity" means to
  a reader. `compareIdentity` compares `provider` first (future multi-provider case), then `providerId`
  numerically. Every sort in the codebase calls `compareIdentity` so exactly one total order exists;
  `projects.json` array order is by identity, not slug (renaming a repo shouldn't reorder the document).
- **Language rounding: largest-remainder (Hare–Niemeyer) on a basis of 10,000.** Integer arithmetic,
  sums to exactly `100.00`, deterministic tie-break (bytes descending, then name ascending).
- **Serialized schemas use only JSON-representable Zod constructs** — no `z.date()`, `.transform()`,
  `z.custom()` reachable from a document schema, since `z.toJSONSchema()` (M6) throws on these and this
  should fail the build, not surface as an export-time surprise.
- `null` over `.optional()` throughout.

**Test strategy:** entirely unit, no I/O beyond fixture files. Round-trip all seven fixtures
(`parse(serialize(parse(x)))` deep-equals). Every invalid fixture asserts a **Zod issue path**, not
just "it threw." `compareIdentity` antisymmetric/transitive/total over a generated ID set including
64-bit values; a rename-fixture pair (same `providerId`, different slug) compares equal. Rounding: many
generated distributions, including exact ties, all sum to exactly 100.

**Exit:** every fixture round-trips with no semantic change and `projects.json` ordering is identical
across a shuffled input; each invalid fixture is rejected naming the offending field's path; a fixture
pair differing only in slug compares equal under `compareIdentity`, one differing only in `providerId`
never does; language percentages sum to exactly 100 for every generated distribution including exact
ties; no file under `src/models/` resolves an import to `@octokit/*` or `src/providers/**`; a
`z.date()` anywhere in a document schema fails the build.

---

## 3. Milestone 2 — Ports, configuration, and secret safety

> **Scope boundary, reconciled with `BUILD-PLAN.md`.** That document originally listed four items
> here that cannot land in this milestone, because each needs something built later: option
> precedence and the exit-code mapping need the CLI layer (§5, §9), the `CacheStore` shape depends on
> resource keys and reconciliation (§5, §7), and the serializer shape depends on the document set it
> serializes (§8). `BUILD-PLAN.md`'s Milestone 2 now records them as moved, with the reason. If a
> future reader finds the two documents disagreeing again, this ordering is the considered one and
> the checklist is what drifted.
>
> `CollectionResult` and `DiscoveredRepository` are deliberately stubs until Milestone 3, for the
> same reason: carrying rate-limit and partial-failure results means carrying per-resource ETags and
> a rate-limit snapshot, and guessing those shapes now guarantees changing them later.

**Files.** `src/configuration/{schema,load,resolve,environment,errors}.ts`.
`src/logging/{logger,redaction,secret-registry}.ts`. `src/services/{ports,system}.ts`.
`src/providers/provider.ts` (rewritten). `src/providers/outcome.ts`. `tests/configuration/*.test.ts`,
`tests/logging/redaction.test.ts`, `tests/support/fake-ports.ts`,
`tests/fixtures/configuration/{valid-minimal,valid-full,unknown-key,wrong-version,malformed,contains-token}.json`.
New here: `tests/contract/{ajv,manifest.test,envelope.test}.ts` (§1.1 — the schemas themselves are
already vendored; this is the suite that validates against them). Repo root:
`examples/github.config.json`, `CHANGELOG.md`.

**Key types:**

```ts
// The configuration schema has NO string field a token could occupy. .strict() at every level turns
// an attempted token field into a refusal, not a silent ignore.
export const configurationSchema = z
  .object({
    configVersion: z.literal('1.0.0'),
    auth: z
      .object({
        tokenEnvironmentVariable: z
          .string()
          .regex(/^[A-Z_][A-Z0-9_]*$/)
          .default('GITHUB_TOKEN'),
        allowGhCliTokenReuse: z.boolean().default(false), // opt-in; see §1.7
      })
      .strict()
      .default({}),
    repositories: z
      .object({ includeForks: z.boolean().default(false) /* ... */ })
      .strict()
      .default({}),
    collection: z
      .object({ profile: z.enum(['basic', 'standard', 'detailed']).default('standard') })
      .strict()
      .default({}),
    directories: z
      .object({ cache: z.string().default('.cache'), output: z.string().default('output') })
      .strict()
      .default({}),
    output: z
      .object({
        formats: z
          .array(z.enum(['json', 'yaml']))
          .min(1)
          .default(['json', 'yaml']),
        retainRawResponses: z.boolean().default(false),
      })
      .strict()
      .default({}),
    budget: z
      .object({
        concurrency: z.number().int().min(1).max(16).default(4),
        warnAtPercentConsumed: z.number().int().min(1).max(99).default(50),
        stopAtPercentConsumed: z.number().int().min(1).max(99).default(90),
        searchRequestsPerMinute: z.number().int().min(1).max(30).default(20),
      })
      .strict()
      .default({}),
  })
  .strict();

// A resolved token is a SEPARATE value that never enters Configuration/ResolvedConfiguration
// and is never serialized. `source` and its companion path/variable fields are always present,
// which is what keeps gh-cli reuse "recorded, never silent" structural rather than conventional.
export interface ResolvedToken {
  readonly value: string; // never logged, never serialized
  readonly source: 'environment' | 'gh-cli';
  readonly environmentVariable: string | null; // set when source is 'environment'
  readonly credentialPath: string | null; // set when source is 'gh-cli'
}

// providers/provider.ts — replaces the placeholder `ProjectProvider`
export interface RepositoryProvider {
  checkAccess(): Promise<Outcome<ProviderAccess, ProviderError>>;
  discover(filter: RepositoryFilter): AsyncIterable<Outcome<DiscoveredRepository, ProviderError>>;
  collect(
    target: DiscoveredRepository,
    profile: CollectionProfile,
    conditions: ResourceConditions,
  ): Promise<CollectionResult>;
  usage(): RequestUsage;
}
// A result type, not exceptions, across the port boundary — partial success is first-class,
// and an exception makes it too easy to abort the whole discovery loop on one bad repository.
export type Outcome<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
export type ProviderErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'rate-limited'
  | 'secondary-rate-limit'
  | 'not-found'
  | 'server-error'
  | 'network'
  | 'response-shape'
  | 'not-settled';

export interface Clock {
  now(): Date;
}
export interface Sleeper {
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
} // separate from
// Clock deliberately — retry/backoff tests need to advance time without waiting
export interface FileSystemPort {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, contents: Uint8Array): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string, o?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<readonly string[]>;
  stat(path: string): Promise<FileStat | null>;
  realpath(path: string): Promise<string>;
  remove(path: string, o?: { recursive?: boolean }): Promise<void>;
}
```

**Logger and redaction:** `pino({ level, redact, serializers: { err: sanitizeError } },
pino.destination({ fd: 2, sync: true }))`. **`fd: 2` is the single most load-bearing literal in the
codebase** — pino defaults to stdout. `sync: true` matters too: an async destination can drop buffered
records on a non-zero exit, losing exactly the diagnostics a failure needs. Pino's `redact` is
name-based and doesn't follow a `.cause` chain, so it's a backstop; the real mechanism is
`scrubSecrets(text)`, **value-based** — replaces every occurrence of each value `registerSecret()` was
called with (plus its `encodeURIComponent` form) with `[redacted]`, run at three chokepoints: the
logger's error serializer, the envelope-serialization boundary, and `cli.ts`'s last-resort
`uncaughtException`/`unhandledRejection` handler.

**Test strategy:** unit only, `memoryFileSystem`, no real filesystem or network. Configuration:
valid/unknown-key/wrong-version/malformed fixtures each produce the right exit-2 error; **the
`contains-token` fixture is refused**, making the structural guarantee observable. A **schema-shape
guard test** walks every leaf key name in `configurationSchema` and asserts none matches
`/token|secret|password|credential|pat|authorization|bearer/i` except the allowlisted
`tokenEnvironmentVariable` — catches a careless future field addition mechanically. Redaction canary:
register `ghp_CANARY_DO_NOT_LEAK`, assert absence from a plain logged string, a logged `Error.message`,
a three-deep `.cause` chain, a simulated Octokit `RequestError` with an `authorization` header, a
cyclic error graph, and the serialized envelope; assert `process.stdout.write` is never called during
any logging test at `trace`.

**Exit:** the configuration schema has no field a token value could occupy, and a configuration
carrying a token-shaped field is refused with exit `2` naming the key; malformed/incompatible config
produces a stable code and exit `2`; paths inside a config file resolve relative to that file with cwd
set elsewhere; a registered secret canary appears in no log record, serialized error, three-deep
`.cause` chain, or envelope; `process.stdout.write` is never called during any logging test.

---

## 4. Milestone 3 — GitHub adapter and repository discovery

**Files.** `src/providers/github/{client,request,rate-limit,errors,discovery,link-header,github-provider,resource-keys}.ts`,
`src/providers/github/mapping/{repository,index}.ts`. `src/services/{concurrency,token,gh-cli-credentials}.ts`.
`tests/providers/github/*.test.ts`, `tests/support/{fetch-stub,github-payloads,link-header}.ts`,
`tests/fixtures/github/` (recorded-shape payloads: repo min/complete/private/archived/fork/template/
unicode, multi-page sequences, error bodies), `tests/fixtures/gh-cli/{valid-hosts,missing-host,malformed}.yml`.

**Key types:**

```ts
// client.ts — constructs the requester. No GitHub API client package is a dependency (ADR-003);
// `@octokit/*` stays ESLint-forbidden outside this directory to catch a reintroduction.
export function createGitHubClient(options: {
  readonly token: ResolvedToken;
  readonly logger: Logger;
  readonly sleeper: Sleeper;
  readonly clock: Clock;
  readonly budget: RequestBudget;
  readonly userAgent: string;
  readonly fetch?: typeof globalThis.fetch; // the test seam (§1.3); production omits
}): GitHubClient;

export interface RequestSpec {
  readonly resource: ResourceKey;
  readonly url: string;
  readonly bucket: 'core' | 'search';
  readonly etag?: string | null;
  readonly acceptNotModified?: boolean;
  readonly settleRetry?: { attempts: number; baseMilliseconds: number }; // for /stats/* 202
}
export interface GitHubResponse<T> {
  readonly status: number;
  readonly notModified: boolean;
  readonly etag: string | null;
  readonly data: T | null; // null on 304 and on 202-not-settled
  readonly linkLastPage: number | null;
}

export type BudgetDecision =
  | { kind: 'proceed' }
  | { kind: 'warn'; percentConsumed: number }
  | { kind: 'stop'; percentConsumed: number; bucket: 'core' | 'search' };

// Hand-rolled bounded concurrency (§1.2) — results index-aligned to input regardless of completion
// order, which is what keeps downstream output deterministic under concurrency.
export type Settled<R> =
  | { status: 'fulfilled'; value: R }
  | { status: 'rejected'; reason: unknown }
  | { status: 'skipped'; reason: 'budget-stop' | 'cancelled' };
export async function mapConcurrent<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  options: { limit: number; shouldContinue?: () => boolean; signal?: AbortSignal },
): Promise<{ results: readonly Settled<R>[]; stopped: boolean }>;
```

**Request-wrapper behavior, precisely:** check the budget guard first — on `stop`, return a
`rate-limited` error **without issuing the request**. Attach `If-None-Match` when an ETag is supplied.
Classify the response: `304` → `notModified`, not counted against primary quota. `202` with
`settleRetry` → bounded backoff with full jitter (injected random source, so tests are deterministic),
then `not-settled` — **a 202 never returns as `data`**. `401` → `unauthenticated`. `403` with
`x-ratelimit-remaining: 0` → `rate-limited`; `403` with `retry-after` or a secondary-limit body →
`secondary-rate-limit`; other `403` → `forbidden`. `404` → `not-found` (often maps to a valid `null`
upstream). `429` → `rate-limited`. `5xx`/network → retryable with capped exponential backoff + full
jitter, honoring `retry-after`. A payload that fails its Zod parse → `response-shape`, **not
retryable** — provider drift needs a code change, not a retry that hides it.

**Test strategy:** all mocked through the fetch stub, no network. Discovery: empty/single-page/
multi-page (boundary sizes 1/99/100/101) accounts, each repository appears exactly once, request count
matches budget. Filters: full cross-product of include/exclude flags, asserting an excluded fork is
**not fetched** (not merely hidden) via `stub.countMatching`. Mapping: all seven fixtures validate;
missing optionals map to `null`, never `undefined`/`''`. Errors: 401/403-forbidden/403-rate-limited/
403-secondary/404/429/500/502/network/garbage-JSON, each asserting classified kind, `retryable`, and no
token in the message. Rate limits: warn at 50%, stop at 90% with dispatch actually halted; search-bucket
exhaustion independent of core (proves a core-only budget is insufficient). `mapConcurrent`: at most
`limit` in flight; index-aligned results under randomized completion order; a rejecting worker doesn't
block other results. `gh-cli-credentials`: resolution precedence and diagnostics per §1.7.

**Exit:** `@octokit/*` resolves from no module at all, and stays ESLint-forbidden outside
`src/providers/github/` (verified against the
built import graph); every repository in a three-page fixture appears exactly once and an excluded
fork produces zero detail-resource requests; a `304` increments `notModifiedResponses`, not
`coreRequests`; a `202` from `/stats/*` never returns as `data`; search-bucket exhaustion halts search
requests while core requests continue; no classified error message contains the token canary; §1.7's
exit criteria for token resolution.

---

## 5. Milestone 3.5 — First runnable slice (the de-risking step)

Everything here is minimal-but-real; later milestones extend it, not replace it.

**Files.** `plugin.yaml` (repo root, §1.5). `tools/build-manifest.ts`.
`src/serialization/canonical-json.ts` (needed early). `src/commands/{registry,global-options,context,
manifest,validate,sync,list,help}.ts`. `src/output/{envelope,timestamp,render}.ts`.
`src/services/{validation-service,sync-service,list-service}.ts` (minimal versions).
`src/cache/store.ts` (minimal: manifest + per-repository files). `src/cli.ts` (rewritten).
`tests/commands/*.test.ts`, `tests/commands/manifest-isolation.test.ts`, `tests/contract/*.test.ts`
(§1.1), `tests/live/live-account.test.ts` (opt-in via `SUBZERODEV_LIVE_TEST=1`, skipped otherwise,
never in CI). CI: manifest check added to the (new) container job.

**Key types:**

```ts
export const COMMAND_NAMES = ['manifest', 'validate', 'sync', 'list', 'stats', 'export'] as const;
export interface CommandModule {
  readonly name: CommandName;
  readonly options: ParseArgsOptionsConfig;
  readonly requiresContext: boolean; // false only for `manifest`
  readonly sideEffecting: boolean; // true for sync/export -> --dry-run honored
  run(input: CommandInput): Promise<CommandResult>;
}

// status and exitCode cannot disagree — both derive from one union, and 'failed' is typed to
// exclude 0/1/4/124/130 at compile time, which is the envelope schema's allOf conditional
// expressed as a type so the class of bug it guards against can't be written.
export type CommandOutcome =
  | { kind: 'succeeded' }
  | { kind: 'partial' }
  | { kind: 'failed'; exitCode: 2 | 3 | 5 | 6 }
  | { kind: 'cancelled' }
  | { kind: 'timedOut' };

export function buildEnvelope(input: {
  command: CommandName;
  pluginVersion: string;
  startedAt: string;
  finishedAt: string;
  result: CommandResult;
}): ResultEnvelope;
export function writeEnvelope(envelope: ResultEnvelope, stdout: NodeJS.WritableStream): void;
// the ONLY function that writes to process.stdout in JSON mode
```

`buildEnvelope` also enforces the two rules JSON Schema can't express: asserts `finishedAt >=
startedAt`, and if `JSON.stringify(data)` exceeds 256 KiB, replaces `data` with
`{ dataOmitted: true, reason, serializedBytes }` and appends a warning rather than silently truncating.

**`cli.ts` after rewrite:** must preserve every behavior `tests/cli.test.ts` currently asserts
(`readVersion`, `isEntryPoint`, help-with-no-args, exit-2-on-unknown-command/-option) **unedited** —
per this repo's own guide, a ported test that needs editing means the change broke behavior, which is
the signal to stop. New flow: `splitAtCommand` → stage-1 parse → short-circuit
help/version/manifest → resolve config + construct logger → lazily import the command → stage-2 parse
→ run → render → one stdout write → one `process.exitCode` assignment, plus `SIGINT`/`SIGTERM` → an
`AbortController` producing `cancelled` (exit 130), and crash handlers that scrub and write to stderr
while leaving exit code `1` to Node.

**Real-account run:** run `validate → sync → list` against one real account at the `basic` profile
(cheapest first live run). Record observed request counts. **If reality disagrees with the
specification's documented budget, correct the specification**, not the observation, and fold every
mapping correction back into the M1/M3 fixtures, noting in the PR which changed and why.

**Exit:** `manifest` exits 0 with no config file, no env vars, no mounts, and its stdout is
byte-identical to the build-produced canonical file; `manifest` no longer exits 2 as an unknown
command; the built `manifest` command's transitive import closure contains no module under
`configuration/`, `providers/`, `cache/`, `services/` and no third-party package; every command at
`--log-level trace --output-format json` yields stdout that parses as exactly one envelope-valid
document; `validate` against a real account reports readiness while performing zero writes; the
observed live request count is recorded and the specification corrected where it disagreed.

---

## 6. Milestone 4 — Metadata and statistics

**Files.** `src/providers/github/endpoints.ts` (the endpoint-and-budget table — the actual
deliverable), `profiles.ts`, `collect/{languages,releases,branches,contributors,commits,issues,
pull-requests,statistics,index}.ts`. `src/services/{statistics-service,summary-service}.ts`.
`src/models/aggregate.ts`. `tests/providers/github/collect/*.test.ts`,
`tests/services/{statistics,summary}-service.test.ts`, `tests/fixtures/github/statistics/` (202-then-
200 sequences, capped contributor lists, empty repos, Link-less commit responses, Search responses
that disagree between calls). Docs: correct the specification's budget table from the M3.5 observation.

**Key types:**

```ts
export interface EndpointDescriptor {
  readonly resource: ResourceKey;
  readonly path: string;
  readonly paginated: boolean;
  readonly bucket: 'core' | 'search';
  readonly requestsPerRepository: number;
  readonly absenceMeaning: 'valid-null' | 'partial-failure';
  readonly profiles: readonly CollectionProfile[];
}
export const ENDPOINTS: readonly EndpointDescriptor[];
export function budgetForProfile(profile: CollectionProfile): { core: number; search: number };

// The correction, made explicit in the type — this is the load-bearing line.
export interface OpenIssueCorrection {
  readonly reportedOpenIssuesAndPullRequests: number; // raw open_issues_count
  readonly openPullRequests: number | null;
  readonly openIssues: number | null; // difference; null (NOT the raw count) if PR count is unknown
}
export function correctOpenIssueCount(
  reported: number,
  openPullRequests: number | null,
): OpenIssueCorrection;

export type SettleOutcome<T> =
  { kind: 'settled'; value: T } | { kind: 'unsettled'; attempts: number; diagnostic: Diagnostic };
```

Every collector returns `{ value: T | null; diagnostics: readonly Diagnostic[] }`. A shared test
helper, applied to every collector, asserts a `null` value never arrives without at least one
diagnostic — checked once, not remembered per file.

**Test strategy:** per-collector against the fetch stub, using the shared null-with-diagnostic helper.
`open_issues_count`: 10 reported + 4 open PRs → 6; same repo with unknown PR count → `null` (not 10,
not 6). Contributors: capped list → `truncated: true`; uncapped → `false`; flag present in both.
Commit count: `Link rel="last"` page 37 → 37; absent Link on an empty repo → `null`; distinguish "no
Link, empty repo" from "no Link, exactly one page" by whether the body is an empty array. `/stats/*`:
202,202,200 settles in 3 attempts via `fakeSleeper`; 202×4 with a 3-attempt budget gives up to `null` +
diagnostic and **never returns the 202 body**, under 50ms real elapsed time. Languages: deterministic
order across shuffled response key order; sums to 100; single-language repo → exactly `100.00`. Search:
`detailed` over 30 repos keeps search requests ≤20/min via `fakeClock`. Eventually-consistent Search:
two runs differing only in closed counts must not register as a content change (asserted at the cache
layer in M5, and here by excluding closed counts from content-hash input). Budget: `budgetForProfile`
must equal the observed request count from a full stub collection — a mismatch fails the suite, turning
the budget from prose into a checked fact.

**Exit:** `budgetForProfile` equals the observed request count per profile and a drift fails the suite;
a multi-thousand-item paginated fixture yields exactly the input count with no duplicates; every
collector's `null` carries ≥1 diagnostic and no collector ever returns `0` for an unreadable statistic;
a `/stats/*` 202 body never reaches a caller and giving up costs under 50ms of real time; 10 reported
open issues + 4 open PRs reports 6, and an unknown PR count reports `null` rather than 10; every summary
tie resolves to the lower `providerId` and an empty project set yields four _present_ `null` keys.

---

## 7. Milestone 5 — Cache and incremental synchronization

**Files.** `src/cache/{manifest,store,reconcile,content-hash,integrity,reclaim}.ts` (`store.ts`
extended from M3.5). `src/services/sync-service.ts` (extended). `src/serialization/{atomic-write,
digest,path-confinement}.ts`. `tests/cache/*.test.ts`, `tests/serialization/atomic-write.test.ts`
(**runs in the Windows CI leg, not only Linux**), `tests/fixtures/cache/` (valid, corrupt-JSON,
incompatible-version, abandoned-staging, plus a pre-seeded cache reserved for M8's container test).

**Key types:**

```ts
export interface CacheManifest {
  readonly cacheVersion: '1.0.0'; readonly schemaVersion: '1.0.0'; readonly owner: {...};
  readonly repositories: readonly CacheEntry[];   // ARRAY sorted by compareIdentity, never an
    // ID-keyed object — some engines/serializers reorder integer-looking object keys, which would
    // break byte-stability
}
export interface CacheEntry {
  readonly providerId: string; readonly slug: string;    // display only, never a key
  readonly contentHash: string; readonly resources: readonly CachedResource[];
  readonly diagnostics: readonly Diagnostic[]; readonly partial: boolean;
}

export type RepositoryChange =
  | { kind: 'added' | 'unchanged' | 'archived'; identity: ProjectIdentity }
  | { kind: 'updated'; identity: ProjectIdentity; fields: readonly string[] }
  | { kind: 'renamed'; identity: ProjectIdentity; from: string; to: string }
  | { kind: 'removed'; identity: ProjectIdentity; lastSlug: string }
  | { kind: 'failed'; identity: ProjectIdentity; retained: boolean };
export function reconcile(previous: CacheManifest | null, observed: readonly CollectionResult[],
  discovered: readonly DiscoveredRepository[]): { changes: readonly RepositoryChange[]; next: CacheManifest };

export function contentHash(repository: Repository): string;
// Closed issue/PR counts come from Search, which can legitimately differ between identical syncs.
// Including them in the hash would record a spurious `updated` every run. Excluded from the hash,
// still carried in the cached document — the exclusion is documented next to this constant.
export const VOLATILE_FIELDS: readonly string[];

export interface StagingArea {
  stage(relativePath: string, contents: string): Promise<StagedFile>;
  commit(): Promise<readonly ArtifactReference[]>;   // per-file rename, never a directory swap
  discard(): Promise<void>;
}
```

Cache layout: `.cache/manifest.json` plus
`.cache/repositories/<providerId>-<documentHash>.json` (one content-addressed file per repository
revision, **not** one monolithic file) and `.cache/.staging-<runId>/`. The manifest is renamed last and
is the commit record. Content-addressing means repository publication cannot invalidate the previous
manifest if a later rename fails; unreferenced revisions are reclaimed only after the new manifest is
live. A failed repository keeps the prior document reference byte-for-byte.

**Two details expensive to discover late:** staging must be on the **same volume** as the destination
(`liveRoot/.staging-<runId>/`, never `os.tmpdir()` — a cross-device rename fails `EXDEV`, and a bind
mount is often on a different volume from the temp directory). `fs.rename` **does** replace an existing
_file_ on Windows; what fails is renaming a _directory_ onto an existing one, which is precisely why the
contract forbids a directory swap — assert the file case explicitly on Windows CI rather than assuming.

**Test strategy:** reconciliation against `memoryFileSystem` — added/unchanged/updated/renamed (same
`providerId`, different slug → one `renamed`, never `removed`+`added`)/transferred/archived/removed/
failed-with-retention. Conditional requests: second sync over an unchanged fixture issues
`If-None-Match` everywhere ETag-supported, gets `304`, and its `coreRequests` is **strictly lower** than
the first sync (asserted as a number, not a claim). Integrity: corrupt JSON → clean diagnostic + full
resync, not a crash; wrong `cacheVersion` → exit 2 naming both versions. Atomic write: stage three
files, inject a `rename` failure between the second and third, assert the live directory holds either
complete old or complete new bytes for every file, never partial — **run on Windows in CI**. Partial
failure end to end: 10 repos, 2 failing → exit 4; 8 successes written; 2 failures retain prior cache
bytes byte-for-byte; both named in `errors[]` with `subject: repository:<id>`.

**Exit:** an injected mid-commit `rename` failure leaves every live file holding either complete old or
complete new bytes, verified on `windows-latest` as well as `ubuntu-latest`; a second sync over
unchanged fixtures is byte-identical and reports strictly lower `coreRequests`; a slug change produces
one `renamed`, never `removed`/`added`; two syncs differing only in Search-derived closed counts report
`unchanged`; 2-of-10 repositories failing exits 4, leaves both failures' cache bytes unmodified, and
names both in `errors[]`.

---

## 8. Milestone 6 — Serializers and exports

**Files.** `src/serialization/canonical-json.ts` (extended), `canonical-yaml.ts`, `json-schema.ts`,
`documents.ts`. `src/services/export-service.ts`. `src/output/sync-report.ts`. `src/cache/raw-store.ts`
(optional, off by default). `tools/build-schemas.ts`. `tests/serialization/*.test.ts`,
`tests/serialization/golden.test.ts` (**the determinism home**), `tests/fixtures/golden/` (expected
bytes for all six documents from one fixed input cache), `tests/schemas/generated-drift.test.ts`.

**Key types:**

```ts
export function stringifyCanonical(value: JsonValue): string; // 2-space, LF, one trailing \n
export function sortKeysDeep(value: JsonValue): JsonValue;
export function buildProjectsJsonSchema(): JsonObject; // via z.toJSONSchema()

export interface OutputDocumentSet {
  readonly projectsJson: string;
  readonly projectsYaml: string | null;
  readonly statisticsJson: string;
  readonly summaryJson: string;
  readonly projectsSchemaJson: string;
  readonly syncReportJson: string;
}
export function buildOutputDocuments(input: {
  cache: CacheManifest;
  repositories: readonly Repository[];
  overrides: readonly PortfolioOverride[];
  report: SyncReport;
  formats: readonly OutputFormat[];
}): OutputDocumentSet;
```

**Decisions this milestone settles:**

- **Key sort order is plain `Array.prototype.sort()` on UTF-16 code units, never
  `localeCompare`** — `localeCompare` is ICU-dependent and can differ between a full-ICU and
  small-icu Node build, silently breaking cross-platform byte-stability.
- **YAML canonicalization sorts first with `sortKeysDeep`, then stringifies with pinned options**
  (`lineWidth: 0`, explicit key/string types) rather than trusting the `yaml` library's own
  `sortMapEntries` — the golden test is the tripwire if a future `yaml` bump changes quoting.
- **`z.toJSONSchema()` options: `target: 'draft-2020-12'`, `io: 'output'`, `unrepresentable: 'throw'`**
  (so an accidentally added `z.date()` fails the build, not the export), post-processed to inject a
  version-pathed `$id` and run through `stringifyCanonical`.
- **`schemas/projects.schema.json` (committed) and `output/projects.schema.json` (per-export) must be
  byte-identical**, checked by a drift test — `plugin.yaml`'s artifact `schemaRef` points at the
  committed one.
- **Every document is staged before any is renamed** — `ExportService` calls `stage` six times, then
  `commit` once; a mid-staging failure calls `discard`, leaving the previous complete output set
  untouched.

**Test strategy:** canonicalization — shuffled input key order yields identical bytes; Unicode/combining
characters survive; exactly one trailing `\n`, no `\r\n`. Golden tests: two independent runs of
`buildOutputDocuments` over one fixed cache produce identical strings, each equal to committed golden
bytes — this is "same function twice"; M8's container job covers "same process twice." Every produced
document validates against its generated schema via the ajv factory from §1.1 (reused deliberately).
Export failure: an injected `stage` failure on the fifth of six documents leaves the previous output
set byte-identical. Path confinement across every vector: `../etc`, `..\etc`, `/etc/passwd`,
`\\server\share`, `C:\secret`, **and a symlink inside the output directory pointing outside it** — the
one a regex cannot catch and `realpath` must.

**Exit:** two runs over one fixed cache produce byte-identical bytes for all six documents, none
containing a timestamp or run identifier; the committed schema equals freshly generated output, and a
`z.date()` addition fails the build; `projects.json`/`projects.yaml` parse to deeply equal values; an
injected staging failure on document five of six leaves the previous output set byte-identical; a
symlink pointing outside the output directory is refused.

---

## 9. Milestone 7 — Application services and CLI commands

Completes what M3.5 built minimally, adds `stats` and `export`, finishes the option surface.

**Files.** `src/commands/{stats,export}.ts` (new), `{sync,list,validate}.ts` (full option tables,
`--dry-run` honored). `src/commands/help.ts` (generated from option tables, cannot drift).
`src/services/sync-service.ts` (full: profiles, statistics, reconciliation, budget stop),
`{list,statistics,export,validation}-service.ts` (complete), `portfolio-service.ts` (load/merge
overrides by `providerId`). `src/output/render.ts` (all commands). `src/models/command-options.ts`.
`src/commands/outcome.ts` (the single exit-code mapping). `tools/build-schemas.ts` (extended: per-
command input/output schemas). `plugin.yaml` (declare `inputSchema`/`outputSchema` now they exist).
`tests/commands/*.test.ts`, `tests/e2e/*.test.ts` (the seven `BUILD-PLAN.md` scenarios),
`tests/help/help-matches-options.test.ts`. Docs: `docs/docs/reference/cli.md` "Implemented today"
columns become `Yes`; README options section.

**Key types:**

```ts
// Per-command option tables declare only their own extras — globals merge in via §1.6.
export const SYNC_OPTIONS = {
  profile: { type: 'string' },
  'no-cache': { type: 'boolean' },
  'include-forks': { type: 'boolean' },
} as const satisfies ParseArgsOptionsConfig;

export class SyncService {
  constructor(deps: {
    clock: Clock;
    logger: Logger;
    sleeper: Sleeper;
    configuration: ResolvedConfiguration;
    provider: RepositoryProvider;
    cache: CacheStore;
    staging: StagingArea;
  });
  run(options: SyncOptions, signal: AbortSignal): Promise<SyncOutcomeReport>;
}
```

**Exit-code mapping lives in exactly one place**, `src/commands/outcome.ts`: budget-stopped-with-
partial-results → `partial`/4; budget-stopped-with-nothing → `failed`/6; unauthenticated/forbidden →
`failed`/5; corrupt cache or export failure → `failed`/3; bad option/config → `failed`/2. One function
means the exit-code table is implemented once, not once per command.

`--dry-run` for `sync`: perform discovery and every read, compute the full change set, report it, stage
and commit **nothing** — assert zero `FileSystemPort` writes. For `export`: build every document in
memory, report sizes/digests, write nothing.

**Test strategy:** command-level with fake services (option parsing incl. the `--json`+`--output-format
text` conflict; text and JSON rendering; outcome-to-exit-code mapping for all seven codes). End-to-end
through the real service graph with the fetch stub and `memoryFileSystem`: the seven named scenarios —
success, invalid use, authentication failure, partial sync, rate limiting, corrupt cache, export
failure — each asserting exit code, envelope `status`, and non-empty `errors[]` where the schema
requires it. `--dry-run` for `sync`/`export` records zero writes. Full `validate → sync → list → stats →
export` flow in one test, asserting `artifacts[]` entries match `memoryFileSystem`'s files in both
`bytes` and `sha256`. **Help/documentation agreement test**: every option name in every `*_OPTIONS`
table must appear in generated help text, `docs/docs/reference/cli.md`, and the README, and vice versa —
the mechanical version of "help text and README match actual options."

**Exit:** every command's tests run with `memoryFileSystem` and the fetch stub, and removing network
access from the test environment changes nothing; all seven end-to-end scenarios produce their contract
exit code with a schema-valid envelope, none produces exit `1`; `sync --dry-run`/`export --dry-run`
record zero filesystem writes while still reporting the complete change set; every documented option
appears in a table and every table's option appears in the docs; each `artifacts[]` entry matches its
file in `bytes` and `sha256`.

---

## 10. Milestone 8 — Docker, documentation, release

**Files.** `Dockerfile` (config dir, cache/output dirs + ownership, OCI labels, corrected entrypoint).
`.dockerignore` (exclude `docs`, `tests`, `.git`, `*.md`, and local build/runtime output).
`.github/workflows/ci.yml` (the matrix) plus a new
`container` job. `.github/workflows/release.yml` (new: version-consistency check, `npm publish
--provenance`, image build and signing, GitHub Release with the tarball attached — §1.8).
`plugin.yaml` (the release workflow replaces the packaged copy's placeholder with the final
multi-platform digest; the checked-in source stays developmental). `package.json` (the rename to
`@subzerodev/plugins-github`, remove `private: true`, add `license`/`repository`/`bugs`/`homepage`/
`publishConfig`, the three `bin` entries, `files`, and `prepublishOnly` — all specified in §1.8).
`CHANGELOG.md` (first entry). `docs/docs/guide/{getting-started,configuration,troubleshooting}.md`
(updates/new — getting-started leads with `npx`/`npm install -g` alongside Docker; the configuration
guide documents `auth.allowGhCliTokenReuse` and its native-execution-only scope, §1.7).
`docs/docs/reference/{schemas,cli,contract-conformance}.md` (updates). `tests/container/smoke.test.ts`.
`tests/packaging/package-metadata.test.ts` (§1.8). `tests/fixtures/cache/seeded/` (a committed cache the
container `export` test mounts read-only). Plus the rename touchpoints and new ADR from §1.8.

**Dockerfile changes:**

1. `RUN mkdir -p /etc/subzerodev` so a read-only config bind mount has a mount point; the app must
   never `mkdir` beside the config or treat an absent config as an error.
2. `RUN mkdir -p /var/lib/subzerodev/{cache,output} && chown -R 10001:10001 /var/lib/subzerodev`, plus
   `ENV SUBZERODEV_PLUGIN_CACHE=... SUBZERODEV_PLUGIN_OUTPUT=...`. **No `VOLUME`** — creates anonymous
   volumes and fights a `--user` override.
3. Staging (M5) already lives under cache/output, so nothing writes to `/app` or `/tmp` — assert with
   `--read-only`, don't assume.
4. **OCI labels** (`org.opencontainers.image.{title,version,source,revision,licenses,description}` +
   `com.subzerodev.plugin.id`), currently absent and required for the manifest-check's "labels match
   the declared id/version" assertion.
5. Keep `ENTRYPOINT ["node","dist/cli.js"]`; the manifest was already corrected to match (§1.5) rather
   than adding a symlink for a cosmetic binary name.
6. Build-stage assertion that `dist/plugin.manifest.json` exists, so a broken generator fails the image
   build rather than the runtime check.

**New `container` CI job:**

| Step | Assertion                                                                                                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `docker run --rm --network none <img> manifest` → exit 0, one JSON doc, validates, labels match                                                                                                                |
| 2    | `--help`/`--version` → 0, version equals manifest                                                                                                                                                              |
| 3    | unknown command → exit 2                                                                                                                                                                                       |
| 4    | `--user 10001:10001`, `id -u` ≠ 0                                                                                                                                                                              |
| 5    | `--read-only`, config mounted `:ro`, cache/output writable; `validate` → single-doc stdout; exit 5 with no token; a canary token reaches the network-disabled connectivity check, exits 3, and appears nowhere |
| 6    | `export --json` twice against a **read-only seeded cache**, comparing artifact bytes/digests                                                                                                                   |
| 7    | `GITHUB_TOKEN=<canary>` run; grep stdout/stderr/output/cache; `docker save \| tar -xO \| grep -c <canary>` = 0                                                                                                 |

Step 6 is deliberate: a fixture-backed `sync` can't run in-container without a network fake, and adding
a `--fixture-dir` seam to production code to enable a test is a smell. `export` reads **only** the
cache, so mounting a committed seeded cache read-only gives a real in-container determinism check with
no network and no production-code seam. The fixture-backed `validate` and `sync` flow runs natively in
the matrix job; successful validation therefore needs no test-only container behavior.

**Do not block M8 on the shared conformance suite** — it doesn't exist anywhere in the ecosystem yet.
Implement C1–C9 as this repo's own container-job assertions, structured to be liftable into a shared
runner later, and state in `docs/docs/reference/contract-conformance.md` which checks are locally
asserted versus awaiting the shared suite. Reporting a local assertion as a suite pass would be the
"skips rendered as green" failure the contract itself names.

**Exit:** `manifest` runs with `--network none`, no mounts, no env vars, exits 0 with a schema-valid
single-document stdout whose `id`/`version` equal the image labels; `validate` runs `--read-only` with
a `:ro` config mount without writing outside cache/output, `id -u` is never 0; two `export` runs against
the seeded cache produce byte-identical artifacts and digests; a canary token appears nowhere,
including `docker save` output; `npm run check` is green on `windows-latest` and `ubuntu-latest`;
`package.json` no longer carries `private: true` and declares `license`/`repository`; the conformance
page distinguishes locally asserted checks from shared-suite results; plus every §1.8 packaging exit
criterion — the tarball contents assertion, the four-way version-consistency check, and a verified
zero-configuration `npx @subzerodev/plugins-github --help`.

---

## 11. Existing documents to update

| Document                                                                                                                                                                            | Change                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUILD-PLAN.md`                                                                                                                                                                     | Correct the "Current state" section — no CI matrix exists yet, no container job, no PR #11 in this repo's history; correct M8's premise; add a **Deferred** section — organization/contributed repositories, historical cache snapshots, per-repository output files, the shared conformance runner — each with a reversal condition. (`gh auth token` reuse is no longer deferred — see §1.7 — so it does **not** belong in this list.) |
| `AGENTS.md`                                                                                                                                                                         | Add `src/logging/` and `tools/` to the repository-layout block (new top-level directories this plan introduces)                                                                                                                                                                                                                                                                                                                          |
| `docs/docs/reference/specification.md`                                                                                                                                              | Correct the request budget after M3.5's live observation; document the largest-remainder rounding rule and the `compareIdentity` total order                                                                                                                                                                                                                                                                                             |
| `docs/docs/reference/cli.md`                                                                                                                                                        | "Implemented today" columns updated milestone by milestone                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/docs/reference/contract-conformance.md`                                                                                                                                       | Refreshed per milestone; separates locally-asserted from shared-suite results                                                                                                                                                                                                                                                                                                                                                            |
| `docs/docs/decisions/adr-003-request-wrapper-and-http-testing.md`                                                                                                                   | **Written, 2026-07-30.** Records rejecting `@octokit/plugin-throttling`, `@octokit/plugin-retry`, `p-limit`, `msw`, and `nock` (§1.2, §1.3), including the all-GETs argument for hand-rolled retry safety — and, going beyond what this row anticipated, the removal of `@octokit/rest` itself, which supersedes §1.2's and §1.3's treatment of it                                                                                       |
| New: `docs/docs/decisions/adr-004-package-naming-and-distribution.md`                                                                                                               | Records the rename to `@subzerodev/plugins-github`, npmjs.com over GitHub Packages (the anonymous-read constraint), the third `bin` entry's purpose, and the upstream follow-up to correct the contract's name-mapping example (§1.8)                                                                                                                                                                                                    |
| `docs/docs/reference/specification.md` (identity table), `AGENTS.md` (Naming section), `docs/docs/decisions/adr-001-hosting-and-versioning.md` (a new dated amendment, not an edit) | The `@subzerodev/plugin-github` → `@subzerodev/plugins-github` rename touchpoints (§1.8)                                                                                                                                                                                                                                                                                                                                                 |

## 12. PR sequence

| PR  | Content                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | M1 domain schemas and fixtures **+ the M0 CI-matrix remediation**                                                                                                                                        |
| 3   | M2 ports, configuration, secret safety **+ vendored `schemas/contract/` and `tests/contract/ajv.ts`**                                                                                                    |
| 4   | M3 adapter, discovery, request wrapper, rate limits, `gh auth` credential-file reuse **+ ADR-003**                                                                                                       |
| 5   | M3.5 first runnable slice: `plugin.yaml`, `manifest`, envelope, two-stage parser, `cli.ts` rewrite (consider splitting: manifest+envelope+parser, then the three commands, if review bandwidth is tight) |
| 6   | M4 metadata, statistics, profiles                                                                                                                                                                        |
| 7   | M5 cache and atomic synchronization                                                                                                                                                                      |
| 8   | M6 serializers, exports, golden tests                                                                                                                                                                    |
| 9   | M7 CLI completion and wiring                                                                                                                                                                             |
| 10  | M8 Docker, container job, docs, conformance, release                                                                                                                                                     |

## Verification

Each PR's own exit criteria (stated per milestone above) are the primary verification, run via:

```bash
npm run check
```

covering format, lint, typecheck, tests (with coverage once M1 lands `@vitest/coverage-v8`), and build.
Milestone-specific additions:

- **M1–M2:** `npx vitest run tests/models tests/configuration tests/logging` in isolation is sufficient
  to verify without touching later milestones.
- **M3, M4:** run with `SUBZERODEV_LIVE_TEST` unset (default) so the live-account test stays skipped;
  confirm it's reported as skipped, not silently absent.
- **M3.5, M6:** `tests/contract/*.test.ts` and `tests/serialization/golden.test.ts` must pass — these
  are the two places a contract or determinism regression would otherwise go unnoticed.
- **M5:** the atomic-write and reconciliation suites must be confirmed green on **both**
  `ubuntu-latest` and `windows-latest` in CI — this is the one property that cannot be verified on a
  single platform.
- **M8:** the new `container` job's seven steps (§10, Milestone 8) are the actual release gate; run them locally via
  `docker build` + the step commands before opening the PR, since CI is the only place `--network none`
  and `docker save` inspection are practical to script.
- **Throughout:** `pwsh ./build/Test-Documentation.ps1` after any docs change, and `git diff --check`
  before each PR, per `AGENTS.md`'s existing completion checklist.
- **M3.5's real-account run** cannot be verified by CI or by an agent without one — it requires a human
  with a GitHub account and token to execute `validate → sync → list` and report the observed request
  counts back into the PR.
