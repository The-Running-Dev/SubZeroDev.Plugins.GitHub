# Agent Instructions

## Start Safely

- First inspect the repository root and available guidance files.
- Read `CLAUDE.md`, `README.md`, `agent.md`, and documentation instructions only if they exist.
- Discover the documentation structure before assuming paths or tooling.
- If guidance conflicts, follow the most specific applicable instruction.

## Boundaries

- Preserve established ownership boundaries between repositories, layers, and services.
- Do not duplicate fields, contracts, validation, or behavior owned elsewhere.
- Keep presentation layers focused on rendering and input; do not put authoritative logic there.
- Use deterministic, serializable representations for authoritative state.
- Keep derived caches out of persisted state.
- Keep authored identity, writing, visual assets, and content original.

## Documentation

- Determine the documentation root and navigation model from the repository.
- Treat generated files as outputs: edit their declared source, then regenerate.
- Update affected cross-references whenever a page moves or a heading changes.
- Treat provisional values as content or configuration, not immutable contracts.
- Verify claims against authoritative sources.
- Present meaningful design decisions for approval before batching related edits.

## Validation and Delivery

- Run the repository’s documented validation commands when available.
- Run `git diff --check` before committing.
- Keep documentation builds from compiling dependency, template, or generated Markdown as authored content.
- Link external references by published URL, never by a relative traversal into another repository.

## Repository Hygiene

- Preserve existing ignore, attributes, and editor configuration files.
- Stage only intended files.
- Use a focused feature branch and pull request unless the user explicitly requests another flow.
- Record durable, verified lessons in repository guidance when such a convention exists.
- Do not claim testing or deployment succeeded until it has been confirmed.

## Model

Sessions in this repository use `opusplan` via `.claude/settings.json`: Opus while
planning, Sonnet while implementing. Override it in `.claude/settings.local.json`
rather than editing the tracked file.
