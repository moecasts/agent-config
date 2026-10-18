# @cocasts/agent-config-packs

Private workspace holding the versioned packs that the CLI and the
`agent-configurator` skill render from. Do not publish a separate npm package per
pack; the public CLI bundles `core`, `packs`, and `agent`.

## Pack contract

Every pack implements `PackDefinition` from `@cocasts/agent-config-core`:

- `configSchema` — zod schema for the committed `.agent-config.json` entry.
  Packs without project settings use `z.strictObject({})`.
- `detect` — project inspection for CLI mode. Return a stable empty object when
  the pack is intentionally project-agnostic.
- `render` — deterministic output from the config. Templates live in
  `src/<pack>/templates/`. The CLI build merges every pack's templates into one
  flat `dist/templates` directory, so template file names must be unique across
  packs; prefix them with the pack id (`<pack>.agents-block.md.tpl`).
- `validate` — structural gate for generated files. Runs for CLI-owned packs on
  `acli check`, and for agent-owned packs on `acli agent adopt` and `acli check`.
- `validateAgentsBlock` — requires the managed `AGENTS.md` block to link the
  generated files.
- `validateAgentGuide` — packaging check for the shipped
  `references/<pack>.md` guide, not a generation-quality gate.
- `version` — bump whenever rendered templates change; `acli check` reports it.

Validation is a floor, not a quality gate. Substring checks catch missing
principles and line/bullet floors catch empty or keyword-stuffed output, but
neither can judge whether the guidance is good. Exported `REQUIRED_*` constants
are the single source of truth for the required contract; tests import them
instead of restating the lists.

## Agent-mode generation

Each pack ships `src/<pack>/agent-guide.md`, copied to
`.agents/skills/agent-configurator/references/<pack>.md`. Keep the guide and the
pack's `validate` contract in sync: a requirement that is not validated is only a
suggestion, and a validation that is not documented fails adoption unexpectedly.

## Rule file dialects

Generated rule files carry both `trigger: always_on` (Windsurf-style) and
`alwaysApply: true` (Cursor-style) frontmatter, so consumers that read either
field treat the rule as always on. No consumer honors both: tools that only read
`AGENTS.md` reach the rule through the managed block link, so that link must stay
valid.

## Known limitations

- `coding-standards` detection is best-effort: unknown facts render as `not
  detected` rather than guessed, and the always-on rule stays language-neutral so
  it remains portable. Only the on-demand review skill carries project facts. Two
  intentional exceptions: the package manager falls back to `npm` when no
  lockfile declares one, because npm runs any `package.json` script, and the
  formatter command comes only from a check-only script so a write-mode `format`
  script never reaches the review skill.
- Detected commands live in `.agent-config.json` and are refreshed only by
  `acli configure`; `acli update` renders from the committed config so it stays
  deterministic.
- A pack emits a single rule file, so a polyglot repository cannot split rules by
  language yet.
- Pack tests assert rendered paths, required sections, and validation results
  instead of storing byte-identical golden output, so a template edit only has
  one place to change.
- Validation does not detect contradictions between a rule and its skill, and
  agent-mode generation has no automated round-trip test; only adoption and
  `acli check` cover it.
