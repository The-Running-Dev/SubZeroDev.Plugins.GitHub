---
title: 'ADR-001: Host the GitHub plugin as a CLI-first plugin'
description: CLI-first hosting, semantic versioning over date-based versions, package vs. schema version.
sidebar_position: 2
---

# ADR-001: Host the GitHub Plugin as a CLI-First Plugin

## Status

Accepted — 2026-07-27

## Amendment (2026-07-28)

The names below are superseded. The plugin was originally
`SubZeroDev.Automator.Plugins.GitHub`, packaged as `@subzerodev/automator-plugin-github`, because it
was scaffolded before the ecosystem architecture existed.

That name says the plugin is a component of the Automator, which the architecture explicitly rejects:
plugins must not depend on Automator internals, must be independently executable, and depend on the
plugin contract rather than on any host. The plugin is now `SubZeroDev.Plugins.GitHub`, packaged as
`@subzerodev/plugin-github`, with the image `subzerodev-github`.

The hosting and versioning decisions themselves are unchanged and still stand.

## Amendment (2026-07-29)

The Decision and Consequences sections below still describe a pre-split monorepo: a `plugins/`
subdirectory holding both the workstation toolkit and this plugin, and a `docs-template/` versioned by
date. Neither is true of this repository. `SubZeroDev.Plugins.GitHub` is now its own repository, this
plugin's code lives at its root rather than under `plugins/`, and its documentation site follows this
repository's own semantic versioning rather than a vendored template's. The decision and its reasoning
are otherwise unaffected — see `README.md`, `AGENTS.md`, and the published documentation for the
repository's actual current layout.

## Context

SubZeroDev.Automator.Plugins.GitHub needs to run independently today and may later be consumed by
SubZeroDev.Automator. Building it around Automator now would couple the provider,
models, and synchronization behavior to a runtime that does not yet exist.

## Decision

Implement SubZeroDev.Automator.Plugins.GitHub in this repository at
`plugins/SubZeroDev.Automator.Plugins.GitHub`.

The plugin owns its domain models, provider interface, synchronization services,
cache, configuration, and serialization. Its first runner is a standalone CLI.
Automator integration is deferred and will later call the plugin's public
contracts as another runner.

The npm package is named `@subzerodev/automator-plugin-github`. The executable is named
`subzerodev-github` to avoid colliding with unrelated system commands.

## Versioning

The plugin uses semantic versioning for the npm package and for published
container tags. It starts at `0.1.0`, and the pre-`1.0.0` range signals that the
public contracts are still changing across the remaining Phase One milestones.

The date-based `YYYY.MM.DD` convention documented under `docs-template/` applies
to that vendored documentation site and does not extend to this plugin. Two
reasons:

- `YYYY.MM.DD` is not valid semantic versioning, because leading zeros are not
  permitted in numeric identifiers. `2026.07.27` and `2026.10.05` are both
  invalid, and `semver.validRange('^2026.07.27')` is `null`, so a consumer could
  not express a range dependency on the package. npm does not reject the value
  locally, so the failure would surface only at publication or consumption.
- Even in an unpadded form such as `2026.7.27`, a caret range covers every
  release until the end of the calendar year, which would advertise breaking
  contract changes as compatible.

Package version and schema version are deliberately separate. `SCHEMA_VERSION`
governs the compatibility of exported documents and is required in every
serialized model; the package version describes the distributed code.

## Consequences

- The core remains usable without Automator.
- CLI concerns must remain outside provider and service implementations.
- Future runners can reuse the same contracts.
- The repository temporarily contains both the workstation toolkit and this
  product plugin.
- The plugin and `docs-template/` follow different versioning conventions, so
  repository-wide version rules must be scoped rather than applied uniformly.
- Reaching `1.0.0` requires the Phase One contracts to be stable.
