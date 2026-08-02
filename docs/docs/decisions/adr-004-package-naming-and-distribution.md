---
title: 'ADR-004: Name and distribute the npm package'
description: Package naming, npmjs.com distribution, executable aliases, and release provenance.
sidebar_position: 5
---

# ADR-004: Name and Distribute the npm Package

## Status

Accepted — 2026-08-01

## Context

The package had not been published, so its singular `@subzerodev/plugin-github` name could still be
corrected without breaking consumers. The repository is `SubZeroDev.Plugins.GitHub`. GitHub Packages
requires npm clients to authenticate even for public reads, which prevents a zero-configuration
`npx` experience.

## Decision

Publish `@subzerodev/plugins-github` publicly on npmjs.com and attach the same tarball to its GitHub
Release. Publish an AMD64/ARM64 OCI image to GHCR and sign its multi-platform digest. The release
workflow materializes and attests a production manifest after that digest exists, then places the same
manifest in the release attachment, the CLI's built manifest, and the npm tarball's `plugin.yaml`. The
checked-in development manifest cannot embed the final digest because doing so would change the image
and therefore its digest.

Keep `subzerodev-github` as the canonical executable. Provide `sz-github` as a convenience alias and
`plugins-github` solely so bare `npx @subzerodev/plugins-github` can resolve an unambiguous binary.
Automation must use the canonical executable.

The plugin contract's singular package name is an example rather than a normative mapping. Correct
that upstream example when the contract becomes its own repository; this repository must not copy or
fork the contract text to do so.

## Consequences

- Consumers can use `npx` without configuring a registry or credentials.
- npm provenance connects the package to the tagged workflow and commit.
- The extra binary alias is packaging glue that must remain documented as non-canonical.
- A release spans npm, GHCR, GitHub attestations, and GitHub Releases, so failure recovery must account
  for a partially completed external publication.

## Alternatives

- **Keep the singular name.** Rejected because this is the last point at which correcting the
  repository/package mismatch is free.
- **Use GitHub Packages as the npm registry.** Rejected because anonymous npm reads are unavailable.
- **Expose only two binary names.** Rejected because npm cannot choose which binary bare `npx` should
  invoke.
