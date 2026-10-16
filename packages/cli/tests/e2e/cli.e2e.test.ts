import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const temporaryDirectories: string[] = [];
const workspaceRoot = resolve(import.meta.dir, '../../../../');
const cliEntry = resolve(workspaceRoot, 'packages/cli/src/cli.ts');

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

const runCli = async (
  projectRoot: string,
  ...arguments_: string[]
): Promise<{ exitCode: number; output: string }> => {
  const process = Bun.spawn(['bun', 'run', cliEntry, ...arguments_, '--cwd', projectRoot], {
    cwd: workspaceRoot,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, output: `${stdout}\n${stderr}` };
};

const createDelegatedProject = async (): Promise<string> => {
  const root = await mkdtemp(`${tmpdir()}/agent-config-e2e-`);
  temporaryDirectories.push(root);
  await mkdir(resolve(root, 'packages/pi-image-view'), { recursive: true });
  await mkdir(resolve(root, '.agents'), { recursive: true });
  await writeFile(
    resolve(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'pi-extensions',
        private: true,
        workspaces: ['packages/*'],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    resolve(root, 'packages/pi-image-view/package.json'),
    '{"name":"@cocasts/pi-image-view","private":true}\n',
  );
  await writeFile(resolve(root, 'AGENTS.md'), './.agents/AGENTS.md\n');
  await writeFile(resolve(root, '.agents/AGENTS.md'), '# Existing delegated instructions\n');
  return root;
};

describe('acli end-to-end', () => {
  test('installs, updates, checks, and detects drift with delegated AGENTS', async () => {
    const root = await createDelegatedProject();

    const install = await runCli(root, 'install', 'git-commit', '--yes');
    expect(install.exitCode, install.output).toBe(0);
    expect(await readFile(resolve(root, 'AGENTS.md'), 'utf8')).toBe('./.agents/AGENTS.md\n');
    expect(await readFile(resolve(root, '.agents/AGENTS.md'), 'utf8')).toContain(
      'agent-config:git-commit:start',
    );

    const check = await runCli(root, 'check', 'git-commit');
    expect(check.exitCode, check.output).toBe(0);

    const update = await runCli(root, 'update', 'git-commit', '--yes');
    expect(update.exitCode, update.output).toBe(0);

    await writeFile(resolve(root, '.agents/rules/git-commit.mdc'), 'manual drift\n');
    const drifted = await runCli(root, 'check', 'git-commit');
    expect(drifted.exitCode).toBe(1);
    expect(drifted.output).toContain('has drifted from its recorded hash');
  });
});
