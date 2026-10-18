---
name: agent-configurator
description: Use when installing or updating project-specific agent rules and skills from an agent-config pack.
---

# Agent Configurator

Generate complete project-specific agent files after understanding the target
repository. Pack references define required behavior; repository evidence
defines project-specific content.

## Workflow

1. Read `.agents/.agent-config-state.json` when present.
   - Continue when the pack is absent or has `mode: "agent"`.
   - If it has `mode: "cli"`, stop and ask for explicit approval to switch
     ownership. Do not overwrite CLI-managed files.
2. Read the requested pack guide under `references/`.
3. Inspect the repository before writing:
   - Root package and workspace manifests.
   - Application, package, infrastructure, and documentation directories.
   - Existing `AGENTS.md`, including a single-line relative delegation.
   - Existing `.agents/rules` and `.agents/skills`.
   - Project commit tooling and recent commit subjects when relevant.
4. Generate the complete files required by the pack under `.agents/rules` and
   `.agents/skills`. Adapt project scopes and examples to evidence from the
   repository; do not copy example scopes blindly.
5. Preserve existing AGENTS instructions:
   - If root `AGENTS.md` contains only one relative path, update that delegated
     file.
   - Otherwise update root `AGENTS.md`.
   - Insert the pack's `agent-config:<pack>:start/end` block when both markers
     are absent.
   - Replace only that block when both markers already exist.
   - Stop when exactly one marker exists, markers are duplicated or reversed,
     or delegation is ambiguous.
6. Review every generated diff. Confirm that no unrelated content changed.
7. Run `acli agent adopt <pack>` to validate the complete output and record
   agent ownership and file hashes.

## Git commit pack

For `git-commit`, read [the generation guide](references/git-commit.md). Inspect
staged, unstaged, untracked, and partially staged changes separately when
designing the smart-commit workflow. The generated skill must present an exact
commit plan and wait for approval before any index mutation or commit.

## Coding standards pack

For `coding-standards`, read [the generation guide](references/coding-standards.md).
Inspect the repository's languages, tooling, and existing conventions, then
generate an always-on rule and an on-demand review skill that gives every unit of
a change a verdict. Keep the rule
concise, include every required principle and guardrail, scope reviews to the
change with explicit evidence, and do not perform the refactors you recommend.
Reference repository paths as inline code, record a baseline with check-only
formatting, bound large diffs, and define the fallback when the rule file is
missing.

## Stop signs

- Do not create commits while installing or updating agent configuration.
- Do not use `.cursor/rules` or `.cursor/skills`; this project targets
  `.agents/rules` and `.agents/skills`.
- Do not replace an entire existing `AGENTS.md`.
- Do not invent conventions that repository files do not support.
- Do not adopt output when pack validation fails.
