# Vendored contract schemas

These two files are copied byte-for-byte from the plugin contract and must never be hand-edited.
Where behavior needs to change, that happens in the contract repository and is re-vendored here — see
"Refresh procedure" below.

| File                          | Source path (at copy time)                                                                                                                                                                         | Schema `$id`                                                                       | Contract version | Copied     | sha256                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------- | ---------- | ------------------------------------------------------------------ |
| `plugin-manifest.schema.json` | `specs/SubZeroDev-Ecosystem-Specifications/SubZeroDev.PluginContract/schemas/plugin-manifest.schema.json`, in this repository's own working tree, before that staging tree was relocated out of it | `https://schemas.subzerodev.com/plugin-manifest/1.0.0/plugin-manifest.schema.json` | `1.0.0-draft`    | 2026-07-29 | `66847ad2a2fc5621b68f8e3d922b3671518e65cc7888a33dbc7ea935b9723aa6` |
| `result-envelope.schema.json` | `specs/SubZeroDev-Ecosystem-Specifications/SubZeroDev.PluginContract/schemas/result-envelope.schema.json`, same repository and same moment                                                         | `https://schemas.subzerodev.com/result-envelope/1.0.0/result-envelope.schema.json` | `1.0.0-draft`    | 2026-07-29 | `c32199f81ce764229965a05257f97459d6a295ce96398e39a3d03a5d60b47f1c` |

## No upstream commit SHA exists yet

`SubZeroDev.PluginContract` has not been split out into its own repository — the staging tree it was
copied from was itself untracked working-tree content in this repository, with no commit of its own.
There is therefore no upstream commit to cite. **This must be corrected at the first refresh after the
contract repository exists**, by replacing the source path above with a tagged commit reference (per
this plugin's own `AGENTS.md` and the ecosystem's "move, never copy" convention) rather than leaving a
path that no longer resolves.

## Refresh procedure

1. Fetch the current schema files from the tagged contract version this plugin claims to implement.
2. Replace both files here byte-for-byte. Do not reformat, reorder keys, or otherwise "clean up" the
   copy — a vendored file that differs from its source in anything but content is a vendored file that
   cannot be diffed against its source.
3. Update this table: new source (a commit-pinned URL or tag, not a working-tree path), new `$id` if
   the schema version changed, new copy date, new sha256 for each file.
4. Run `tests/contract/*.test.ts`. **A newly failing test is a real incompatibility to resolve, not a
   test to edit** — per this plugin's own `IMPLEMENTATION-PLAN.md` §11 and the reusable plugin
   implementation guide's rule that a failing ported/golden test means the change broke something, not
   that the test was wrong.
