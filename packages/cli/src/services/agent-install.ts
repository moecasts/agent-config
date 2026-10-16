import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgentConfigurator } from '@cocasts/agent-config-agent';
import {
  applyFileChanges,
  FileConflictError,
  prepareFileChanges,
  sha256,
} from '@cocasts/agent-config-core';
import { readOptionalFile } from './project.ts';

const SKILL_FILES = ['SKILL.md', 'references/git-commit.md'] as const;
const INSTALL_PATH = '.agents/skills/agent-configurator';

export const resolveBundledAgentConfigurator = async (): Promise<string> => {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDirectory, 'assets/agent-skill/agent-configurator'),
    resolve(moduleDirectory, '../../dist/assets/agent-skill/agent-configurator'),
  ];

  for (const candidate of candidates) {
    try {
      await access(resolve(candidate, 'SKILL.md'));
      return candidate;
    } catch {
      // Try the next development or bundled asset location.
    }
  }

  throw new Error('Bundled agent-configurator assets are missing; run the CLI build first');
};

export const installAgentConfigurator = async (root: string, sourceRoot: string): Promise<void> => {
  const validationErrors = await validateAgentConfigurator(sourceRoot);
  if (validationErrors.length > 0) {
    throw new Error(`Bundled agent-configurator is invalid:\n${validationErrors.join('\n')}`);
  }

  const inputs = await Promise.all(
    SKILL_FILES.map(async (path) => {
      const content = await readFile(resolve(sourceRoot, path), 'utf8');
      const destination = `${INSTALL_PATH}/${path}`;
      const current = await readOptionalFile(resolve(root, destination));
      if (current !== undefined && current !== content) {
        throw new FileConflictError(destination, 'has local changes');
      }
      return {
        content,
        path: destination,
        ...(current === undefined ? {} : { previousHash: sha256(current) }),
      };
    }),
  );

  const changes = await prepareFileChanges(root, inputs);
  await applyFileChanges(root, changes);
};
