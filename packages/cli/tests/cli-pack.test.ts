import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectStateSchema } from '@cocasts/agent-config-core';
import {
  applyCliPackPlan,
  checkCliPack,
  loadCliPackConfig,
  prepareCliPack,
} from '../src/services/cli-pack.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

const createProject = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'agent-config-cli-pack-'));
  temporaryDirectories.push(root);
  await writeFile(join(root, 'package.json'), '{"name":"example","private":true}\n');
  await writeFile(join(root, 'AGENTS.md'), '# Existing project instructions\n');
  return root;
};

const config = {
  agentsScope: 'root/agents',
  docsScope: 'root',
  extraScopes: [],
  rootScope: 'root',
  scopes: [{ path: 'packages/image-view', scope: 'image-view' }],
};

describe('CLI-managed pack lifecycle', () => {
  test('plans without writing, installs, and checks deterministic output', async () => {
    const root = await createProject();
    const plan = await prepareCliPack(root, 'git-commit', 'install', config);

    await expect(readFile(join(root, '.agent-config.json'), 'utf8')).rejects.toThrow();
    expect(plan.changes.some((change) => change.path === 'AGENTS.md')).toBe(true);

    await applyCliPackPlan(root, plan);

    expect(await checkCliPack(root, 'git-commit')).toEqual([]);
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toContain(
      '# Existing project instructions',
    );
    expect(await readFile(join(root, '.agents/rules/git-commit.mdc'), 'utf8')).toContain(
      'packages/image-view',
    );
    const state = projectStateSchema.parse(
      JSON.parse(await readFile(join(root, '.agents/.agent-config-state.json'), 'utf8')),
    );
    expect(state.packs['git-commit']?.mode).toBe('cli');
  });

  test('configures scopes and updates only from committed project config', async () => {
    const root = await createProject();
    await applyCliPackPlan(root, await prepareCliPack(root, 'git-commit', 'install', config));
    await applyCliPackPlan(
      root,
      await prepareCliPack(root, 'git-commit', 'configure', {
        ...config,
        extraScopes: ['infra'],
      }),
    );

    const stored = await loadCliPackConfig(root, 'git-commit');
    expect(stored.extraScopes).toEqual(['infra']);
    const updatePlan = await prepareCliPack(root, 'git-commit', 'update');
    expect(updatePlan.config).toEqual(stored);
    expect(await readFile(join(root, '.agents/rules/git-commit.mdc'), 'utf8')).toContain(
      'Additional project scopes: `infra`.',
    );
  });

  test('reports drift and refuses to update an agent-owned pack', async () => {
    const root = await createProject();
    await applyCliPackPlan(root, await prepareCliPack(root, 'git-commit', 'install', config));
    await writeFile(join(root, '.agents/rules/git-commit.mdc'), 'manual edit');

    expect(await checkCliPack(root, 'git-commit')).toContain(
      '.agents/rules/git-commit.mdc has drifted from its recorded hash',
    );

    const statePath = join(root, '.agents/.agent-config-state.json');
    const state = projectStateSchema.parse(JSON.parse(await readFile(statePath, 'utf8')));
    const packState = state.packs['git-commit'];
    if (!packState) {
      throw new Error('missing test pack state');
    }
    packState.mode = 'agent';
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);

    await expect(prepareCliPack(root, 'git-commit', 'update')).rejects.toThrow(
      'managed in agent mode',
    );
  });
});
