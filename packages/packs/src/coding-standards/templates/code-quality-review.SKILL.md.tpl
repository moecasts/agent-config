---
name: code-quality-review
description: Use when reviewing a diff, generated code, a proposed refactor, a design decision, or a prose artifact for correctness and simplicity, with findings evidenced against KISS, YAGNI, DRY, and SOLID and every unit given a verdict.
---

# Code Quality Review

Apply the project's Coding Standards rule in
`.agents/rules/coding-standards.mdc` with judgment. The goal is fewer defects
and less accidental complexity, not maximum compliance.

## When to use

- Reviewing a diff, pull request, or generated change.
- Reviewing code written by an agent before accepting it.
- Reviewing a proposed refactor, a refactor plan, or a design decision.
- Reviewing code that is hard to change or test.
- Reviewing a change to a rule, skill, prompt, or other prose artifact.

Do not use this skill to impose personal style preferences or to reformat code.
This skill reviews a change; apply the Coding Standards rule when you make one.

## Project baseline

Detected for this repository:

- Language: {{LANGUAGE}}
- Package manager: {{PACKAGE_MANAGER}}
- Verify: {{VERIFY_COMMAND}}
- Lint: {{LINT_COMMAND}}
- Typecheck: {{TYPECHECK_COMMAND}}
- Test: {{TEST_COMMAND}}
- Format (check-only): {{FORMAT_COMMAND}}

If the project has no tests, linter, or type checker, or no check-only
formatter, record the missing tooling instead of inventing results. The
commands above are the toolchain: record them once per session and reuse them,
unless the change under review touches the toolchain config; then re-read the
commands from that config. What running them produces is the check run: record
it once per review, before judging. Run formatters in check-only mode; a review
must not rewrite the working tree. If `Verify` covers lint, typecheck, and
tests, run `Verify` once instead of the individual commands. Capture long
output to a file and quote only failing lines and counts; never paste a full
log.

## Review scope

- Review the change under discussion and the code it directly affects.
- Read the diff fully or group by group for a large change, plus enough
  surrounding code to understand behavior.
- Bound large changes: when a diff exceeds roughly 400 changed lines or 20
  files, review it in file groups, state what each group covers, and list every
  group you did not review; a skipped group makes the review incomplete.
- Do not expand into untouched files unless the task explicitly asks for a
  whole-repository audit.
- Separate issues introduced or affected by this change from pre-existing debt.
- Report pre-existing issues only when they block understanding or safety. Label
  them `pre-existing` and do not block the change on them.
- Check diff hygiene: no debug output, no unrelated reformatting, no
  commented-out code or leftover scaffolding.
- Changing a default or a config key is a behavior change; check its consumers.
- Public types, exports, and signatures are a contract: review them, not only
  the body.

## Coverage

Coverage is an inventory, not a feeling. Before judging, split the change into
units read from the diff itself, then record one verdict per unit:

- A unit is the smallest part of the change that can be judged on its own: one
  changed hunk, one changed signature, export, config key, or error path, one
  added or changed test, and, for a rules, skills, or docs change, one changed
  bullet or sentence together with the paths, commands, thresholds, and
  cross-file claims it names.
- Record the verdict as you read: `ok`, `finding <id>`, or `n/a <reason>`, and
  name the section that judged a finding next to its id. Use `n/a` only for a
  unit the change cannot affect, such as a comment-only hunk, and name it in the
  report; anything you could judge is `ok` or a finding.
- Reading an area is not a verdict for its units, and a second reading pass is
  not evidence of completeness; the inventory is.
- Report `checked N units: X ok, Y findings, Z n/a`, keeping N re-derivable from
  the diff; the report names every `n/a` and skipped unit.
- List any unit left unjudged as skipped and report the review as incomplete; an
  incomplete review is never clean.
- After a fix, re-judge the units the fix touched and any unit whose verdict
  depended on them, and leave the rest alone.
- A unit whose only defect is taste is `ok`; a taste remark is not a finding.

## Before judging

- Read `.agents/rules/coding-standards.mdc` and the project's `AGENTS.md`
  conventions. The rule may already be in the always-on context; read the file
  only when it is not.
- If the rule file is missing, report it instead of substituting a copy of the
  standards; the rule owns the thresholds, and this skill owns the procedure.
- If the project records a rule or skill as generated or managed (in-file
  markers or a managed-file check), do not hand-edit it; report the needed
  change instead.
- Establish intent from the task, commit message, or PR description. If intent
  is unclear, state the assumption or ask before calling something wrong.
- If the check run already fails, separate those failures from new ones. Do not
  attribute pre-existing failures to this change.
- Confirm that referenced APIs, types, config keys, and paths exist. Do not
  trust names, comments, or generated code at face value.

## Review workflow

Work in this order; where a step names a section, that section owns the detail.

1. Establish intent and scope, and bound large diffs before reading
   (the Review scope section).
