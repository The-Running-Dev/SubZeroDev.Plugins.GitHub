# Slices — SubZeroDev GitHub Plugin

Milestones 0–8 of the former implementation plan are complete. Their history and the alternatives rejected while making them are captured in [`90-decisions.md`](90-decisions.md); they are not active slices.

## S1 — First public release

**Depends on:** the release-ready package, container, documentation, and workflow implementation already present on `main`.

**Goal:** publish the first stable set of npm, OCI, and GitHub Release artifacts without allowing the development manifest to claim a digest it cannot yet know.

### Acceptance criteria

- [ ] `npm ci && npm run check` is green on Windows and Linux.
- [ ] The image runs non-root with read-only application/configuration mounts and writable cache/output mounts; fixture-backed flows are deterministic and secret-safe.
- [ ] The release workflow verifies package, manifest, tag, and image-label version agreement before publication.
- [ ] The published npm package works through `npx @subzerodev/plugins-github` without registry configuration.
- [ ] The GitHub Release attaches the npm tarball and the release workflow signs and attests the multi-platform image digest.

**Out of scope:** a new feature, a new provider, a change to the plugin contract, or a migration path for incompatible pre-1.0 exports.
