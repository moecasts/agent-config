import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleAgentConfigurator } from '@cocasts/agent-config-agent';
import {
  installAgentConfigurator,
  resolveBundledAgentConfigurator,
} from '../src/services/agent-install.ts';

const temporaryDirectories: string[] = [];

beforeAll(async () => {
  const build = Bun.spawn(['bun', 'run', 'build'], {
    cwd: new URL('../../../', import.meta.url).pathname,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    build.exited,
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`CLI build failed:\n${stdout}\n${stderr}`);
  }
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

const temporaryDirectory = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), 'agent-config-install-agent-'));
  temporaryDirectories.push(path);
  return path;
};

describe('project agent skill installation', () => {
  test('resolves built assets with standard file URL semantics', async () => {
    const source = await resolveBundledAgentConfigurator();

    expect(await readFile(join(source, 'SKILL.md'), 'utf8')).toContain('name: agent-configurator');
  });

  test('installs idempotently and refuses to overwrite a local edit', async () => {
    const sourceRoot = await temporaryDirectory();
    const projectRoot = await temporaryDirectory();
    await assembleAgentConfigurator(sourceRoot);

    await installAgentConfigurator(projectRoot, sourceRoot);
    await installAgentConfigurator(projectRoot, sourceRoot);

    const installedSkill = join(projectRoot, '.agents/skills/agent-configurator/SKILL.md');
    expect(await readFile(installedSkill, 'utf8')).toContain('name: agent-configurator');
    expect(
      await readFile(
        join(projectRoot, '.agents/skills/agent-configurator/references/coding-standards.md'),
        'utf8',
      ),
    ).toContain('KISS');
    await writeFile(installedSkill, 'local edit');

    await expect(installAgentConfigurator(projectRoot, sourceRoot)).rejects.toThrow(
      'has local changes',
    );
  });

  test('runs agent install from the built Node CLI', async () => {
    const projectRoot = await temporaryDirectory();
    const cli = join(import.meta.dir, '../dist/cli.js');
    const process = Bun.spawn(['node', cli, 'agent', 'install', '--cwd', projectRoot], {
      stderr: 'pipe',
      stdout: 'pipe',
    });
    const [exitCode, stderr] = await Promise.all([
      process.exited,
      new Response(process.stderr).text(),
    ]);

    expect(exitCode, stderr).toBe(0);
    expect(
      await readFile(join(projectRoot, '.agents/skills/agent-configurator/SKILL.md'), 'utf8'),
    ).toContain('name: agent-configurator');
  });

  test('installs coding-standards from the built Node CLI', async () => {
    const projectRoot = await temporaryDirectory();
    await writeFile(join(projectRoot, 'AGENTS.md'), '# Existing\n');
    const cli = join(import.meta.dir, '../dist/cli.js');
    const process = Bun.spawn(
      ['node', cli, 'install', 'coding-standards', '--yes', '--cwd', projectRoot],
      { stderr: 'pipe', stdout: 'pipe' },
    );
    const [exitCode, stderr] = await Promise.all([
      process.exited,
      new Response(process.stderr).text(),
    ]);

    expect(exitCode, stderr).toBe(0);
    expect(
      await readFile(join(projectRoot, '.agents/rules/coding-standards.mdc'), 'utf8'),
    ).toContain('KISS');
    expect(
      await readFile(join(projectRoot, '.agents/skills/code-quality-review/SKILL.md'), 'utf8'),
    ).toContain('name: code-quality-review');
    expect(await readFile(join(projectRoot, 'AGENTS.md'), 'utf8')).toContain(
      'agent-config:coding-standards:start',
    );
  });
});
