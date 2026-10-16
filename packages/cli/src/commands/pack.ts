import { resolve } from 'node:path';
import { cancel, confirm, intro, isCancel, log, note, outro, spinner, text } from '@clack/prompts';
import {
  detectGitCommitConfig,
  type GitCommitConfig,
  gitCommitConfigSchema,
} from '@cocasts/agent-config-packs';
import type { Command } from 'commander';
import { optionalPackArgument, requiredPackArgument } from '../pack-argument.ts';
import {
  applyCliPackPlan,
  type CliPackOperation,
  checkCliPack,
  loadCliPackConfig,
  prepareCliPack,
} from '../services/cli-pack.ts';
import {
  formatPlan,
  formatScopeMappings,
  parseCommaList,
  parseScopeMappings,
  runWithSpinner,
} from '../ui.ts';

interface TargetOptions {
  cwd: string;
  yes?: boolean;
}

const promptForConfig = async (initial: GitCommitConfig): Promise<GitCommitConfig | undefined> => {
  const mappings = await text({
    message: 'Workspace scopes (path=scope, comma separated)',
    defaultValue: '',
    initialValue: formatScopeMappings(initial.scopes),
    placeholder: 'none',
    validate: (value) => {
      try {
        parseScopeMappings(value);
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  });
  if (isCancel(mappings)) {
    cancel('Installation cancelled.');
    return undefined;
  }

  const extraScopes = await text({
    message: 'Additional scopes (comma separated, optional)',
    defaultValue: '',
    initialValue: initial.extraScopes.join(', '),
    placeholder: 'none',
  });
  if (isCancel(extraScopes)) {
    cancel('Installation cancelled.');
    return undefined;
  }

  return gitCommitConfigSchema.parse({
    ...initial,
    extraScopes: parseCommaList(extraScopes),
    scopes: parseScopeMappings(mappings),
  });
};

const mergeDetectedConfig = (
  detected: GitCommitConfig,
  current: GitCommitConfig,
): GitCommitConfig => {
  const mappings = new Map(detected.scopes.map((mapping) => [mapping.path, mapping]));
  for (const mapping of current.scopes) {
    mappings.set(mapping.path, mapping);
  }
  return {
    ...detected,
    agentsScope: current.agentsScope,
    docsScope: current.docsScope,
    extraScopes: current.extraScopes,
    rootScope: current.rootScope,
    scopes: [...mappings.values()].sort((left, right) => left.path.localeCompare(right.path)),
  };
};

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
  const detected = await runWithSpinner(
    spinner(),
    'Inspecting project workspaces',
    'Project inspection complete',
    () => detectGitCommitConfig(root),
  );
  const initial =
    operation === 'configure'
      ? mergeDetectedConfig(detected, await loadCliPackConfig(root, packId))
      : detected;
  const config = options.yes ? initial : await promptForConfig(initial);
  if (!config) {
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

const runUpdate = async (packId: string, options: TargetOptions): Promise<void> => {
  const root = resolve(options.cwd);
  intro(`acli update ${packId}`);
  const plan = await prepareCliPack(root, packId, 'update');
  if (!(await confirmPlan(plan, options.yes === true))) {
    return;
  }
  await applyCliPackPlan(root, plan);
  outro(`${packId} update complete.`);
};

const runCheck = async (packId: string, options: TargetOptions): Promise<void> => {
  const errors = await checkCliPack(resolve(options.cwd), packId);
  if (errors.length > 0) {
    for (const error of errors) {
      log.error(error);
    }
    process.exitCode = 1;
    return;
  }
  log.success(`${packId} is valid and up to date.`);
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
      .description('Render a pack from its committed project configuration.')
      .addArgument(optionalPackArgument('Pack to update.')),
    true,
  ).action((pack: string, options: TargetOptions) => runUpdate(pack, options));

  addTargetOptions(
    program
      .command('check')
      .description('Check managed files without changing them.')
      .addArgument(optionalPackArgument('Pack to check.')),
    false,
  ).action((pack: string, options: TargetOptions) => runCheck(pack, options));
};
