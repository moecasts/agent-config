import { resolve } from 'node:path';
import { cancel, confirm, intro, isCancel, log, note, outro, spinner } from '@clack/prompts';
import type { Command } from 'commander';
import { optionalPackArgument, requiredPackArgument } from '../pack-argument.ts';
import {
  applyCliPackPlan,
  type CliPackOperation,
  checkCliPack,
  installedPackIds,
  loadCliPackConfig,
  prepareCliPack,
} from '../services/cli-pack.ts';
import { getPackConfigAdapter } from '../services/pack-config.ts';
import { formatPlan, runWithSpinner } from '../ui.ts';

interface TargetOptions {
  cwd: string;
  yes?: boolean;
}

const confirmPlan = async (
  plan: Awaited<ReturnType<typeof prepareCliPack>>,
  skipConfirmation: boolean,
): Promise<boolean> => {
  note(formatPlan(plan.changes), `${plan.operation} ${plan.packId}`);
  if (skipConfirmation) {
    return true;
  }

  const approved = await confirm({
    message: 'Apply this exact file plan?',
    initialValue: false,
  });
  if (isCancel(approved) || !approved) {
    cancel('No files were changed.');
    return false;
  }
  return true;
};

const runConfiguredOperation = async (
  packId: string,
  operation: Exclude<CliPackOperation, 'update'>,
  options: TargetOptions,
): Promise<void> => {
  const root = resolve(options.cwd);
  intro(`acli ${operation} ${packId}`);
  const adapter = getPackConfigAdapter(packId);
  const detected = await runWithSpinner(
    spinner(),
    'Inspecting project configuration',
    'Project inspection complete',
    () => adapter.detect(root),
  );
  const initial =
    operation === 'configure'
      ? adapter.merge(detected, await loadCliPackConfig(root, packId))
      : detected;
  const prompt = adapter.prompt;
  const config = options.yes || !prompt ? initial : await prompt(initial);
  if (config === undefined) {
    return;
  }
  const plan = await prepareCliPack(root, packId, operation, config);
  if (!(await confirmPlan(plan, options.yes === true))) {
    return;
  }

  await runWithSpinner(
    spinner(),
    'Writing managed agent files',
    'Managed agent files written',
    () => applyCliPackPlan(root, plan),
  );
  outro(`${packId} ${operation} complete.`);
};

const runUpdate = async (packIds: readonly string[], options: TargetOptions): Promise<void> => {
  const root = resolve(options.cwd);
  for (const packId of packIds) {
    intro(`acli update ${packId}`);
    const plan = await prepareCliPack(root, packId, 'update');
    if (!(await confirmPlan(plan, options.yes === true))) {
      return;
    }
    await applyCliPackPlan(root, plan);
    outro(`${packId} update complete.`);
  }
};

const runCheck = async (packIds: readonly string[], options: TargetOptions): Promise<void> => {
  const root = resolve(options.cwd);
  for (const packId of packIds) {
    const errors = await checkCliPack(root, packId);
    if (errors.length === 0) {
      log.success(`${packId} is valid and up to date.`);
      continue;
    }
    for (const error of errors) {
      log.error(error);
    }
    process.exitCode = 1;
  }
};

/**
 * `update` and `check` without a pack argument cover every installed pack:
 * defaulting to one pack reports success while another installed pack has
 * drifted.
 */
const resolveTargetPacks = async (
  root: string,
  packId: string | undefined,
): Promise<readonly string[]> => {
  if (packId !== undefined) {
    return [packId];
  }
  const installed = await installedPackIds(root);
  if (installed.length === 0) {
    throw new Error('No packs are installed');
  }
  return installed;
};

const addTargetOptions = <T extends Command>(command: T, includeYes: boolean): T => {
  command.option('--cwd <path>', 'Target project directory.', process.cwd());
  if (includeYes) {
    command.option('-y, --yes', 'Accept detected values and the rendered file plan.');
  }
  return command;
};

export const registerPackCommands = (program: Command): void => {
  addTargetOptions(
    program
      .command('install')
      .description('Detect and install a managed pack.')
      .addArgument(requiredPackArgument('Pack to install.')),
    true,
  ).action((pack: string, options: TargetOptions) =>
    runConfiguredOperation(pack, 'install', options),
  );

  addTargetOptions(
    program
      .command('configure')
      .description('Re-detect and configure an installed pack.')
      .addArgument(requiredPackArgument('Pack to configure.')),
    true,
  ).action((pack: string, options: TargetOptions) =>
    runConfiguredOperation(pack, 'configure', options),
  );

  addTargetOptions(
    program
      .command('update')
      .description(
        'Render a pack, or every installed pack, from its committed project configuration.',
      )
      .addArgument(optionalPackArgument('Pack to update.')),
    true,
  ).action(async (pack: string | undefined, options: TargetOptions) => {
    const targets = await resolveTargetPacks(resolve(options.cwd), pack);
    await runUpdate(targets, options);
  });

  addTargetOptions(
    program
      .command('check')
      .description('Check managed files without changing them.')
      .addArgument(optionalPackArgument('Pack to check.')),
    false,
  ).action(async (pack: string | undefined, options: TargetOptions) => {
    const targets = await resolveTargetPacks(resolve(options.cwd), pack);
    await runCheck(targets, options);
  });
};
