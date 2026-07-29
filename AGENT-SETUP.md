# Generic Repository Setup Agent

## How to use this file

Copy this file to the root of a repository and give the agent one instruction:

> Execute `AGENT-SETUP.md` for `REPOSITORY_NAME`.

Replace `REPOSITORY_NAME` with the exact GitHub repository name. That is the
only required input. The agent must inspect the repository, derive project
details from its contents, apply the defaults below, perform the work, and
verify the result.

This is a bootstrap controller, not permanent project guidance. Do not copy it
verbatim into the final `AGENTS.md` or generated documentation. A repository
that maintains this reusable template may commit it; consumer repositories
should normally keep their copied controller local unless the user asks
otherwise.

## Default policy

Apply these defaults without asking the user to repeat them:

| Decision             | Default                                                             |
| -------------------- | ------------------------------------------------------------------- |
| GitHub owner         | Existing remote owner; otherwise the authenticated `gh` account     |
| Visibility           | Public for a new remote; preserve an existing remote's visibility   |
| Default branch       | `main`                                                              |
| License              | MIT for a new unlicensed repository; preserve an existing license   |
| Documentation        | Generate it from the repository's real source and behavior          |
| Site root            | README-derived homepage                                             |
| Documentation route  | `/docs/`                                                            |
| Documentation engine | The shared Docusaurus template described below                      |
| Pull request         | Draft first; make ready and merge after every required check passes |
| Merge method         | Squash unless repository policy requires another method             |
| Branch protection    | Required PRs and successful application/documentation checks        |

Derive the project title, description, runtime, commands, architecture, and
documentation topics from the repository. Never invent functionality or claim
that unfinished behavior works.

For repositories in the SubZeroDev ecosystem, prefer the established custom
domain convention when DNS authorization is available:

1. Remove a leading `SubZeroDev.` from the repository name.
2. Convert the remainder to lowercase.
3. Replace runs of dots, underscores, spaces, and other non-alphanumeric
   characters with one hyphen.
4. Trim leading and trailing hyphens.
5. Append `.subzerodev.com`.

For example, `SubZeroDev.Example.Tool` becomes
`example-tool.subzerodev.com`. Preserve an already established hostname. If no
custom-domain convention or DNS authorization is available, use the normal
GitHub Pages URL instead of blocking the entire setup.

## Execution authority

The user's instruction to execute this file authorizes the agent to perform the
following work for the named repository:

- inspect and modify local repository files;
- initialize Git when needed;
- create focused commits;
- create a new public GitHub repository when no remote exists;
- add an MIT license when no license exists;
- push the initial branch and subsequent setup branch;
- create and update a pull request;
- enable and configure GitHub Pages;
- create or update the derived documentation DNS record when suitable
  credentials are already available;
- configure repository metadata and branch protection;
- make the pull request ready and merge it after required checks pass;
- synchronize local `main`;
- verify CI, deployment, and representative public routes.

This authorization is limited to the named repository and its derived
documentation hostname. It does not authorize deleting an existing repository,
rewriting published history, deleting branches, replacing unrelated DNS
records, publishing packages, changing companion repositories, exposing
secrets, or discarding user work.

Stop and ask one concise question only when discovery cannot safely resolve a
material conflict, such as:

- more than one plausible GitHub owner with no existing remote;
- the requested remote name already belongs to an unrelated project;
- overlapping uncommitted user changes cannot be preserved;
- an existing license conflicts with the MIT default;
- an existing documentation system has an incompatible ownership model;
- a required custom domain conflicts with an existing DNS record.

Missing optional tooling is not automatically a blocker. Use a safe supported
fallback and report it.

## Non-negotiable operating rules

