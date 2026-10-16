---
trigger: model_decision
description: Apply when planning or creating Git commits.
alwaysApply: false
---

# Git Commit Rules

## Format

`type(scope): description`

- Use lowercase English only.
- Write a subject line only, with no body.
- Do not add trailers such as `Co-Authored-By` or `Signed-off-by`.

## Types

`feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`, `perf`, `ci`,
`build`

## Detected scopes

{{SCOPE_MAPPINGS}}

- Treat detected scopes as preferred defaults, not an exhaustive whitelist.
- For an unlisted module under a repository module directory, derive the scope
  from the module directory name and remove an unambiguous shared prefix.
- Use `{{ROOT_SCOPE}}` for repository-wide files.
- Use `{{AGENTS_SCOPE}}` for `AGENTS.md`, `.agents/**`, and agent adapters.
{{EXTRA_SCOPES}}
- Prefer `scope/module`, such as `web/i18n` or `api/auth`.
- Use a bare scope only when a change genuinely spans multiple modules.
- For cross-scope changes, use comma-separated bare scopes only:
  `chore(web,api): update shared tooling`.

## Type-specific scope rules

- Use `docs({{DOCS_SCOPE}})` for top-level documentation and `docs/**`.
- Use the package scope for package-specific documentation.

## Commit ordering in multi-commit plans

Plan commits in dependency order, with `docs` commits first.

## Examples

- `feat(web/auth): add session refresh`
- `fix(api/novel): handle missing token`
- `chore({{AGENTS_SCOPE}}): update git commit rules`
