import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDirectExecution } from '../src/cli.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('CLI entry detection', () => {
  test('recognizes a package-manager bin symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-config-entry-'));
    temporaryDirectories.push(root);
    const target = join(root, 'dist/cli.js');
    const link = join(root, 'node_modules/.bin/acli');
    await mkdir(join(root, 'dist'), { recursive: true });
    await mkdir(join(root, 'node_modules/.bin'), { recursive: true });
    await writeFile(target, '');
    await symlink(target, link);

    expect(await isDirectExecution(pathToFileURL(target), link)).toBe(true);
  });
});