- Inspect before editing.
- Read every applicable instruction file completely.
- Preserve user work and unrelated changes.
- Discover files, commands, and ownership boundaries; do not assume them.
- Prefer the repository's established tooling and conventions.
- Keep authoritative behavior in the layer that owns it.
- Keep generated files reproducible from their declared sources.
- Use immutable digests in privileged documentation builds.
- Never expose credentials in commands, logs, files, commits, or messages.
- Do not claim a check, deployment, setting, or route succeeded until verified.
- Do not weaken validation merely to make a check pass.
- Do not edit generated documentation pages directly.
- Do not create duplicate documentation projects or duplicate CI workflows.
- Do not silently replace an existing public route.

## Phase 1: Inspect and understand

Start with read-only checks. Adapt command syntax to the active shell.

```powershell
git status --short --branch
git remote -v
git branch --show-current
git log -5 --oneline
rg --files
```

If the directory is not yet a Git repository, record that and continue with a
filesystem inventory before initializing it.

Discover guidance rather than assuming filenames:

```powershell
rg --files -g 'AGENTS.md' -g 'CLAUDE.md' -g '*agent*.md' -g 'README.md' -g '*.md'
```

Read, in applicable precedence order:

1. environment and workspace instructions;
2. every `AGENTS.md` from the workspace root to the current directory;
3. repository-specific instruction files;
4. `README.md`;
5. architecture, design, specification, and roadmap documents;
6. existing documentation and workflow guidance.

Inventory:

- Git state, current branch, remotes, tags, and uncommitted changes;
- source directories, manifests, lock files, toolchain versions, and entry
  points;
- build, formatting, lint, type-check, test, package, and smoke-test commands;
- README, license, ignore files, editor settings, agent guidance, and
  contribution policy;
- existing docs, published URLs, redirects, Pages settings, DNS, workflows,
  environments, and required checks;
- companion repositories and clear ownership boundaries;
- generated, vendored, cache, build, secret, and local-only files.

Inspect GitHub authentication without printing tokens:

```powershell
gh auth status
gh api user --jq '.login'
```

If a remote exists, treat its repository identity as authoritative unless it
plainly conflicts with the user's supplied name. If no remote exists, use the
authenticated account as owner.

Before staging anything, scan filenames and diffs for credentials, private
keys, `.env` files, tokens, generated output, caches, and local configuration.

## Phase 2: Establish project truth

Build a concise internal project model from evidence:

- what the project is and who it serves;
- what this repository owns;
- what belongs to another repository, package, service, or specification;
- what currently works;
- what is intentionally incomplete;
- supported runtimes and platforms;
- installation, usage, development, validation, and release commands;
- public API, CLI, configuration, storage, and serialization boundaries;
- published documentation and compatibility obligations.

When source and prose disagree, verify behavior through code and tests, then
make the public documentation honest. Do not silently change product behavior
to match stale prose unless implementation is part of the user's request.

For external specifications, use their published repository or site URL.
Never create relative links that traverse into a sibling local checkout.

Before the first repository edit, create the focused setup branch when Git and
a baseline commit already exist. If Git does not exist yet, make only the
carefully inspected baseline changes in Phase 3, then initialize and branch as
described in Phase 4.

## Phase 3: Create the repository baseline

Create or improve the following only after inspecting existing versions.

### `README.md`

Write a useful project homepage based on the repository itself. Include only
sections supported by evidence:

- project identity and short value statement;
- current implementation status;
- installation and prerequisites;
- smallest working usage example;
- CLI or API overview;
- development and validation commands;
- architecture or ownership boundary;
- links to complete published documentation;
- license.

Use absolute published URLs in the README because it renders on GitHub as well
as on the documentation site. The homepage generator will rewrite the site
origin when rendering the README at the site root.

### `AGENTS.md`

Create one conventional, repository-specific instruction file. Merge relevant
standing guidance from existing agent files without erasing stricter
instructions or repository knowledge.

It should record:

- project identity and ownership boundary;
- safe-start inspection steps;
- real repository layout;
- architecture rules;
- generated-file ownership;
- documentation layout, routes, source files, and regeneration commands;
- exact development and validation commands;
- Git and pull-request policy;
- completion checklist.

