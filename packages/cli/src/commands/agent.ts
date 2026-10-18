import { resolve } from 'node:path';
import { log, spinner } from '@clack/prompts';
import type { Command } from 'commander';
import { requiredPackArgument } from '../pack-argument.ts';
import { adoptAgentPack } from '../services/agent.ts';
import {
  installAgentConfigurator,
  resolveBundledAgentConfigurator,
} from '../services/agent-install.ts';
import { runWithSpinner } from '../ui.ts';

interface TargetOptions {
  cwd: string;
}

export const registerAgentCommands = (program: Command): void => {
  const agent = program
    .command('agent')
    .description('Manage the project-level agent configurator.');

  agent
    .command('install')
    .description('Install the agent-configurator skill into the target project.')
    .option('--cwd <path>', 'Target project directory.', process.cwd())
    .action(async (options: TargetOptions) => {
      await runWithSpinner(
        spinner(),
        'Installing agent-configurator',
        'Agent configurator installed',
        async () => {
          const source = await resolveBundledAgentConfigurator();
          await installAgentConfigurator(resolve(options.cwd), source);
        },
      );
      log.info(
        'Invoke agent-configurator and ask it to install or update a pack, such as git-commit or coding-standards.',
      );
    });

  agent
    .command('adopt')
    .description('Validate generated pack files and record agent ownership.')
    .addArgument(requiredPackArgument('Pack to adopt.'))
    .option('--cwd <path>', 'Target project directory.', process.cwd())
    .action(async (pack: string, options: TargetOptions) => {
      await adoptAgentPack(resolve(options.cwd), pack);
      log.success(`Adopted ${pack} in agent mode.`);
    });
};
