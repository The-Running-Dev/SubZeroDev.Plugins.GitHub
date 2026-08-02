---
title: Schemas
description: Versioned command, envelope, manifest, and project schemas.
sidebar_position: 2
---

# Schemas

`schemas/contract/` contains byte-for-byte vendored plugin-contract schemas and is refreshed only by
its documented procedure. `schemas/projects.schema.json` is generated from the public Zod model.
`schemas/commands/*.input.schema.json` is generated from CLI option tables. `plugin.yaml` links each
command to its input schema and to the appropriate contract output schema.

Every public model carries `schemaVersion`. Readers accept compatible versions in the same major and
refuse higher majors. Incompatible exports are regenerated from authoritative cache and provider
data; they are not migrated in place.

Generated schemas are committed so consumers do not need the TypeScript build. Drift tests compare
them byte-for-byte with fresh generation.