Do not include this bootstrap's historical narrative, generic questions, or
one-time GitHub creation steps in the final `AGENTS.md`. Consolidate clearly
superseded agent files only when all useful content has been preserved.

### Repository hygiene

Create or update:

- `.gitignore` for the detected language, editor, OS, secrets, dependencies,
  caches, coverage, build products, docs artifacts, and local runtime data;
- `.gitattributes` with normalized text handling and explicit binary patterns;
- `.editorconfig` with UTF-8, final newlines, and project-appropriate
  indentation;
- `LICENSE` with the standard MIT text when no license exists.

Do not ignore dependency lock files that should be reproducible. Do not replace
an existing license or legal notice.

Create application CI only when it is absent. Base it on the repository's real
toolchain and lock file, pin supported runtime versions, and run the same
formatting, lint, type-check, test, build, and smoke checks developers run
locally. Do not create empty or cosmetic checks.

## Phase 4: Initialize or prepare Git

If Git is absent:

1. Create the ignore and hygiene files before staging.
2. Run `git init -b main`.
3. Add `AGENT-SETUP.md` to `.git/info/exclude` so the portable controller
   remains local and uncommitted in a consumer repository.
4. Review every candidate file and scan for secrets.
5. Stage the existing project plus its inspected README, hygiene, license, and
   repository guidance. Leave documentation-site and workflow delivery changes
   for the setup branch.
6. Create a scoped baseline commit on `main`.
7. Create the focused setup branch before installing documentation or adding
   delivery workflows.

If Git already exists:

1. Preserve its history and default branch.
2. Keep unrelated worktree changes untouched.
3. Add `AGENT-SETUP.md` to `.git/info/exclude` if it is an untracked consumer
   copy.
4. Confirm that the focused setup branch was created before the first edit. Use
   the branch prefix required by the active environment or repository;
   otherwise use `agent/repository-setup`.

If no GitHub remote exists:

1. Confirm the exact owner from the authenticated account.
2. Check that `OWNER/REPOSITORY_NAME` does not already contain unrelated work.
3. Create the public repository without auto-generated files that would
   conflict with the local tree.
4. Set its description from the verified README summary.
5. Set the default branch to `main`.
6. Push the baseline `main`, then push the setup branch.

If a remote exists, fetch it and reconcile by fast-forward or an ordinary
merge. Never force-push or replace remote history.

## Phase 5: Install documentation

Generate documentation by default, but inspect and preserve any existing
documentation system first. If it already has an authoritative supported
toolchain, improve it in place rather than installing a competing project.

For the shared SubZeroDev documentation system, the authoritative template is:

<https://github.com/The-Running-Dev/Docusaurus-Template>

Before every new install or upgrade:

1. Inspect the current template repository and read its `AGENTS.md`,
   installation guide, installer help, and consumer instructions completely.
2. Inspect the currently published container digest.
3. Construct an immutable image reference:
   `ghcr.io/the-running-dev/docs-template@sha256:...`.
4. Dry-run the current installer.
5. Review every proposed create, replace, move, and delete operation.
6. Run the installer through its supported interface.

Do not copy example digests from this file. Resolve the current digest, for
example with:

```powershell
docker buildx imagetools inspect ghcr.io/the-running-dev/docs-template:latest
```

Use the template's current `Invoke-SetupDocs` command. For the route contract in
this playbook, pass:

```text
-ProjectDir /work
-Title <derived title>
-Description <verified one-line description>
-SiteUrl <published site origin>
-RouteBasePath docs
-BaseImage <immutable image reference>
```

Run once with `-WhatIf`, then perform the install. Use `-Overwrite` only after
reviewing an existing installation and confirming that repository-owned
content will be preserved. On Linux, run the container as the current host UID
and GID so it does not create root-owned files. On Windows and macOS, use the
mount conventions supported by Docker Desktop.

The supported default consumer layout is:

