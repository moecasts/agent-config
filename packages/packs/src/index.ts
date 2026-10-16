export * from './git-commit/definition.ts';
export * from './git-commit/detect.ts';
export * from './git-commit/render.ts';
export * from './git-commit/schema.ts';

import { gitCommitPack } from './git-commit/definition.ts';

export const packRegistry = {
  'git-commit': gitCommitPack,
} as const;

export type PackId = keyof typeof packRegistry;
export const packIds = Object.keys(packRegistry) as PackId[];

export const getPack = (id: string) => {
  if (!(id in packRegistry)) {
    throw new Error(`Unknown pack: ${id}`);
  }
  return packRegistry[id as PackId];
};
