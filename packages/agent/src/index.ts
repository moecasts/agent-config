import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGitCommitAgentGuide } from '@cocasts/agent-config-packs';

const defaultSkillRoot = fileURLToPath(new URL('../skills/agent-configurator', import.meta.url));

const readOptional = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

export const assembleAgentConfigurator = async (
  destination: string,
  skillRoot = defaultSkillRoot,
): Promise<void> => {
  await rm(destination, { force: true, recursive: true });
  await mkdir(resolve(destination, 'references'), { recursive: true });
  await Promise.all([
    copyFile(resolve(skillRoot, 'SKILL.md'), resolve(destination, 'SKILL.md')),
    readGitCommitAgentGuide().then((guide) =>
      writeFile(resolve(destination, 'references/git-commit.md'), guide, 'utf8'),
    ),
  ]);
};

export const validateAgentConfigurator = async (root: string): Promise<readonly string[]> => {
  const [skill, guide] = await Promise.all([
    readOptional(resolve(root, 'SKILL.md')),
    readOptional(resolve(root, 'references/git-commit.md')),
  ]);
  const errors: string[] = [];

  const hasValidFrontmatter =
    skill !== undefined &&
    /^---\r?\nname: agent-configurator\r?\ndescription: Use when [^\r\n]+\r?\n---\r?\n/.test(skill);
  if (!hasValidFrontmatter) {
    errors.push('SKILL.md must contain valid agent-configurator frontmatter');
  } else {
    const requiredGuidance = [
      ['.agents/rules', 'rules output path'],
      ['.agents/skills', 'skills output path'],
      ['mode: "cli"', 'CLI ownership protection'],
      ['AGENTS.md', 'AGENTS preservation'],
      ['staged, unstaged, untracked', 'Git staging context'],
      ['acli agent adopt <pack>', 'agent adoption'],
    ] as const;
    for (const [requiredText, label] of requiredGuidance) {
      if (!skill.includes(requiredText)) {
        errors.push(`SKILL.md is missing required guidance: ${label}`);
      }
    }
  }
  if (!guide) {
    errors.push('references/git-commit.md is missing');
  } else if (!guide.includes('staged, unstaged, and untracked') || !guide.includes('AGENTS.md')) {
    errors.push('references/git-commit.md is missing required pack guidance');
  }

  return errors;
};
