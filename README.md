# Agent Config

`@cocasts/agent-config` installs project-aware rules and skills under
`.agents/`. Its `acli` command supports two ownership modes:

- **CLI mode** detects or accepts project configuration, confirms a
  deterministic plan, and renders managed files from versioned pack templates.
- **Agent mode** installs a project-level `agent-configurator` skill so a local
  coding agent can inspect the whole repository and generate complete files.

The published packs are:

- `git-commit` - commit message rules and a staged-change smart-commit skill.
- `coding-standards` - always-on KISS, YAGNI, DRY, and SOLID guidance plus an
  on-demand code-quality review skill that scopes reviews to the change, records
  a project baseline with the detected commands, labels pre-existing issues, and
  rates findings by severity.

## Requirements

- Node.js 22 or newer to run the published CLI.
- Bun 1.4 and TypeScript 7 to develop this repository.

## Install

Install the command globally with any Node package manager:

```bash
npm install --global @cocasts/agent-config
# or
pnpm add --global @cocasts/agent-config
# or
yarn global add @cocasts/agent-config
# or
bun add --global @cocasts/agent-config
```

For one-off CLI-mode installation:

```bash
# npm
npx @cocasts/agent-config install git-commit
npx @cocasts/agent-config install coding-standards

# pnpm
pnpm dlx @cocasts/agent-config install git-commit
pnpm dlx @cocasts/agent-config install coding-standards
```

## Deterministic CLI mode

Run commands from the target repository, or pass `--cwd <path>`.

```bash
acli install git-commit
acli configure git-commit
acli update git-commit
acli check git-commit

acli install coding-standards
acli update coding-standards
acli check coding-standards
```

`install` inspects npm/Bun workspaces and `pnpm-workspace.yaml` for
`git-commit`, then asks you to confirm editable `path=scope` mappings and extra
scopes. `coding-standards` detects the language, package manager, and
verify/lint/typecheck/test/format commands, renders them into the review skill,
and goes straight to the file plan without prompting. Both packs show the exact
plan before writing.

`configure` re-runs project detection while preserving confirmed overrides;
`coding-standards` has no overrides, so it simply re-detects. `update` never
re-detects the project; it renders only from the committed
`.agent-config.json`. `check` is read-only and exits with status 1 on drift.
When no pack is named, `update` and `check` cover every pack recorded in
`.agents/.agent-config-state.json`.

Use `--yes` only when detected values and the complete rendered plan may be
accepted noninteractively.

## Local Agent mode

Install the project-level generator skill:

```bash
acli agent install
```

Then ask the local coding agent to use `agent-configurator` to install or
update a pack such as `git-commit` or `coding-standards`. The skill reads the
repository and writes the complete rule, skill, and managed AGENTS block. It
finishes with:

```bash
acli agent adopt <pack>
```

For example, `acli agent adopt coding-standards` or `acli agent adopt
git-commit`. Adoption validates output and records `mode: "agent"`.
Deterministic `acli update` will refuse to overwrite an agent-owned pack; rerun
the configurator instead.

## Managed target files

Commit these files to the target repository:

```text
.agent-config.json                         # CLI mode only
.agents/.agent-config-state.json           # ownership, version, hashes
.agents/rules/git-commit.mdc               # git-commit pack
.agents/skills/smart-commit/SKILL.md       # git-commit pack
.agents/rules/coding-standards.mdc         # coding-standards pack
.agents/skills/code-quality-review/SKILL.md # coding-standards pack
.agents/skills/agent-configurator/**        # Agent mode entry point
AGENTS.md                                   # managed blocks only
```

If root `AGENTS.md` contains only a relative path such as
`./.agents/AGENTS.md`, `acli` preserves that pointer and manages the block in
the delegated file.

Do not hand-edit CLI-managed rule or skill files. Put project differences in
`.agent-config.json` and run `acli configure`. Agent-owned files may be edited
by the configurator and re-snapshotted with `acli agent adopt`.

## Add a pack

1. Add a directory under `packages/packs/src/<pack>/`.
2. Implement the shared `PackDefinition`: config schema, detector, rendered
   files, AGENTS block validation, file validation, agent guide validation, and
   version. Packs without project-specific settings can use an empty config and
   skip interactive prompts.
3. Keep deterministic templates and the Agent generation guide together.
4. Register the pack in `packages/packs/src/index.ts` and add its guide reader
   to `packAgentGuides` and its template root to `packTemplateRoots`.
   Prefix template file names with the pack id, because the build flattens every
   pack into one `dist/templates` directory. Packs with interactive settings
   also add a `PackConfigAdapter` in `packages/cli/src/services/pack-config.ts`.
5. Add detector fixtures, rendered-output assertions, Agent reference checks,
   and CLI lifecycle tests.

Do not create a separate npm package for each pack. The public CLI bundles the
private `core`, `packs`, and `agent` workspaces.

## Development

```bash
bun install
bun run format
bun run check
bun run verify
node packages/cli/dist/cli.js --help
```

Validate the npm payload from `packages/cli`:

```bash
cd packages/cli
npm pack --dry-run
```

## License

[MIT](LICENSE) © [moecasts](https://github.com/moecasts) <moecasts.caster@gmail.com>
