import type { z } from 'zod';

export interface RenderedFile {
  content: string;
  path: string;
}

export interface PackRenderResult {
  agentsBlock: string;
  files: readonly RenderedFile[];
}

export interface PackDefinition<Config> {
  configSchema: z.ZodType<Config>;
  detect: (root: string) => Promise<Config>;
  filePaths: readonly string[];
  id: string;
  render: (config: Config) => Promise<PackRenderResult>;
  validateAgentsBlock: (content: string) => readonly string[];
  validate: (files: Readonly<Record<string, string>>) => readonly string[];
  validateAgentGuide: (content: string) => readonly string[];
  version: string;
}

/**
 * Erases the config type so a heterogeneous pack registry can be iterated.
 * Rendering still parses the config through the pack schema before delegating.
 */
export const erasePackConfig = <Config>(pack: PackDefinition<Config>): PackDefinition<unknown> => ({
  ...pack,
  detect: async (root) => pack.detect(root),
  render: async (config) => pack.render(pack.configSchema.parse(config)),
});
