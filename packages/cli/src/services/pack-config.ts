import { cancel, isCancel, text } from '@clack/prompts';
import {
  detectCodingStandardsConfig,
  detectGitCommitConfig,
  type GitCommitConfig,
  getPack,
  gitCommitConfigSchema,
  type PackId,
} from '@cocasts/agent-config-packs';
import { formatScopeMappings, parseCommaList, parseScopeMappings } from '../ui.ts';

export interface PackConfigAdapter {
  detect: (root: string) => Promise<unknown>;
  merge: (detected: unknown, current: unknown) => unknown;
  prompt?: (initial: unknown) => Promise<unknown | undefined>;
}

const promptForGitCommit = async (
  initial: GitCommitConfig,
): Promise<GitCommitConfig | undefined> => {
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

const mergeGitCommitConfig = (
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

const gitCommitAdapter: PackConfigAdapter = {
  detect: (root) => detectGitCommitConfig(root),
  merge: (detected, current) =>
    mergeGitCommitConfig(
      gitCommitConfigSchema.parse(detected),
      gitCommitConfigSchema.parse(current),
    ),
  prompt: async (initial) => promptForGitCommit(gitCommitConfigSchema.parse(initial)),
};

/**
 * Coding standards has no interactive overrides: `configure` re-detects the
 * toolchain, while `update` keeps rendering from the committed config.
 */
const codingStandardsAdapter: PackConfigAdapter = {
  detect: (root) => detectCodingStandardsConfig(root),
  merge: (detected) => detected,
};

const packConfigAdapters: Partial<Record<PackId, PackConfigAdapter>> = {
  'coding-standards': codingStandardsAdapter,
  'git-commit': gitCommitAdapter,
};

export const getPackConfigAdapter = (packId: string): PackConfigAdapter => {
  const pack = getPack(packId);
  const adapter = packConfigAdapters[packId as PackId];
  if (adapter) {
    return adapter;
  }

  return {
    detect: (root) => pack.detect(root),
    merge: (_detected, current) => current,
  };
};
