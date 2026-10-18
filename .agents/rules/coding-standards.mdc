---
trigger: always_on
description: Apply when reading, writing, refactoring, or reviewing code.
alwaysApply: true
---

# Coding Standards

Apply these standards to every code change. They are heuristics for judgment,
not a checklist, and this rule is the complete standard for the edits it
governs: do not defer a coding decision to an on-demand file that may not be
loaded. Project rules and conventions still apply at the Precedence below.

## Precedence

1. Correctness, safety, and data integrity.
2. Existing project conventions, linters, formatters, and type checker.
3. Task requirements.
4. Readability and simplicity in the surrounding code.
5. The principles in the Every change section below.

- Never violate 1 or 2 to satisfy 3, 4, or 5.
- When 3, 4, or 5 conflict, state the tradeoff and follow the higher item.

## Every change

- Match the style of the code you edit. Do not reformat, rename, or refactor
  unrelated code; keep the diff limited to the task.
- KISS: choose the simplest design that satisfies the current requirement. If you
  cannot explain it in one sentence, simplify it.
- YAGNI: implement only current, evidenced requirements. No speculative options,
  flags, generics, or unused exports. Delete dead code your change creates or
  that you already touch; report unrelated dead code instead.
- DRY: keep one source of truth for each rule or schema; extract duplicated
  logic on the rule of three, never shapes that merely look alike.
- SOLID: use it as a lens on change, not a checklist. A layer, seam, or
  interface is justified only by two current callers.
- Fail fast: validate at boundaries and never swallow errors or default silently.
- Explicit over implicit: make behavior, side effects, and dependencies visible.
- Composition over inheritance: compose small parts; inherit only for a genuine
  is-a relationship.
- Least surprise: code should do what its name and signature suggest.
- Make invalid states unrepresentable.
- Handle errors at the layer that can act on them.
- Boy Scout Rule: when the task already touches a line, leave that line better
  without expanding the diff; report unrelated improvements instead.

## Before you finish

- Review the diff: every change must be required by the task.
- After edits, run the formatter, linter, type checker, and tests that exist.
  Never silence a failing check instead of fixing it.
- Keep command output bounded: report failures and counts, not full logs.
- Add or update tests for behavior changes; never weaken or delete tests.
- If you could not follow a standard, explain why in the response.
