import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  createEmptyState,
  projectStateSchema,
  upsertManagedBlock,
} from '@cocasts/agent-config-core';
import { codingStandardsPack, gitCommitPack } from '@cocasts/agent-config-packs';
import { adoptAgentPack } from '../src/services/agent.ts';
import { checkCliPack } from '../src/services/cli-pack.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

const createGeneratedProject = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'agent-config-adopt-'));
  temporaryDirectories.push(root);
  const rendered = await gitCommitPack.render({
    agentsScope: 'root/agents',
    docsScope: 'root',
    extraScopes: [],
    rootScope: 'root',
    scopes: [{ path: 'packages/image-view', scope: 'image-view' }],
  });

  for (const file of rendered.files) {
    const path = join(root, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.content);
  }
  await writeFile(
    join(root, 'AGENTS.md'),
    upsertManagedBlock('# Existing\n', 'git-commit', rendered.agentsBlock),
  );
  return root;
};

const codingStandardsConfig = {
  commands: {
    format: 'bun run format:check',
    lint: 'bun run lint',
    test: 'bun test',
    typecheck: 'bun run typecheck',
    verify: 'bun run verify',
  },
  language: 'typescript',
  packageManager: 'bun',
};

const createCodingStandardsProject = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'agent-config-adopt-'));
  temporaryDirectories.push(root);
  const rendered = await codingStandardsPack.render(codingStandardsConfig);

  for (const file of rendered.files) {
    const path = join(root, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.content);
  }
  await writeFile(
    join(root, 'AGENTS.md'),
    upsertManagedBlock('# Existing\n', 'coding-standards', rendered.agentsBlock),
  );
  return root;
};

describe('agent adoption', () => {
  test('validates generated files and records agent ownership', async () => {
    const root = await createGeneratedProject();

    await adoptAgentPack(root, 'git-commit');

    const state = projectStateSchema.parse(
      JSON.parse(await readFile(join(root, '.agents/.agent-config-state.json'), 'utf8')),
    );
    expect(state.packs['git-commit']?.mode).toBe('agent');
    expect(Object.keys(state.packs['git-commit']?.files ?? {})).toEqual([
      '.agents/rules/git-commit.mdc',
      '.agents/skills/smart-commit/SKILL.md',
    ]);
    expect(state.packs['git-commit']?.agentsBlock?.path).toBe('AGENTS.md');
  });

  test('refuses to adopt a CLI-managed pack', async () => {
    const root = await createGeneratedProject();
    const state = createEmptyState();
    state.packs['git-commit'] = {
      files: {},
      mode: 'cli',
      version: '1.0.0',
    };
    await mkdir(join(root, '.agents'), { recursive: true });
    await writeFile(
      join(root, '.agents/.agent-config-state.json'),
      `${JSON.stringify(state, null, 2)}\n`,
    );

    await expect(adoptAgentPack(root, 'git-commit')).rejects.toThrow('managed in cli mode');
  });

  test('rejects an unrelated AGENTS managed block', async () => {
    const root = await createGeneratedProject();
    await writeFile(
      join(root, 'AGENTS.md'),
      upsertManagedBlock('# Existing\n', 'git-commit', '## Unrelated\n\nNo rule link.'),
    );

    await expect(adoptAgentPack(root, 'git-commit')).rejects.toThrow(
      'AGENTS managed block is invalid',
    );
  });

  test('adopts agent-generated coding standards', async () => {
    const root = await createCodingStandardsProject();

    await adoptAgentPack(root, 'coding-standards');

    const state = projectStateSchema.parse(
      JSON.parse(await readFile(join(root, '.agents/.agent-config-state.json'), 'utf8')),
    );
    expect(state.packs['coding-standards']?.mode).toBe('agent');
    expect(Object.keys(state.packs['coding-standards']?.files ?? {})).toEqual([
      '.agents/rules/coding-standards.mdc',
      '.agents/skills/code-quality-review/SKILL.md',
    ]);
    expect(state.packs['coding-standards']?.agentsBlock?.path).toBe('AGENTS.md');
  });

  test('checks an adopted agent-owned pack without CLI ownership', async () => {
    const root = await createCodingStandardsProject();
    await adoptAgentPack(root, 'coding-standards');

    expect(await checkCliPack(root, 'coding-standards')).toEqual([]);

    await writeFile(join(root, '.agents/rules/coding-standards.mdc'), 'hand edit');
    expect(await checkCliPack(root, 'coding-standards')).toContain(
      '.agents/rules/coding-standards.mdc has drifted from its recorded hash',
    );
  });

  test('rejects incomplete coding standards output', async () => {
    const root = await createCodingStandardsProject();
    await writeFile(join(root, '.agents/skills/code-quality-review/SKILL.md'), 'stub');

    await expect(adoptAgentPack(root, 'coding-standards')).rejects.toThrow(
      'Generated pack is invalid',
    );
  });
});