2. Read the diff and the surrounding code it depends on, and build the unit
   inventory from it (the Coverage section).
3. Check correctness first: logic, edge cases, error handling, data loss, and
   concurrency. Note obvious security defects, but leave a security audit or
   performance profile to a focused review.
4. Evaluate the design against KISS, YAGNI, DRY, and SOLID using the thresholds
   in `.agents/rules/coding-standards.mdc`; the Judgment rules section adds only
   the remaining stops.
5. Check the tests against the Test expectations section.
6. Classify each finding by severity (the Severity section), deduplicate, and
   propose the smallest fix.
7. Write the report as the Output format section requires, and do not apply
   broad rewrites unless asked. For a proposed refactor, preserve behavior and
   keep tests green.

A clean review with zero findings is valid. Do not invent findings to fill a
quota.

## Severity

- **blocker**: must be fixed before merge. Incorrect behavior, security issue,
  data loss, broken public contract, or a risky behavior change with no test.
- **major**: should be fixed before merge or explicitly deferred. Hidden
  coupling, duplicated business rules that must change together, untestable IO
  in core logic, or a missing edge case that is likely to occur.
- **minor**: clarity or maintainability issue with a concrete cost. Fix it if
  cheap, or leave a follow-up.
- **nit**: a concrete, low-impact defect that does not affect behavior; never
  block a change on one.

For prose artifacts (rules, skills, docs, prompts) the same ladder applies to
different defects: a contradiction, an unresolvable reference, or an instruction
with no observable signal is a **blocker**; an ambiguous or redundant
instruction is **major**; a concrete tone or formatting defect is **nit**.

When unsure between two levels, choose the lower one and state the uncertainty.

## Judgment rules

The thresholds live in the Coding Standards rule, which this skill never
restates: read them there. This skill adds only the stops that rule does not
name:

- A single stable implementation needs no layering, port, or strategy object.
- Subtypes honor the full contract, including errors and invariants; keep
  interfaces narrow so no caller or implementer is forced to depend on members
  they do not use.
- Keep policy testable: business logic must not construct the IO it depends on.

## Test expectations

- Behavior change: add or update tests for the changed behavior and its edge
  cases.
- Bug fix: add a regression test when the bug is reproducible; the test must
  fail on the pre-fix code. A test that passes before the change proves nothing.
- Assert observable behavior, not internal call sequences or implementation
  details.
- Keep tests deterministic: no wall clock, network, ordering, or shared-state
  dependence.
- Pure refactor: existing tests must pass unchanged; require new tests only when
  the touched path had no coverage.
- Docs or configuration only: no new tests required; run the relevant check.

## Prose and prompt artifacts

Rules, skills, prompts, and templates shape behavior without running, and they
have their own failure modes:

- One source of truth: a threshold, number, or enum is stated once and pointed to
  elsewhere. A second statement is a defect even when it currently agrees.
- Contradiction scan: grep every artifact that restates the rule being changed,
  including validation code and tests, before accepting a wording change.
- Always-on cost: a line loaded on every request must change a decision; move
  procedure, examples, and reference detail into on-demand files.
- Reference integrity: every path, skill, command, and heading the artifact names
  must resolve; verify instead of trusting the name.
- Actionability: an instruction the reader cannot test against a signal is dead
  text; name the observable it depends on.
- Routing: a skill description states what the skill does and when it applies, in
  one or two sentences.
- Prefer a positive criterion over a bare prohibition when both would work.

## Output format

For each finding:

- **Severity**, **principle**, and **confidence**: high (reproduced or proven by
  a test, call site, or execution), medium (clear from reading the code), or low
  (suspicion that still needs verification)
- **Location**: file:line with a short quote
- **Problem**: the concrete cost, not the rule name
- **Fix**: the smallest change that resolves it
- **Evidence**: test failure, reproduction, or call site
- **Pre-existing**: label it when the issue predates this change

Example (paths are placeholders; use the project's real paths):

```text
**major / DRY / high** - <file>:<line> `if (region === 'eu') tax = 0.2`
Problem: the EU tax rate is duplicated in <other-file>:<line>, so changing one
path can silently miss the other.
Fix: read both call sites from the single tax table in <shared-module>.
Evidence: <other-file>:<line> repeats the rule; no test covers the EU path.
```

Order blockers first and never drop one to meet the length cap. Group nits into
one entry, cap the report at roughly ten finding entries, and summarize anything
left out in a short follow-up note. End with:

- The coverage line required by the Coverage section.
- What you verified (tests, lint, typecheck, check-run status).
- What you did not review.
- Open questions or assumptions.

## Do not

- Do not flag style already enforced by the formatter or linter.
- Do not delete or weaken tests; the Coding Standards rule's test policy is the
  source of truth.
- Do not change public APIs, schemas, or behavior without explicit scope.
- Do not mix refactoring with feature work in one change.
