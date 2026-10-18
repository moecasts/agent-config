import type { PackDefinition } from '@cocasts/agent-config-core';
import { collectGeneratorReferences } from '../shared.ts';
import { detectCodingStandardsConfig } from './detect.ts';
import { CODE_QUALITY_REVIEW_SKILL_PATH, RULE_PATH, renderCodingStandardsPack } from './render.ts';
import { type CodingStandardsConfig, codingStandardsConfigSchema } from './schema.ts';

const CODE_QUALITY_REVIEW_SKILL_NAME = 'code-quality-review';

/**
 * Substance floors, not quality gates: they stop empty or keyword-stuffed
 * output from passing agent-mode adoption. The rule budget is deliberately tight
 * because the rule is always on and paid for on every request.
 */
const RULE_MIN_LINES = 30;
const RULE_MAX_LINES = 60;
const RULE_MIN_BULLETS = 16;
const RULE_MAX_CHARS = 3000;
const SKILL_MIN_LINES = 80;
const SKILL_MIN_BULLETS = 30;

/**
 * Exported so tests and the agent guide can assert against one source of truth
 * instead of restating the required contract in each file.
 */
export const REQUIRED_RULE_TEXTS = [
  'KISS',
  'YAGNI',
  'DRY',
  'SOLID',
  'Fail fast',
  'Explicit over implicit',
  'Composition over inheritance',
  'Least surprise',
  'Boy Scout Rule',
  'invalid states',
  'rule of three',
  'linters, formatters, and type checker',
  'Do not reformat',
  'not a checklist',
] as const;

export const REQUIRED_SKILL_TEXTS = [
  '.agents/rules/coding-standards.mdc',
  'fail on the pre-fix code',
  'blocker',
  'major',
  'minor',
  'nit',
  'pre-existing',
  'baseline',
  'zero findings',
  'confidence',
  'Do not delete',
  'public APIs',
  'checked N units',
  'not evidence of completeness',
  'keeping N re-derivable from',
] as const;

export const REQUIRED_SKILL_HEADINGS = [
  '## When to use',
  '## Project baseline',
  '## Review scope',
  '## Coverage',
  '## Before judging',
  '## Review workflow',
  '## Severity',
  '## Judgment rules',
  '## Test expectations',
  '## Prose and prompt artifacts',
  '## Output format',
  '## Do not',
] as const;

const REQUIRED_AGENT_GUIDE_TEXTS = [
  'AGENTS.md',
  'inline code',
  'repository root',
  'trigger: always_on',
  'alwaysApply: true',
  'KISS',
  'rule of three',
  'Project baseline',
  'Do not reference the generator tool',
  'Do not create commits',
  'acli agent adopt coding-standards',
  'pre-existing',
  'baseline',
  'check-only',
  'large diffs',
  'zero findings',
  'confidence',
  '.agents/skills/code-quality-review/SKILL.md',
  'every unit',
  'checked N units',
  're-derive',
  'fail on the pre-fix code',
] as const;

const collectMissing = (
  path: string,
  content: string,
  requiredTexts: readonly string[],
): readonly string[] =>
  requiredTexts
    .filter((requiredText) => !content.includes(requiredText))
    .map((requiredText) => `${path} is missing required guidance: ${requiredText}`);

