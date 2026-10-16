---
name: smart-commit
description: Use when uncommitted Git changes need to be committed, split into logical commits, or organized into a commit plan.
---

# Smart Commit

## Goal

Split the current work into reviewable commits without losing changes or
silently changing the user's staging intent. Always present the exact plan
before mutating the index or creating commits.

## Required authority

Read `.agents/rules/git-commit.mdc` before writing any plan or commit message,
and read it again immediately before execution. Its format, type, scope, and
ordering rules override examples in this skill. If the file is missing, stop
and ask the user how commit messages should be formatted.

## Workflow

### 1. Inspect without mutation

Run:

```bash
git status --short --branch
git rev-parse --verify HEAD
git diff --cached
git diff
git ls-files --others --exclude-standard
```

If `HEAD` exists, also run `git diff HEAD`. An unborn branch makes that command
fail, and `git diff HEAD` never includes untracked files. Read relevant
untracked files separately.

Record each path as staged, unstaged, untracked, or partially staged. Do not
stage, unstage, restore, or commit while gathering context.

### 2. Group changes

- Keep implementation, its types, and its tests together.
- Separate unrelated package, repository configuration, dependency, and agent
  changes.
- Avoid tiny commits when the files form one reviewable change.
- Follow `.agents/rules/git-commit.mdc` for ordering and message format.

### 3. Present the exact plan

List every commit in order with its file count, message, paths, and current
staging state. Mention partial-file grouping and any required index strategy.

Ask: **"Does this commit plan look good?"**

Stop and wait. Do not create commits until the user explicitly approves the
presented plan.

### 4. Revalidate and execute

1. Re-run the inspection commands. If content or staging changed, stop and
   present an updated plan.
2. Never use broad `git add .`, `git add -A`, `git reset`, or
   `git restore --staged` unless that exact index change was approved.
3. Stage only approved paths or hunks.
4. Inspect `git diff --cached --name-status` and `git diff --cached` before
   every commit.
5. Commit with the approved subject line only.
6. Run `git status --short --branch` after every commit and at the end.

## Stop signs

- Do not create commits before the exact plan is approved.
- Do not treat `git diff HEAD` as complete context.
- Do not ignore staged, unstaged, and untracked state.
- Do not copy scopes from examples instead of the project rule.
- Do not silently restage or discard the user's changes.
