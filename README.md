# Agent Config

`@cocasts/agent-config` installs project-aware rules and skills under
`.agents/`. Its `acli` command supports two ownership modes:

- **CLI mode** detects workspace scopes, confirms a deterministic config, and
  renders managed files from versioned pack templates.
- **Agent mode** installs a project-level `agent-configurator` skill so a local
  coding agent can inspect the whole repository and generate complete files.

The first release contains the `git-commit` pack.

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
npx @cocasts/agent-config install git-commit
pnpm dlx @cocasts/agent-config install git-commit
```

## Deterministic CLI mode

Run commands from the target repository, or pass `--cwd <path>`.

```bash
acli install git-commit
acli configure git-commit
acli update git-commit
acli check git-commit
```

`install` inspects npm/Bun workspaces and `pnpm-workspace.yaml`, then asks you
to confirm editable `path=scope` mappings and extra scopes. It shows the exact
file plan before writing.

`configure` re-runs project detection while preserving confirmed overrides.
`update` never re-detects the project; it renders only from the committed
`.agent-config.json`. `check` is read-only and exits with status 1 on drift.

Use `--yes` only when detected values and the complete rendered plan may be
accepted noninteractively.

## Local Agent mode

Install the project-level generator skill:

```bash
acli agent install
```

Then ask the local coding agent to use `agent-configurator` to install or
update `git-commit`. The skill reads the repository and writes the complete
rule, smart-commit skill, and managed AGENTS block. It finishes with:

```bash
acli agent adopt git-commit
```

Adoption validates output and records `mode: "agent"`. Deterministic
`acli update` will refuse to overwrite an agent-owned pack; rerun the
configurator instead.

## Managed target files

Commit these files to the target repository:

```text
.agent-config.json                         # CLI mode only
.agents/.agent-config-state.json           # ownership, version, hashes
.agents/rules/git-commit.mdc
.agents/skills/smart-commit/SKILL.md
.agents/skills/agent-configurator/**        # Agent mode entry point
AGENTS.md                                   # managed block only
```

If root `AGENTS.md` contains only a relative path such as
`./.agents/AGENTS.md`, `acli` preserves that pointer and manages the block in
the delegated file.

Do not hand-edit CLI-managed rule or skill files. Put project differences in
`.agent-config.json` and run `acli configure`. Agent-owned files may be edited
by the configurator and re-snapshotted with `acli agent adopt`.

## Add a pack

1. Add a directory under `packages/packs/src/<pack>/`.
2. Implement the shared `PackDefinition`: schema, detector, rendered files,
   AGENTS block validation, file validation, and version.
3. Keep deterministic templates and the Agent generation guide together.
4. Register the pack in `packages/packs/src/index.ts`.
5. Add detector fixtures, golden output, Agent reference checks, and CLI
   lifecycle tests.

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
