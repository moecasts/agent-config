import type { PackDefinition } from '@cocasts/agent-config-core';
import { detectGitCommitConfig } from './detect.ts';
import { renderGitCommitPack } from './render.ts';
import { type GitCommitConfig, gitCommitConfigSchema } from './schema.ts';

const RULE_PATH = '.agents/rules/git-commit.mdc';
const SKILL_PATH = '.agents/skills/smart-commit/SKILL.md';

const validateGitCommitFiles = (files: Readonly<Record<string, string>>): readonly string[] => {
  const errors: string[] = [];
  const rule = files[RULE_PATH];
  const skill = files[SKILL_PATH];

  if (!rule) {
    errors.push(`Missing ${RULE_PATH}`);
  } else {
    if (!rule.includes('trigger: model_decision') || !rule.includes('`type(scope): description`')) {
      errors.push(`${RULE_PATH} is missing required commit rule metadata`);
    }
  }

  if (!skill) {
    errors.push(`Missing ${SKILL_PATH}`);
  } else {
    if (!skill.includes('name: smart-commit') || !skill.includes(RULE_PATH)) {
      errors.push(`${SKILL_PATH} is missing required skill metadata`);
    }
    if (!skill.includes('staged, unstaged, and untracked')) {
      errors.push(`${SKILL_PATH} must preserve staging context`);
    }
  }

  return errors;
};

export const gitCommitPack: PackDefinition<GitCommitConfig> = {
  configSchema: gitCommitConfigSchema,
  detect: detectGitCommitConfig,
  filePaths: [RULE_PATH, SKILL_PATH],
  id: 'git-commit',
  render: renderGitCommitPack,
  validateAgentsBlock: (content) =>
    content.includes('[Git Commit Rules](.agents/rules/git-commit.mdc)')
      ? []
      : ['AGENTS block must link to .agents/rules/git-commit.mdc'],
  validate: validateGitCommitFiles,
  version: '1.0.0',
};
