# Coding Standards Pack Generation Guide

Generate project-specific coding standards after inspecting the target
repository. The generated content may differ from the deterministic template,
but it must satisfy every requirement below.

## Inspect

1. Read the root package manifest, workspace declarations, and tooling configs
   for the formatter, linter, type checker, and test runner.
2. Inspect the languages, frameworks, and directory layout in use.
3. Read existing `AGENTS.md`, `.agents/rules`, and `.agents/skills` content.
4. Read representative source files to identify naming, error handling, module
   boundaries, and testing conventions.
5. Note conventions that already exist so the generated rule reinforces them
   instead of inventing new ones.

## Generate

Create or update:

- `.agents/rules/coding-standards.mdc`
- `.agents/skills/code-quality-review/SKILL.md`
- The `agent-config:coding-standards` managed block in `AGENTS.md`, or in its
  delegated file when root `AGENTS.md` contains one relative include path.

The rule must:

- Start with frontmatter containing `trigger: always_on`, `alwaysApply: true`,
  and a non-empty `description`. Both trigger fields are required so consumers
  that read either one treat the rule as always on.
- Stay between 30 and 60 lines, at least 16 guidance bullets, and within 3000
  characters. The rule is always on, so keep only what must shape every edit;
  validation rejects anything outside that budget, and rejects placeholder or
  `TODO` text.
- Cover KISS, YAGNI, DRY with the rule of three, and SOLID as a lens on change
  rather than a checklist. State each threshold exactly once: a seam needs two
  current callers, extraction waits for the rule of three. Leave the review
  procedure and its stop conditions out of the rule.
- Include fail fast, explicit over implicit, composition over inheritance, least
  surprise, the Boy Scout Rule, and making invalid states unrepresentable.
- Give project conventions, linters, formatters, and the type checker priority
  over the principles.
- Stand alone. Never take its standard from a skill or any other on-demand
  file: a consumer that honors `trigger: always_on` or `alwaysApply: true` loads
  the rule with no skill loader, so a reference out of the rule leaves that
  consumer without the standard it needs. Project rules and conventions still
  rank above the principles under Precedence. Validation rejects a skill
  reference in the rule.
- Prohibit unrelated reformatting and drive-by refactors.
- Keep the rule free of long examples; project-specific examples belong in the
  skill.

The skill must:

- Start with frontmatter whose `name` is `code-quality-review` and whose
  `description` starts with `Use when`, states both what the skill does and when
  it applies in one or two sentences, and stays well inside the 1024-character
  limit.
- Stay at or above 80 lines with at least 30 guidance bullets.
- Reference the rule as inline code (`.agents/rules/coding-standards.mdc`), not
  as a relative Markdown link. Use inline code for every repository path in
  generated skills and in the managed `AGENTS.md` block so the paths stay valid
  from the repository root. The block may be written to a delegated AGENTS file,
  where a relative Markdown link would resolve from the wrong directory; state
  that the paths are relative to the repository root.
- Include a `## Project baseline` section that lists the detected language,
  package manager, and verify, lint, typecheck, test, and format commands. Render
  an unknown fact as `not detected` instead of guessing. `npm` is the only allowed
  package-manager fallback because it runs any `package.json` script without a
  lockfile. Take the formatter command only from a check-only script, and state
  that a review must run formatters in check-only mode.
- Point at the rule for the thresholds instead of restating them: do not repeat
  the two-callers or rule-of-three numbers, and state only the stops the rule
  does not name, such as a single stable implementation needing no layering,
  subtypes honoring the full contract, and policy staying separate from IO. Do
  not restate textbook definitions.
- Scope the review to the change and directly affected code, label
  `pre-existing` issues, and never treat them as blockers.
- State what to do when the rule file is missing: report it instead of
  substituting a copy of the standards, because the skill deliberately carries
  no threshold of its own.
- Record the toolchain once per session from `## Project baseline`, re-reading
  it when the change touches the toolchain config, then record the check run
  before judging; record missing tooling as the toolchain instead of inventing
  results.
- Bound large diffs explicitly: above roughly 400 changed lines or 20 files,
  review in file groups and list every group not reviewed; a skipped group
  makes the review incomplete.
- Build coverage from an inventory instead of a reading. Split the change into
  units read from the diff, give every unit one verdict (`ok`, `finding`, or
  `n/a` with a reason), use `n/a` only for a unit the change cannot affect, and
  report `checked N units` with every `n/a` and skipped unit named so
  completeness is a claim the reader can re-derive. Reading an area is not a
  verdict for its units, a second reading pass is not evidence of completeness,
  and a unit whose only defect is taste is not a finding.
- Report an incomplete review as incomplete with the skipped units named, and
  after a fix re-judge only the units the fix touched plus the units whose
  verdict depended on them.
- Require evidence for each finding and state that zero findings is valid.
- Require regression tests to fail on the pre-fix code, assert observable
  behavior, and stay deterministic.
- Run each check suite once per review; if `Verify` covers lint, typecheck, and
  tests, run `Verify` only, and quote only failing output.
- Include a review workflow, merge-blocking severity criteria (blocker, major,
  minor, nit) with the prose-artifact mapping (a contradiction, an unresolvable
  reference, or an instruction with no observable signal is a blocker), judgment
  rules, confidence, test expectations, a `## Prose and prompt artifacts`
  section, an output format with a short example finding, and a "Do not" list.
- Require verification with tests, linter, and type checker.
- Prohibit deleting or weakening tests and unrequested public API changes, and
  require the rule's abstraction threshold to be applied rather than restated.

## Safety

- Do not create commits while installing or updating this pack.
- Do not overwrite unrelated `AGENTS.md` content.
- Do not use relative Markdown links for repository paths in generated skills or
  the managed `AGENTS.md` block.
- Do not invent conventions that conflict with project tooling or existing code.
- Do not perform the refactors you recommend; this pack only provides guidance.
- Do not reference the generator tool (`acli`) or its state files inside the
  generated rule and skill; they must stand on their own in the target
  repository.
- Stop on malformed managed markers or ambiguous delegated AGENTS paths.
- After generation, run `acli agent adopt coding-standards` to validate and
  snapshot the generated files. Run it as soon as the three files exist, then fix
  every validation error and re-run it; adoption is the validation gate.
