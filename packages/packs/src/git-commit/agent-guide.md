# Git Commit Pack Generation Guide

Generate project-specific Git commit guidance after inspecting the target
repository. The generated content may differ from the deterministic template,
but it must satisfy every requirement below.

## Inspect

1. Read the root `package.json`, workspace declarations, and package manifests.
2. Inspect top-level application, package, infrastructure, and documentation
   directories.
3. Read existing `AGENTS.md`, `.agents/rules`, and `.agents/skills` content.
4. Derive stable top-level scopes from actual paths; remove a shared repository
   prefix only when that mapping is unambiguous.
5. Treat detected scopes as preferred defaults, not a closed whitelist. For an
   unlisted module, derive the scope from its nearest module directory.

## Generate

Create or update:

- `.agents/rules/git-commit.mdc`
- `.agents/skills/smart-commit/SKILL.md`
- The `agent-config:git-commit` managed block in `AGENTS.md`, or in its
  delegated file when root `AGENTS.md` contains one relative include path.

The rule must define `type(scope): description`, lowercase English subjects,
allowed types, path-backed scopes, module scopes, cross-scope syntax, docs
scope, agent-config scope, and commit ordering.

The skill must inspect staged, unstaged, and untracked changes separately. It
must preserve partial staging, present an exact commit plan, wait for explicit
approval, revalidate before execution, and prohibit broad or silent index
changes.

## Safety

- Do not create commits while installing or updating this pack.
- Do not overwrite unrelated `AGENTS.md` content.
- Do not invent scopes that cannot be explained by repository paths or an
  explicit project convention.
- Stop on malformed managed markers or ambiguous delegated AGENTS paths.
- Do not reference the generator tool (`acli`) or its state files inside the
  generated rule and skill; they must stand on their own in the target
  repository.
- After generation, run `acli agent adopt git-commit` to validate and snapshot
  the generated files.