const UNFINISHED_TEXT_PATTERN = /\{\{|TODO|TBD|FIXME/u;

/**
 * The rule is always on: consumers that honor `trigger: always_on` or
 * `alwaysApply: true` load it without any skill loader. A rule that defers its
 * judgment to an on-demand skill is therefore a dangling reference for those
 * consumers, not a separation of concerns.
 */
const RULE_SKILL_DEPENDENCY_PATTERN = /\.agents\/(?:skills|workflows)\/|\bcode-quality-review\b/u;

const countLines = (content: string): number => content.split('\n').length;

const countBullets = (content: string): number =>
  content.split('\n').filter((line) => line.startsWith('- ')).length;

const collectUnfinishedText = (path: string, content: string): readonly string[] =>
  UNFINISHED_TEXT_PATTERN.test(content)
    ? [`${path} still contains template placeholders or unfinished text`]
    : [];

interface SkillFrontmatter {
  readonly description: string;
  readonly name: string;
}

/**
 * Agent-mode output is free-form, so validation checks the generated skill's
 * structure instead of trusting substring matches for headings and metadata.
 */
const parseSkillFrontmatter = (content: string): SkillFrontmatter | undefined => {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(content);
  if (!match) {
    return undefined;
  }

  const fields = new Map<string, string>();
  for (const line of (match[1] ?? '').split('\n')) {
    const field = /^([a-z][a-z0-9-]*):\s*(.+)$/u.exec(line);
    if (field?.[1] && field[2]) {
      fields.set(field[1], field[2].trim());
    }
  }

  const name = fields.get('name');
  const description = fields.get('description');
  if (!name || !description) {
    return undefined;
  }
  return { description, name };
};

const validateRuleDocument = (content: string): readonly string[] => {
  const errors: string[] = [];
  const frontmatter = /^---\n([\s\S]*?)\n---\n/u.exec(content)?.[1];

  if (!frontmatter) {
    errors.push(`${RULE_PATH} must start with YAML frontmatter`);
    return errors;
  }

  if (!/^trigger: always_on$/mu.test(frontmatter)) {
    errors.push(`${RULE_PATH} frontmatter must set trigger: always_on`);
  }
  if (!/^alwaysApply: true$/mu.test(frontmatter)) {
    errors.push(`${RULE_PATH} frontmatter must set alwaysApply: true`);
  }
  if (!/^description:\s*\S+/mu.test(frontmatter)) {
    errors.push(`${RULE_PATH} frontmatter must set a non-empty description`);
  }

  const lineCount = countLines(content);
  if (lineCount < RULE_MIN_LINES || lineCount > RULE_MAX_LINES) {
    errors.push(`${RULE_PATH} must be between ${RULE_MIN_LINES} and ${RULE_MAX_LINES} lines`);
  }
  if (content.length > RULE_MAX_CHARS) {
    errors.push(`${RULE_PATH} must stay within ${RULE_MAX_CHARS} characters`);
  }
  if (countBullets(content) < RULE_MIN_BULLETS) {
    errors.push(`${RULE_PATH} must contain at least ${RULE_MIN_BULLETS} guidance bullets`);
  }
  errors.push(...collectUnfinishedText(RULE_PATH, content));

  return errors;
};

interface SkillContract {
  readonly minBullets: number;
  readonly minLines: number;
  readonly name: string;
  readonly path: string;
  readonly requiredHeadings: readonly string[];
}

const validateSkillDocument = (contract: SkillContract, content: string): readonly string[] => {
  const { minBullets, minLines, name, path, requiredHeadings } = contract;
  const errors: string[] = [];
  const frontmatter = parseSkillFrontmatter(content);

  if (!frontmatter) {
    errors.push(`${path} must start with frontmatter declaring name and description`);
  } else {
    if (frontmatter.name !== name) {
      errors.push(`${path} must declare name: ${name}`);
    }
    if (!frontmatter.description.startsWith('Use when')) {
      errors.push(`${path} description must state when the skill applies`);
    }
    if (frontmatter.description.length > 1024) {
      errors.push(`${path} description must be 1024 characters or fewer`);
    }
  }

  for (const heading of requiredHeadings) {
    if (!content.includes(`\n${heading}\n`)) {
      errors.push(`${path} is missing section: ${heading}`);
    }
  }

  if (countLines(content) < minLines) {
    errors.push(`${path} must be at least ${minLines} lines`);
  }
  if (countBullets(content) < minBullets) {
    errors.push(`${path} must contain at least ${minBullets} guidance bullets`);
  }

  errors.push(...collectUnfinishedText(path, content));

  if (/\]\(\.?\/?\.agents\//u.test(content)) {
    errors.push(`${path} must reference repository paths as inline code, not relative links`);
  }

  return errors;
};

const CODE_QUALITY_REVIEW_CONTRACT: SkillContract = {
  minBullets: SKILL_MIN_BULLETS,
  minLines: SKILL_MIN_LINES,
  name: CODE_QUALITY_REVIEW_SKILL_NAME,
  path: CODE_QUALITY_REVIEW_SKILL_PATH,
  requiredHeadings: REQUIRED_SKILL_HEADINGS,
};

const hasInlinePath = (content: string, path: string): boolean => content.includes(`\`${path}\``);

const validateCodingStandardsFiles = (
  files: Readonly<Record<string, string>>,
): readonly string[] => {
  const errors: string[] = [];
  const rule = files[RULE_PATH];
  const reviewSkill = files[CODE_QUALITY_REVIEW_SKILL_PATH];

  if (!rule) {
    errors.push(`Missing ${RULE_PATH}`);
  } else {
    errors.push(...collectMissing(RULE_PATH, rule, REQUIRED_RULE_TEXTS));
    errors.push(...validateRuleDocument(rule));
    errors.push(...collectGeneratorReferences(RULE_PATH, rule));
    if (RULE_SKILL_DEPENDENCY_PATTERN.test(rule)) {
      errors.push(`${RULE_PATH} must stand alone: it must not reference an on-demand skill`);
    }
  }

  if (!reviewSkill) {
    errors.push(`Missing ${CODE_QUALITY_REVIEW_SKILL_PATH}`);
  } else {
    errors.push(
      ...collectMissing(CODE_QUALITY_REVIEW_SKILL_PATH, reviewSkill, REQUIRED_SKILL_TEXTS),
    );
    errors.push(...validateSkillDocument(CODE_QUALITY_REVIEW_CONTRACT, reviewSkill));
    errors.push(...collectGeneratorReferences(CODE_QUALITY_REVIEW_SKILL_PATH, reviewSkill));
  }

  return errors;
};

export const codingStandardsPack: PackDefinition<CodingStandardsConfig> = {
  configSchema: codingStandardsConfigSchema,
  detect: detectCodingStandardsConfig,
  filePaths: [RULE_PATH, CODE_QUALITY_REVIEW_SKILL_PATH],
  id: 'coding-standards',
  render: renderCodingStandardsPack,
  /**
   * Guards the shipped guide's packaging, not generation quality: it detects a
   * truncated or drifted `references/coding-standards.md` in an installed
   * skill. Generation quality is covered by `validate`.
   */
  validateAgentGuide: (content) =>
    collectMissing('coding-standards agent guide', content, REQUIRED_AGENT_GUIDE_TEXTS),
  validateAgentsBlock: (content) => {
    const errors: string[] = [];
    if (!hasInlinePath(content, RULE_PATH)) {
      errors.push(`AGENTS block must reference ${RULE_PATH} as inline code`);
    }
    if (!hasInlinePath(content, CODE_QUALITY_REVIEW_SKILL_PATH)) {
      errors.push(`AGENTS block must reference ${CODE_QUALITY_REVIEW_SKILL_PATH} as inline code`);
    }
    return errors;
  },
  validate: validateCodingStandardsFiles,
  // Bump when the rendered templates change; `acli check` reports this value.
  version: '1.0.0',
};
