import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import {
  createEmptyState,
  type ProjectConfig,
  type ProjectState,
  projectConfigSchema,
  projectStateSchema,
} from '@cocasts/agent-config-core';

export const CONFIG_PATH = '.agent-config.json';
export const STATE_PATH = '.agents/.agent-config-state.json';

export const readOptionalFile = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

export const loadProjectState = async (
  root: string,
): Promise<{ content: string | undefined; state: ProjectState }> => {
  const content = await readOptionalFile(resolve(root, STATE_PATH));
  return {
    content,
    state: content ? projectStateSchema.parse(JSON.parse(content)) : createEmptyState(),
  };
};

export const loadProjectConfig = async (
  root: string,
): Promise<{ config: ProjectConfig; content: string | undefined }> => {
  const content = await readOptionalFile(resolve(root, CONFIG_PATH));
  return {
    config: content
      ? projectConfigSchema.parse(JSON.parse(content))
      : { packs: {}, schemaVersion: 1 },
    content,
  };
};

export const resolveAgentsFile = async (
  root: string,
  allowMissingRoot = false,
): Promise<{ content: string; exists: boolean; path: string }> => {
  const rootContent = await readOptionalFile(resolve(root, 'AGENTS.md'));
  if (rootContent === undefined) {
    if (allowMissingRoot) {
      return { content: '', exists: false, path: 'AGENTS.md' };
    }
    throw new Error('AGENTS.md is missing');
  }

  const trimmed = rootContent.trim();
  if (/^\.{1,2}\/[^\r\n]+\.md$/.test(trimmed)) {
    const delegated = resolve(root, trimmed);
    const relativePath = relative(resolve(root), delegated);
    if (isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith('../')) {
      throw new Error(`Delegated AGENTS path escapes the repository: ${trimmed}`);
    }
    const delegatedContent = await readOptionalFile(delegated);
    if (delegatedContent === undefined) {
      throw new Error(`Delegated AGENTS file is missing: ${trimmed}`);
    }
    return { content: delegatedContent, exists: true, path: relativePath };
  }

  return { content: rootContent, exists: true, path: 'AGENTS.md' };
};
