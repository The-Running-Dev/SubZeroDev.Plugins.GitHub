# Repository Bootstrap and Documentation Delivery Playbook

## Purpose

Use this playbook to initialize or improve a repository and, when approved,
deliver a documentation site. It is intentionally repository-neutral: replace
placeholders only after the repository owner has made the relevant decisions.

This is an execution guide, not authorization for external writes. Creating a
remote repository, pushing, opening or merging pull requests, changing a
domain, and deploying require explicit user authorization.

## 1. Inspect before editing

Begin with read-only discovery:

```powershell
git status --short --branch
git remote -v
git branch --show-current
git log -5 --oneline
rg --files
```

Determine whether the directory is already a Git repository; whether it has
user changes; which remotes and branch exist; and whether it already has a
README, license, hygiene files, workflows, documentation tooling, or guidance.

Never assume a particular guidance filename exists. Discover relevant files
first, then read those that are present:

```powershell
rg --files `
  -g 'AGENTS.md' `
  -g 'CLAUDE.md' `
  -g 'agent*.md' `
  -g 'README.md' `
  -g '*.md'
```

If a documentation navigation manifest exists, use it to establish reading
order. Otherwise, read the documents relevant to the requested work. Preserve
existing user changes and never overwrite guidance, ignore files, workflows, or
documentation without first inspecting them.

## 2. Decisions that need approval

Ask for material decisions before batching structural changes:

1. Repository identity, owner, visibility, default branch, and license.
2. The project's ownership boundary and related repositories or services.
3. Whether a documentation site is wanted at all.
4. If so, the documentation information architecture, supported tooling,
   public routes, hosting origin, custom domain, and legacy-route requirements.
5. Contribution guidance and the repository's standing-guidance and
   lessons-learned file conventions.

Do not infer approval to initialize Git, create a remote repository, publish,
or deploy merely because those choices were discussed.

## 3. Establish a repository baseline

Only create missing hygiene files, preserving existing rules:

- `.gitignore` for dependencies, build output, caches, environment files, logs,
  temporary files, and project-specific generated data.
- `.gitattributes` for text normalization and binary assets.
- `.editorconfig` for encoding, line endings, final newlines, and indentation.
- A README with project identity, status, scope, setup, validation, and links.
- Repository-specific standing guidance and, when useful, a separate
  lessons-learned file. Use the names already established by the repository.

For a new local Git repository, after approval:

```powershell
git init -b main
git add .
git diff --cached --check
git commit -m "Initialize repository"
```

Create or connect a remote only with explicit authorization. Do not create a
second remote README, ignore file, or license when importing an existing local
commit.

## 4. Documentation sites: conditional workflow

Apply this section only when the owner has approved a published documentation
site. First inspect the repository's existing documentation system. If using a
shared template or installer, read its current instructions and source before
customizing it; use its supported consumer layout and avoid rebuilding template
behavior in consumer workflows.

For a Docusaurus template that supports a `docs/` consumer project and a
`docs/docs/` authored root, keep these ownership boundaries:

```text
README.md                 authored source for the public homepage, if chosen
docs/src/pages/index.md   generated output for /
docs/docs/index.md        authored landing page for /docs/
docs/docs/**              authored documentation pages
docs/sidebar.ts           declared documentation navigation order
```

Do not publish the README twice. Do not edit generated pages directly; edit the
declared source and regenerate the output. Update all links and heading anchors
when moving pages, and preserve previously published routes with redirects when
required.

### Domain configuration

For a custom subdomain such as `https://docs.example.com`, Docusaurus uses:

```ts
url: 'https://docs.example.com',
baseUrl: '/',
```

Use a repository subpath such as `'/repository/'` only when the site is
actually served under that path (for example, a GitHub project site without a
custom domain). The configured `url` and `baseUrl` must match the final public
origin and path.

### Container and workflow integrity

When a documentation image is used in CI or deployment, pin it by immutable
digest. Keep every reference synchronized across the Dockerfile, runner, CI,
and deploy workflow. The deployment workflow must run the same validation gate
before building, uploading, or publishing artifacts; a separate CI workflow
does not by itself gate deployment.

## 5. Validation and delivery

Run the repository's documented validation commands and:

```powershell
git diff --check
git status --short --branch
```

For a documentation site, also run its Markdown/generated-file validation and
the documented production-equivalent build. Do not report CI, deployment, or
public-route success until it has been verified.

If pull-request work is authorized, inspect both actionable comments and review
thread state. Do not reply to or resolve review threads without authorization.
After an authorized merge, fast-forward the local default branch, check the
merge-triggered workflows, and verify the relevant public routes.

## 6. Completion checklist

- [ ] Repository inspected; existing guidance read.
- [ ] User changes preserved.
- [ ] Material ownership, identity, and documentation decisions approved.
- [ ] Hygiene files and README created or updated without replacing valid rules.
- [ ] Remote, push, PR, merge, deployment, and domain actions separately
      authorized before execution.
- [ ] Documentation work performed only when approved and using supported
      tooling/layout.
- [ ] Generated documentation has a declared source and was regenerated.
- [ ] Domain `url` and `baseUrl` match the actual hosting arrangement.
- [ ] Validation, production-equivalent build, and `git diff --check` pass.
- [ ] CI, deployment, and published routes are reported only after confirmation.