```text
README.md
  └── generated site root: docs/src/pages/index.md

docs/
├── docs/
│   ├── index.md             generated /docs/ landing page
│   └── *.md                 authored documentation
├── src/
│   └── pages/
│       └── index.md         generated README homepage
├── docusaurus.config.ts
├── sidebar.ts
├── Dockerfile
└── .dockerignore

docs.ps1
build/
├── ConvertTo-DocumentationHomepage.ps1
└── Test-Documentation.ps1
.config/
└── DocumentationRules.psd1
.github/workflows/
├── docs-ci.yml
└── docs-deploy.yml
```

The installer supports a different single-segment docs directory, but use
`docs/` unless the repository already has a justified established layout. Do
not recreate the template's overlay, generated-page, or workflow behavior by
hand.

### Required route contract

For a custom domain:

```typescript
url: 'https://project.example.com',
baseUrl: '/',
routeBasePath: 'docs'
```

This produces:

| Public route | Source                                                 |
| ------------ | ------------------------------------------------------ |
| `/`          | `README.md`, generated into `docs/src/pages/index.md`  |
| `/docs/`     | Generated minimal landing page at `docs/docs/index.md` |
| `/docs/**`   | Authored pages under `docs/docs/**`                    |

The navbar brand must link to `/`. The Docs item must link to the docs sidebar
at `/docs/`. The README content must appear once, at the site root.

For a GitHub Pages project site without a custom domain, use:

```typescript
url: 'https://OWNER.github.io',
baseUrl: '/REPOSITORY_NAME/',
routeBasePath: 'docs'
```

In that case the same logical routes live below `/REPOSITORY_NAME/`. Never use
`/<repository>/` as `baseUrl` for a custom domain served from its own root.

### Authored documentation

Generate pages from actual repository content, choosing only topics that
materially apply:

- getting started;
- usage, CLI, or API reference;
- configuration;
- architecture and ownership boundaries;
- development and testing;
- deployment or operations;
- troubleshooting;
- license and attribution.

Use clear front matter and deterministic reading order. Prefer autogenerated
navigation with `sidebar_position` when supported by the template. Verify every
command, option, default, code example, filename, link, and claim.

Do not edit either generated index directly. After changing `README.md`, run:

```powershell
./docs.ps1 -BuildOnly
```

Commit whichever generated homepage file changed. Then run:

```powershell
./build/Test-Documentation.ps1
```

Keep strict broken-link and broken-anchor handling enabled. Customize
terminology rules for the actual project and remove irrelevant
product-specific rules.

### Image pinning and deployment safety

The same immutable documentation image must appear in all installer-owned
references, normally:

1. `docs/Dockerfile`;
2. `docs.ps1`;
3. `.github/workflows/docs-ci.yml`;
4. `.github/workflows/docs-deploy.yml`.

Update all references together. The deploy workflow must run repository
documentation validation before building, packaging, and deploying Pages.

Do not require the deployment job as a pull-request status check because it
runs only after merge. Require the two template PR checks by their actual
reported names:

```text
Documentation links and terminology
Verify Documentation Build
```

If the application has its own CI, require its real check name too.

### Existing public documentation

Before moving or renaming published pages:

1. inventory existing public URLs;
2. map each old route to its new route;
3. add supported static redirects or compatibility pages;
4. test both old and new URLs;
5. remove compatibility only through a separately approved breaking change.

## Phase 6: Configure GitHub Pages and the domain

Configure Pages to deploy from GitHub Actions.

For a custom SubZeroDev subdomain:

1. Derive the hostname using the rule above.
2. Inspect existing DNS before writing.
3. If the name is unused or already belongs to this repository, point it to the
   authenticated account's GitHub Pages host using the established DNS
   convention.
4. Configure that exact custom domain in the repository's Pages settings.
5. Wait for DNS and certificate provisioning.
6. Enable HTTPS when GitHub reports it is available.

Never replace a DNS record that appears to belong to another service. If DNS
credentials are unavailable, deploy to the GitHub Pages project URL and report
the optional custom-domain follow-up.

Do not add a checked-in `CNAME` file unless the current deployment system
specifically requires one.

## Phase 7: Validate locally

