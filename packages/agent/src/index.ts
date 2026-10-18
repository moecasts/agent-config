import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPack, packAgentGuides, packIds } from '@cocasts/agent-config-packs';

const defaultSkillRoot = fileURLToPath(new URL('../skills/agent-configurator', import.meta.url));

const referencePath = (packId: string): string => `references/${packId}.md`;

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
    ...packIds.map(async (packId) => {
      const guide = await packAgentGuides[packId]();
      await writeFile(resolve(destination, referencePath(packId)), guide, 'utf8');
    }),
  ]);
};

export const validateAgentConfigurator = async (root: string): Promise<readonly string[]> => {
  const skill = await readOptional(resolve(root, 'SKILL.md'));
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
      ...packIds.map((packId) => [`references/${packId}.md`, `${packId} pack guide`] as const),
    ] as const;
    for (const [requiredText, label] of requiredGuidance) {
      if (!skill.includes(requiredText)) {
        errors.push(`SKILL.md is missing required guidance: ${label}`);
      }
    }
  }

  const guides = await Promise.all(
    packIds.map(async (packId) => ({
      content: await readOptional(resolve(root, referencePath(packId))),
      packId,
    })),
  );
  for (const { content, packId } of guides) {
    if (content === undefined) {
      errors.push(`${referencePath(packId)} is missing`);
      continue;
    }
    errors.push(...getPack(packId).validateAgentGuide(content));
  }

  return errors;
};
