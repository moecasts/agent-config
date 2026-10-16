import { resolve } from 'node:path';
import {
  applyFileChanges,
  assertInstallationMode,
  extractManagedBlock,
  type ProjectState,
  prepareFileChanges,
  sha256,
} from '@cocasts/agent-config-core';
import { getPack } from '@cocasts/agent-config-packs';
import { loadProjectState, readOptionalFile, resolveAgentsFile, STATE_PATH } from './project.ts';

export const adoptAgentPack = async (root: string, packId: string): Promise<void> => {
  const pack = getPack(packId);
  const { content: stateContent, state } = await loadProjectState(root);
  assertInstallationMode(state, packId, 'agent');

  const entries = await Promise.all(
    pack.filePaths.map(async (path) => {
      const content = await readOptionalFile(resolve(root, path));
      if (content === undefined) {
        throw new Error(`Generated file is missing: ${path}`);
      }
      return [path, content] as const;
    }),
  );
  const files = Object.fromEntries(entries);
  const validationErrors = pack.validate(files);
  if (validationErrors.length > 0) {
    throw new Error(`Generated pack is invalid:\n${validationErrors.join('\n')}`);
  }

  const agentsFile = await resolveAgentsFile(root);
  const agentsBlock = extractManagedBlock(agentsFile.content, packId);
  if (agentsBlock === undefined) {
    throw new Error(`AGENTS managed block is missing: ${packId}`);
  }
  const agentsBlockErrors = pack.validateAgentsBlock(agentsBlock);
  if (agentsBlockErrors.length > 0) {
    throw new Error(`AGENTS managed block is invalid:\n${agentsBlockErrors.join('\n')}`);
  }

  const nextState: ProjectState = {
    ...state,
    packs: {
      ...state.packs,
      [packId]: {
        agentsBlock: {
          hash: sha256(agentsBlock),
          path: agentsFile.path,
        },
        files: Object.fromEntries(entries.map(([path, content]) => [path, sha256(content)])),
        mode: 'agent',
        version: pack.version,
      },
    },
  };
  const nextStateContent = `${JSON.stringify(nextState, null, 2)}\n`;
  const changes = await prepareFileChanges(root, [
    {
      content: nextStateContent,
      path: STATE_PATH,
      ...(stateContent === undefined ? {} : { previousHash: sha256(stateContent) }),
    },
  ]);
  await applyFileChanges(root, changes);
};
