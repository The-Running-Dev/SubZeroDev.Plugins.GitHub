---
title: Where the implementation stands
description: This plugin's actual state against the implementation plan's milestones and the contract's conformance checks.
sidebar_position: 3
---

# Where the implementation stands

This page is deliberately honest about the gap between what the
[GitHub plugin specification](./specification.md) and the plugin contract require, and what exists
in `src/` today. It exists so "use the GitHub plugin as a template" does not imply more is finished
than actually is.

The milestone spine referenced below is the one in
[`IMPLEMENTATION-PLAN.md`](https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub/blob/main/IMPLEMENTATION-PLAN.md),
which holds this repository's concrete architecture for Milestones 1–8.
[`BUILD-PLAN.md`](https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub/blob/main/BUILD-PLAN.md)
owns the milestone numbering and exit criteria and numbers them more finely, which is why the mapping
below is approximate.

A generic, reusable version of this spine — usable by a Node, Python, .NET, or PowerShell plugin — belongs
to `SubZeroDev.PluginContract` once that repository is split out. It is not reachable from here today, and
nothing in this repository depends on it.

## Against the spine

| Spine milestone                        | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — Ground and the contract surface   | **Partial.** The toolchain, layout, exit-code wiring, `plugin.yaml`, and the canonical `manifest` command exist. The result-envelope builder exists but commands do not emit it yet; the Windows matrix exists, while the container job remains a later deliverable.                                                                                                                                                                                                                                                                                                    |
| M1 — Configuration, inputs, `validate` | **Not started.** No configuration loader exists; `validate` is a placeholder that exits `3`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| M2 — The local/offline half            | **Not started.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M3 — Plan store and approval gate      | **Skipped by design.** This plugin only reads GitHub and writes its own cache and output; it declares no write capability against an external system, so the plan-apply gate does not apply to it.                                                                                                                                                                                                                                                                                                                                                                      |
| M4a — Remote read adapter              | **Partial.** The read adapter exists: an authenticated connectivity check, paginated owned-repository discovery with filters, mapping into the domain model, and a request wrapper that classifies errors, counts rate-limit buckets, and retries `5xx` and network failures. Requests go through `fetch`, not Octokit, which is no longer a dependency ([ADR-003](../decisions/adr-003-request-wrapper-and-http-testing.md)). Per-repository metadata collection and statistics are not implemented; `collect` returns discovery metadata plus a diagnostic saying so. |
| M4b — `plan`                           | **Skipped**, per M3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| M5 — `apply`                           | **Skipped**, per M3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| M6 — Live round-trip verification      | **Not started.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M7 — Conformance, signing, release     | **Not started.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Against the contract's conformance checks

None of C1–C9 have been run, because the artifacts they check do not exist yet — there is no
conformance runner in this repository, and the suite itself (`SubZeroDev.PluginContract` work package
W2.1) is specified but not implemented anywhere in the ecosystem yet. Listed here as a concrete
checklist for Milestone 7, not as results:

| Check                             | What it needs, that is currently missing                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| C1 — Manifest in a bare container | `plugin.yaml` and a byte-identical `manifest` command exist; the network-isolated container check is still pending |
| C1b — Attestation agreement       | No signed manifest attestation                                                                                     |
| C2 — Universal commands           | `--help`, `--version`, and `manifest` pass today; an unknown command correctly exits `2`                           |
| C3 — Output channel purity        | No command yet supports `--output-format json`; the result-envelope builder is unit-tested                         |
| C3b — Envelope invariants         | The builder enforces timestamp ordering and the data-size cap; command wiring is pending                           |
| C4 — Declared artifacts           | The manifest exists but declares no output artifacts yet                                                           |
| C5 — Exit codes                   | `0`, `2`, `3` are produced; `4`, `5`, `6`, `124`, `130` are not yet reachable                                      |
| C6 — Secret canary                | No secret-handling path exists yet to leak from                                                                    |
| C7 — Container hygiene            | The image already runs non-root (UID 10001); a read-only config mount is untested                                  |
| C8 — Determinism                  | No artifacts are produced yet to compare                                                                           |
| C9 — Path confinement             | No artifact-writing path exists yet to test                                                                        |

## Gaps visible in the repository today

- `src/cache/` remains a placeholder; command, configuration, output, serialization, service, and
  GitHub provider layers now have the portions completed through Milestone 3.5a.
- `cli.ts` returns `0` for `--help`, `--version`, and `manifest`; the five work commands still return
  `3`.
- `package.json` has no `license` or `repository` field, despite a MIT `LICENSE` file existing at the
  repository root, and is `"private": true` — which blocks publishing until Milestone 8 clears it.
- The runner and Docker image declare the contract's plugin-neutral cache, output, and configuration
  mounts, but nothing in `src/` reads any of them yet — see [Running in Docker](../guide/docker.md).

`BUILD-PLAN.md` is the authoritative, currently-maintained accounting of what is next; this page is a
snapshot against the implementation plan and the contract, kept only roughly in sync with them.