Run the repository's complete real validation suite. At minimum:

- formatter or formatting check;
- linter;
- type checker or compiler;
- automated tests;
- production application build;
- representative CLI/API smoke test;
- documentation link, anchor, terminology, and generated-file gate;
- production documentation build;
- `git diff --check`;
- final `git status --short --branch`.

Prefer clean dependency installation from the lock file. Do not report a
production docs build as successful when Docker or another required tool was
unavailable; rely on CI for that check and say so explicitly.

Review the final diff for:

- accidental user-file changes;
- secrets;
- placeholders;
- stale repository names, hostnames, paths, or commands;
- duplicated README content;
- mutable `:latest` image references in installed project configuration;
- inconsistent image digests;
- broken old routes;
- unsupported or unimplemented claims.

## Phase 8: Deliver through GitHub

1. Work on a focused setup branch.
2. Stage only intended paths.
3. Commit with a concise outcome-focused message.
4. Push the branch.
5. Open a draft pull request summarizing repository setup, generated
   documentation, routes, governance, and validation.
6. Wait for all pull-request checks.
7. Inspect failures and review feedback; fix actionable issues without
   weakening safeguards.
8. Make the pull request ready when the implementation and description match.
9. Configure branch protection using check names that have actually reported.
10. Require pull requests, required checks, and conversation resolution; block
    force pushes and branch deletion.
11. Merge only after every required check passes.

Do not reply to or resolve human review threads unless that interaction is
within the user's authorization or required to complete this explicitly
authorized delivery.

## Phase 9: Synchronize and verify production

After merge:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git status --short --branch
git log -3 --oneline
```

Verify the merge-triggered application CI, documentation CI, and documentation
deployment runs. Then verify:

- the repository is reachable with the intended visibility;
- metadata, default branch, license, Pages source, and branch protection are
  correct;
- HTTP redirects to HTTPS where expected;
- the site root returns success and contains recognizable README content;
- the navbar brand targets the site root;
- the Docs navbar item targets `/docs/`;
- `/docs/` returns success without duplicating the full README;
- at least two representative documentation routes return success;
- an intentionally retired route redirects or returns the expected status;
- local `main` is clean and matches `origin/main`.

Use retries for DNS, certificate, and Pages propagation, but do not wait
silently for more than a minute at a time. Report a deployment as pending when
the external system remains non-terminal.

## Final report

Return a concise, evidence-based handoff containing:

- GitHub repository URL;
- public site and docs URLs;
- pull request and merge commit;
- files and systems added or changed;
- application and documentation checks that passed;
- Pages, DNS, HTTPS, and branch-protection status;
- representative verified routes;
- any honest limitation or optional follow-up.

Do not include internal narration or claim success based only on configuration.

## Completion checklist

- [ ] Repository name used exactly.
- [ ] Existing instructions and worktree inspected.
- [ ] User changes preserved.
- [ ] Project identity and ownership boundaries derived from evidence.
- [ ] README is accurate and useful.
- [ ] One repository-specific `AGENTS.md` contains standing guidance.
- [ ] Ignore, attributes, editor, license, and application CI are appropriate.
- [ ] No secrets, build products, caches, or local consumer copy committed.
- [ ] Git and GitHub repository state are correct.
- [ ] Documentation generated from the repository rather than placeholders.
- [ ] Shared template inspected and installed through its supported interface.
- [ ] README owns the site root and Docs owns `/docs/`.
- [ ] Custom-domain `url`, `baseUrl`, and `routeBasePath` are correct.
- [ ] Generated pages were regenerated rather than edited.
- [ ] Documentation image is pinned consistently by immutable digest.
- [ ] Documentation validation runs before deployment.
- [ ] Application and documentation checks pass.
- [ ] Required checks and branch protection use real reported check names.
- [ ] Pull request merged only after required checks passed.
- [ ] Local `main` synchronized and clean.
- [ ] Merge-triggered deployment succeeded.
- [ ] Root, docs landing, and representative routes verified publicly.
