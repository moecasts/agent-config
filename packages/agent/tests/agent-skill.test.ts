import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readCodingStandardsAgentGuide,
  readGitCommitAgentGuide,
} from '@cocasts/agent-config-packs';
import { assembleAgentConfigurator, validateAgentConfigurator } from '../src/index.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

const temporaryDirectory = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), 'agent-config-agent-'));
  temporaryDirectories.push(path);
  return path;
};

describe('agent-configurator assembly', () => {
  test('assembles a valid project skill with the canonical pack guide', async () => {
    const root = await temporaryDirectory();
    const destination = join(root, 'agent-configurator');

    await assembleAgentConfigurator(destination);

    expect(await validateAgentConfigurator(destination)).toEqual([]);
    expect(await readFile(join(destination, 'references/git-commit.md'), 'utf8')).toBe(
      await readGitCommitAgentGuide(),
    );
    expect(await readFile(join(destination, 'references/coding-standards.md'), 'utf8')).toBe(
      await readCodingStandardsAgentGuide(),
    );
    const skill = await readFile(join(destination, 'SKILL.md'), 'utf8');
    expect(skill).toContain('name: agent-configurator');
    expect(skill).toContain(
      'Use when installing or updating project-specific agent rules and skills',
    );
    expect(skill).toContain('.agents/rules');
    expect(skill).toContain('acli agent adopt');
  });

  test('reports invalid skill metadata and missing references', async () => {
    const root = await temporaryDirectory();
    await writeFile(join(root, 'SKILL.md'), 'not frontmatter');

    expect(await validateAgentConfigurator(root)).toEqual([
      'SKILL.md must contain valid agent-configurator frontmatter',
      'references/git-commit.md is missing',
      'references/coding-standards.md is missing',
    ]);
  });

  test('reports missing ownership and adoption guidance', async () => {
    const root = await temporaryDirectory();
    const destination = join(root, 'agent-configurator');
    await assembleAgentConfigurator(destination);
    const skillPath = join(destination, 'SKILL.md');
    const skill = await readFile(skillPath, 'utf8');
    await writeFile(
      skillPath,
      skill
        .replace('mode: "cli"', 'mode: "other"')
        .replace('acli agent adopt <pack>', 'manual adoption'),
    );

    expect(await validateAgentConfigurator(destination)).toEqual([
      'SKILL.md is missing required guidance: CLI ownership protection',
      'SKILL.md is missing required guidance: agent adoption',
    ]);
  });
});
