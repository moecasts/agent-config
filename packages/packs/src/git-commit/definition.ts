import type { PackDefinition } from '@cocasts/agent-config-core';
import { collectGeneratorReferences } from '../shared.ts';
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
    errors.push(...collectGeneratorReferences(RULE_PATH, rule));
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
    errors.push(...collectGeneratorReferences(SKILL_PATH, skill));
  }

  return errors;
};

export const gitCommitPack: PackDefinition<GitCommitConfig> = {
  configSchema: gitCommitConfigSchema,
  detect: detectGitCommitConfig,
  filePaths: [RULE_PATH, SKILL_PATH],
  id: 'git-commit',
  render: renderGitCommitPack,
  validateAgentGuide: (content) => {
    const errors: string[] = [];
    if (!content.includes('staged, unstaged, and untracked')) {
      errors.push('Git commit agent guide must preserve staging context');
    }
    if (!content.includes('Do not create commits')) {
      errors.push('Git commit agent guide must prohibit creating commits');
    }
    if (!content.includes('acli agent adopt git-commit')) {
      errors.push('Git commit agent guide must document adoption');
    }
    if (!content.includes('AGENTS.md')) {
      errors.push('Git commit agent guide must cover AGENTS.md preservation');
    }
    if (!content.includes('Do not reference the generator tool')) {
      errors.push('Git commit agent guide must keep generated files self-contained');
    }
    return errors;
  },
  validateAgentsBlock: (content) =>
    content.includes('[Git Commit Rules](.agents/rules/git-commit.mdc)')
      ? []
      : ['AGENTS block must link to .agents/rules/git-commit.mdc'],
  validate: validateGitCommitFiles,
  version: '1.0.0',
};
