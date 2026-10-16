import { describe, expect, test } from 'bun:test';

const runHelp = async (...arguments_: string[]): Promise<{ exitCode: number; stdout: string }> => {
  const process = Bun.spawn(['bun', 'run', 'packages/cli/src/cli.ts', ...arguments_, '--help'], {
    cwd: new URL('../../../', import.meta.url).pathname,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stdout] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
  ]);
  return { exitCode, stdout };
};

describe('acli entry point', () => {
  test('prints command help', async () => {
    const { exitCode, stdout } = await runHelp();

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: acli');
  });

  test('lists registered packs in pack command help', async () => {
    const install = await runHelp('install');
    const adopt = await runHelp('agent', 'adopt');

    expect(install.exitCode).toBe(0);
    expect(adopt.exitCode).toBe(0);
    expect(install.stdout).toContain('git-commit');
    expect(adopt.stdout).toContain('git-commit');
  });
});
