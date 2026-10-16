import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '@clack/prompts';
import { Command } from 'commander';
import { registerAgentCommands } from './commands/agent.ts';
import { registerPackCommands } from './commands/pack.ts';

export const createProgram = (): Command => {
  const program = new Command()
    .name('acli')
    .description('Install project-aware rules and skills for coding agents.')
    .version('0.1.0');

  registerPackCommands(program);
  registerAgentCommands(program);

  return program;
};

export const runCli = async (argv = process.argv): Promise<void> => {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

export const isDirectExecution = async (
  moduleUrl: URL | string,
  entryPath: string | undefined,
): Promise<boolean> => {
  if (!entryPath) {
    return false;
  }
  try {
    const [modulePath, executablePath] = await Promise.all([
      realpath(fileURLToPath(moduleUrl)),
      realpath(resolve(entryPath)),
    ]);
    return modulePath === executablePath;
  } catch {
    return false;
  }
};

const entryPath = process.argv[1];

if (await isDirectExecution(import.meta.url, entryPath)) {
  await runCli();
}
