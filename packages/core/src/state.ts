import { z } from 'zod';

export const installationModeSchema = z.enum(['cli', 'agent']);
export type InstallationMode = z.infer<typeof installationModeSchema>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const packStateSchema = z.object({
  agentsBlock: z
    .object({
      hash: sha256Schema,
      path: z.string().min(1),
    })
    .optional(),
  files: z.record(z.string(), sha256Schema),
  mode: installationModeSchema,
  version: z.string().min(1),
});
export type PackState = z.infer<typeof packStateSchema>;

export const projectStateSchema = z.object({
  packs: z.record(z.string(), packStateSchema),
  schemaVersion: z.literal(1),
});
export type ProjectState = z.infer<typeof projectStateSchema>;

export const projectConfigSchema = z.object({
  packs: z.record(z.string(), z.unknown()),
  schemaVersion: z.literal(1),
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export const createEmptyState = (): ProjectState => ({
  packs: {},
  schemaVersion: 1,
});

export class ModeConflictError extends Error {
  constructor(packId: string, current: InstallationMode, requested: InstallationMode) {
    super(`Pack ${packId} is managed in ${current} mode and cannot be used in ${requested} mode`);
    this.name = 'ModeConflictError';
  }
}

export const assertInstallationMode = (
  state: ProjectState,
  packId: string,
  requestedMode: InstallationMode,
): void => {
  const current = state.packs[packId]?.mode;
  if (current && current !== requestedMode) {
    throw new ModeConflictError(packId, current, requestedMode);
  }
};
