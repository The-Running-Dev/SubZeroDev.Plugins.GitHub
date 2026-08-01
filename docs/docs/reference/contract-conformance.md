---
title: Contract conformance
description: Locally asserted plugin-contract checks and the status of the shared runner.
sidebar_position: 3
---

# Contract Conformance

The shared `SubZeroDev.PluginContract` conformance runner is specified but does not yet exist. This
repository therefore does not claim a shared-suite pass. Its CI container job implements equivalent
local C1–C9 assertions in a form intended to move into that runner later.

| Check                            | Local evidence                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| C1 — bare manifest               | Network-disabled, mount-free container output is one schema-validated manifest; labels match ID/version. |
| C1b — attestations               | Release workflow signs the image digest and attests the digest-bearing release manifest.                 |
| C2 — universal commands          | Container checks help, version, manifest, and unknown-command exit `2`.                                  |
| C3/C3b — output purity/envelopes | CLI/E2E tests parse exactly one JSON envelope and force trace logging to stderr.                         |
| C4 — artifacts                   | Export E2E tests verify each declared artifact's path, bytes, and SHA-256.                               |
| C5 — exit codes                  | E2E covers `0`, `2`, `3`, `4`, `5`, and `6`; `1` is never assigned.                                      |
| C6 — secret canary               | Unit tests scrub nested values; container checks output and saved layers.                                |
| C7 — container hygiene           | Image runs as UID 10001 under `--read-only` with read-only config/cache mounts.                          |
| C8 — determinism                 | Golden tests and two isolated container exports compare byte-for-byte.                                   |
| C9 — path confinement            | Cross-platform traversal and symlink tests protect cache/output roots.                                   |

Passing these checks demonstrates this implementation's evidence, not completion of an unavailable
external suite. Windows and Linux application jobs plus the Linux container job are required before
release.
