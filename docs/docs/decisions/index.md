---
title: Decisions
description: Architecture decision records for the GitHub plugin, and what moved to the plugin contract.
# Inert but declared, so every page under docs/docs/ states its ordering: _category_.json here
# carries no `link`, so Docusaurus treats this file as the category's own index page rather than
# a sibling sidebar item, and does not order it against the ADRs.
sidebar_position: 1
---

# Decisions

Architecture decision records (ADRs) for this plugin. Each records what was decided, when, and why —
not what is currently true, so an ADR is read as a dated record rather than as documentation of
present behavior. Where an ADR and current behavior disagree, current behavior wins and the ADR
carries a dated amendment rather than being rewritten.

| ADR                                                      | Decision                                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [ADR-001](./adr-001-hosting-and-versioning.md)           | Host the GitHub plugin as a CLI-first plugin, independent of a future automation runtime                              |
| [ADR-002](./adr-002-phase-one-boundaries.md)             | The boundaries of Phase One: scope, identity, authentication, output, statistics, and budget                          |
| [ADR-003](./adr-003-request-wrapper-and-http-testing.md) | The request wrapper talks to `fetch` directly rather than through Octokit, and HTTP is tested with a hand-rolled stub |

## What moved to the plugin contract

Both ADRs originally decided some things that turned out to be true of every plugin, not just this
one: the exit-code table, secrets from the environment only, serialization and atomic replacement,
schema-version compatibility, configuration precedence, and logging levels. Those were promoted to
`SubZeroDev.PluginContract` by that repository's ADR-003, and this plugin's ADRs are left in place as
the record of what was decided and why — the contract is now authoritative for them.

**Generic decisions do not come back down.** A rule that applies to a second plugin identically
belongs in the contract, even while only this plugin exercises it today. See
[`AGENTS.md`](https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub/blob/main/AGENTS.md) for
the placement test.
