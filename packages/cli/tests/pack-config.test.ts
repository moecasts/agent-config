import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPackConfigAdapter } from '../src/services/pack-config.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

const emptyProject = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'agent-config-adapter-'));
  temporaryDirectories.push(root);
  return root;
};

describe('pack configuration adapters', () => {
  test('coding-standards re-detects on configure and skips prompts', async () => {
    const adapter = getPackConfigAdapter('coding-standards');

    expect(adapter.prompt).toBeUndefined();
    expect(await adapter.detect(await emptyProject())).toEqual({
      commands: { format: null, lint: null, test: null, typecheck: null, verify: null },
      language: null,
      packageManager: null,
    });
    expect(adapter.merge({ language: 'typescript' }, { language: 'go' })).toEqual({
      language: 'typescript',
    });
  });

  test('git-commit keeps its interactive adapter', () => {
    const adapter = getPackConfigAdapter('git-commit');

    expect(typeof adapter.prompt).toBe('function');
    expect(typeof adapter.merge).toBe('function');
  });

  test('rejects unknown packs', () => {
    expect(() => getPackConfigAdapter('unknown-pack')).toThrow('Unknown pack: unknown-pack');
  });
});
