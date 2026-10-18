export * from './coding-standards/definition.ts';
export * from './coding-standards/detect.ts';
export * from './coding-standards/render.ts';
export * from './coding-standards/schema.ts';
export * from './git-commit/definition.ts';
export * from './git-commit/detect.ts';
export * from './git-commit/render.ts';
export * from './git-commit/schema.ts';

import { erasePackConfig } from '@cocasts/agent-config-core';
import { codingStandardsPack } from './coding-standards/definition.ts';
import {
  codingStandardsTemplateRoot,
  readCodingStandardsAgentGuide,
} from './coding-standards/render.ts';
import { gitCommitPack } from './git-commit/definition.ts';
import { gitCommitTemplateRoot, readGitCommitAgentGuide } from './git-commit/render.ts';

export const packRegistry = {
  'git-commit': erasePackConfig(gitCommitPack),
  'coding-standards': erasePackConfig(codingStandardsPack),
} as const;

export type PackId = keyof typeof packRegistry;
export const packIds = Object.keys(packRegistry) as PackId[];

export const packAgentGuides: Readonly<Record<PackId, () => Promise<string>>> = {
  'git-commit': readGitCommitAgentGuide,
  'coding-standards': readCodingStandardsAgentGuide,
};

/** Flat template root per pack; build output merges these into one directory. */
export const packTemplateRoots: Readonly<Record<PackId, string>> = {
  'git-commit': gitCommitTemplateRoot,
  'coding-standards': codingStandardsTemplateRoot,
};

export const getPack = (id: string) => {
  if (!(id in packRegistry)) {
    throw new Error(`Unknown pack: ${id}`);
  }
  return packRegistry[id as PackId];
};
