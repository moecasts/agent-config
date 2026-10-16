import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { glob } from 'tinyglobby';
import { parse as parseYaml } from 'yaml';
import { type GitCommitConfig, gitCommitConfigSchema } from './schema.ts';

interface PackageManifest {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
}

const CONVENTIONAL_MODULE_PATTERNS = ['apps/*', 'packages/*', 'internal/*'] as const;
const MODULE_MARKER_PATTERNS = [
  '*/*/package.json',
  '*/*/Cargo.toml',
  '*/*/go.mod',
  '*/*/pyproject.toml',
] as const;
const DISCOVERY_IGNORES = [
  '**/node_modules/**',
  '.agents/**',
  '.cursor/**',
  '.git/**',
  '.tmp/**',
  'build/**',
  'coverage/**',
  'dist/**',
] as const;

const readOptional = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const readPackageManifest = async (path: string): Promise<PackageManifest> => {
  const content = await readFile(path, 'utf8');
  return JSON.parse(content) as PackageManifest;
};

const packageWorkspacePatterns = (manifest: PackageManifest): string[] => {
  if (Array.isArray(manifest.workspaces)) {
    return manifest.workspaces;
  }
  return manifest.workspaces?.packages ?? [];
};

const pnpmWorkspacePatterns = async (root: string): Promise<string[]> => {
  const content = await readOptional(resolve(root, 'pnpm-workspace.yaml'));
  if (!content) {
    return [];
  }
  const parsed = parseYaml(content) as { packages?: unknown };
  return Array.isArray(parsed.packages)
    ? parsed.packages.filter((value): value is string => typeof value === 'string')
    : [];
};

const prefixCandidates = (
  rootName: string | undefined,
  directoryNames: readonly string[],
): string[] => {
  const candidates: string[] = [];
  if (rootName?.startsWith('@')) {
    const namespace = rootName.slice(1).split('/')[0];
    if (namespace) {
      candidates.push(namespace);
    }
  } else if (rootName?.includes('-')) {
    const firstToken = rootName.split('-')[0];
    if (firstToken) {
      candidates.push(firstToken);
    }
  }

  if (directoryNames.length > 1) {
    const firstDirectoryToken = directoryNames[0]?.split('-')[0];
    if (firstDirectoryToken) {
      candidates.push(firstDirectoryToken);
    }
  }

  return [...new Set(candidates)];
};

const detectSharedPrefix = (
  rootName: string | undefined,
  directoryNames: readonly string[],
): string | undefined =>
  prefixCandidates(rootName, directoryNames).find((candidate) =>
    directoryNames.every((name) => name.startsWith(`${candidate}-`)),
  );

const scopeSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const disambiguateScopes = (
  mappings: readonly { path: string; scope: string }[],
): Array<{ path: string; scope: string }> => {
  const initialCounts = new Map<string, number>();
  for (const mapping of mappings) {
    initialCounts.set(mapping.scope, (initialCounts.get(mapping.scope) ?? 0) + 1);
  }

  const parentQualified = mappings.map((mapping) => ({
    ...mapping,
    scope:
      initialCounts.get(mapping.scope) === 1
        ? mapping.scope
        : scopeSlug(`${basename(dirname(mapping.path))}-${mapping.scope}`),
  }));
  const qualifiedCounts = new Map<string, number>();
  for (const mapping of parentQualified) {
    qualifiedCounts.set(mapping.scope, (qualifiedCounts.get(mapping.scope) ?? 0) + 1);
  }

  return parentQualified.map((mapping) => ({
    ...mapping,
    scope: qualifiedCounts.get(mapping.scope) === 1 ? mapping.scope : scopeSlug(mapping.path),
  }));
};

const discoverModulePaths = async (
  root: string,
  declaredPatterns: readonly string[],
): Promise<string[]> => {
  const exclusions = declaredPatterns.filter((pattern) => pattern.startsWith('!'));
  const directories = await glob(
    [
      ...declaredPatterns.filter((pattern) => !pattern.startsWith('!')),
      ...CONVENTIONAL_MODULE_PATTERNS,
      ...exclusions,
    ],
    {
      absolute: false,
      cwd: root,
      dot: false,
      ignore: DISCOVERY_IGNORES,
      onlyDirectories: true,
    },
  );
  const markerFiles = await glob(MODULE_MARKER_PATTERNS, {
    absolute: false,
    cwd: root,
    dot: false,
    ignore: DISCOVERY_IGNORES,
    onlyFiles: true,
  });

  return [
    ...new Set([
      ...directories.map((path) => path.replace(/\/+$/, '')),
      ...markerFiles.map((path) => dirname(path)),
    ]),
  ].sort();
};

export const detectGitCommitConfig = async (root: string): Promise<GitCommitConfig> => {
  const manifest = await readPackageManifest(resolve(root, 'package.json'));
  const patterns = [...packageWorkspacePatterns(manifest), ...(await pnpmWorkspacePatterns(root))];
  const workspacePaths = await discoverModulePaths(root, patterns);

  const directoryNames = workspacePaths.map((path) => basename(path));
  const prefix = detectSharedPrefix(manifest.name, directoryNames);
  const scopes = disambiguateScopes(
    workspacePaths.map((path) => {
      const directoryName = basename(path);
      return {
        path,
        scope: prefix ? directoryName.slice(prefix.length + 1) : directoryName,
      };
    }),
  );

  return gitCommitConfigSchema.parse({
    agentsScope: 'root/agents',
    docsScope: 'root',
    extraScopes: [],
    rootScope: 'root',
    scopes,
  });
};
