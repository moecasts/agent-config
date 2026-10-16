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
  version: string;
}
