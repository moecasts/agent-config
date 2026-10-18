import { resolve } from 'node:path';
import {
  applyFileChanges,
  assertInstallationMode,
  extractManagedBlock,
  FileConflictError,
  type PreparedFileChange,
  type ProjectState,
  prepareFileChanges,
  sha256,
  upsertManagedBlock,
} from '@cocasts/agent-config-core';
import { getPack } from '@cocasts/agent-config-packs';
import {
  CONFIG_PATH,
  loadProjectConfig,
  loadProjectState,
  readOptionalFile,
  resolveAgentsFile,
  STATE_PATH,
} from './project.ts';

export type CliPackOperation = 'configure' | 'install' | 'update';

export interface CliPackPlan {
  changes: readonly PreparedFileChange[];
  config: unknown;
  operation: CliPackOperation;
  packId: string;
}

/** Pack ids recorded in project state, in install order. */
export const installedPackIds = async (root: string): Promise<readonly string[]> => {
  const { state } = await loadProjectState(root);
  return Object.keys(state.packs);
};

export const loadCliPackConfig = async (root: string, packId: string): Promise<unknown> => {
  const pack = getPack(packId);
  const { config } = await loadProjectConfig(root);
  const packConfig = config.packs[packId];
  if (packConfig === undefined) {
    throw new Error(`Pack is not configured: ${packId}`);
  }
  return pack.configSchema.parse(packConfig);
};

export const prepareCliPack = async (
  root: string,
  packId: string,
  operation: CliPackOperation,
  requestedConfig?: unknown,
): Promise<CliPackPlan> => {
  const pack = getPack(packId);
  const [{ config: projectConfig, content: configContent }, { state, content: stateContent }] =
    await Promise.all([loadProjectConfig(root), loadProjectState(root)]);
  const currentPackState = state.packs[packId];

  if (operation === 'install' && currentPackState) {
    throw new Error(`Pack is already installed: ${packId}`);
  }
  if (operation !== 'install' && !currentPackState) {
    throw new Error(`Pack is not installed: ${packId}`);
  }
  assertInstallationMode(state, packId, 'cli');

  const parsedConfig =
    operation === 'update'
      ? await loadCliPackConfig(root, packId)
      : pack.configSchema.parse(requestedConfig);
  const rendered = await pack.render(parsedConfig);
  const agentsFile = await resolveAgentsFile(root, operation === 'install');
  const currentAgentsBlock = extractManagedBlock(agentsFile.content, packId);

  if (currentPackState) {
    if (currentAgentsBlock === undefined || !currentPackState.agentsBlock) {
      throw new FileConflictError(agentsFile.path, 'managed AGENTS block is missing');
    }
    if (sha256(currentAgentsBlock) !== currentPackState.agentsBlock.hash) {
      throw new FileConflictError(agentsFile.path, 'managed AGENTS block has changed');
    }
  } else if (currentAgentsBlock !== undefined) {
    throw new FileConflictError(
      agentsFile.path,
      'AGENTS block already exists without managed state',
    );
  }

  const nextAgentsContent = upsertManagedBlock(agentsFile.content, packId, rendered.agentsBlock);
  const nextProjectConfig = {
    ...projectConfig,
    packs: {
      ...projectConfig.packs,
      [packId]: parsedConfig,
    },
  };
  const nextState: ProjectState = {
    ...state,
    packs: {
      ...state.packs,
      [packId]: {
        agentsBlock: {
          hash: sha256(rendered.agentsBlock.trimEnd()),
          path: agentsFile.path,
        },
        files: Object.fromEntries(rendered.files.map((file) => [file.path, sha256(file.content)])),
        mode: 'cli',
        version: pack.version,
      },
    },
  };

  const inputs = [
    ...rendered.files.map((file) => ({
      ...file,
      ...(currentPackState?.files[file.path]
        ? { previousHash: currentPackState.files[file.path] }
        : {}),
    })),
    {
      content: nextAgentsContent,
      path: agentsFile.path,
      ...(agentsFile.exists ? { previousHash: sha256(agentsFile.content) } : {}),
    },
    {
      content: `${JSON.stringify(nextProjectConfig, null, 2)}\n`,
      path: CONFIG_PATH,
      ...(configContent === undefined ? {} : { previousHash: sha256(configContent) }),
    },
    {
      content: `${JSON.stringify(nextState, null, 2)}\n`,
      path: STATE_PATH,
      ...(stateContent === undefined ? {} : { previousHash: sha256(stateContent) }),
    },
  ];
  const changes = await prepareFileChanges(root, inputs);

  return { changes, config: parsedConfig, operation, packId };
};

export const applyCliPackPlan = (root: string, plan: CliPackPlan): Promise<void> =>
  applyFileChanges(root, plan.changes);

/**
 * Validates an installed pack without writing anything. Handles both ownership
 * modes: CLI-owned packs are re-rendered from `.agent-config.json` and compared
 * against it, while agent-owned packs are checked against their recorded hashes
 * and the pack's own `validate` contract.
 */
export const checkCliPack = async (root: string, packId: string): Promise<readonly string[]> => {
  const pack = getPack(packId);
  const { state } = await loadProjectState(root);
  const packState = state.packs[packId];
  if (!packState) {
    return [`Pack is not installed: ${packId}`];
  }

  const rendered =
    packState.mode === 'cli' ? await pack.render(await loadCliPackConfig(root, packId)) : undefined;
  const expectedFiles = new Map((rendered?.files ?? []).map((file) => [file.path, file.content]));

  const errors: string[] = [];
  const contents: Record<string, string> = {};

  for (const path of pack.filePaths) {
    const content = await readOptionalFile(resolve(root, path));
    if (content === undefined) {
      errors.push(`${path} is missing`);
      continue;
    }
    contents[path] = content;
    const recordedHash = packState.files[path];
    if (recordedHash !== sha256(content)) {
      errors.push(`${path} has drifted from its recorded hash`);
      continue;
    }
    const expectedContent = expectedFiles.get(path);
    if (expectedContent !== undefined && sha256(expectedContent) !== recordedHash) {
      errors.push(`${path} does not match the current pack ${pack.version} output`);
    }
  }
  errors.push(...pack.validate(contents));

  const agentsFile = await resolveAgentsFile(root);
  const agentsBlock = extractManagedBlock(agentsFile.content, packId);
  if (agentsBlock === undefined || !packState.agentsBlock) {
    errors.push(`${agentsFile.path} is missing the ${packId} managed block`);
  } else {
    const currentHash = sha256(agentsBlock);
    if (currentHash !== packState.agentsBlock.hash) {
      errors.push(`${agentsFile.path} managed block has drifted from its recorded hash`);
    } else if (rendered !== undefined && currentHash !== sha256(rendered.agentsBlock.trimEnd())) {
      errors.push(
        `${agentsFile.path} managed block does not match the current pack ${pack.version} output`,
      );
    }
    errors.push(...pack.validateAgentsBlock(agentsBlock));
  }

  return errors;
};
