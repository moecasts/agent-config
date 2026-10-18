import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type CodingStandardsConfig, codingStandardsConfigSchema } from './schema.ts';

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
  scripts?: Record<string, string>;
}

interface Commands {
  format: string | null;
  lint: string | null;
  test: string | null;
  typecheck: string | null;
  verify: string | null;
}

const EMPTY_COMMANDS: Commands = {
  format: null,
  lint: null,
  test: null,
  typecheck: null,
  verify: null,
};

const LOCKFILE_MANAGERS: ReadonlyArray<readonly [string, string]> = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
];

/**
 * Script names only. `format` is deliberately absent: it usually rewrites files,
 * while the review skill runs formatters in check-only mode. A missing check
 * script renders as `not detected` instead of a command that mutates the tree.
 */
const NODE_SCRIPT_CANDIDATES = {
  format: ['format:check'],
  lint: ['lint', 'lint:check'],
  test: ['test'],
  typecheck: ['typecheck', 'type-check', 'tsc'],
  verify: ['verify', 'check'],
} as const;

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

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const readManifest = async (path: string): Promise<PackageManifest | undefined> => {
  const content = await readOptional(path);
  if (content === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(content) as PackageManifest;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${path}: ${reason}`);
  }
};

const detectPackageManager = async (
  root: string,
  manifest: PackageManifest | undefined,
): Promise<string | null> => {
  if (!manifest) {
    return null;
  }

  const declared = manifest.packageManager?.split('@')[0];
  if (declared) {
    return declared;
  }

  for (const [lockfile, manager] of LOCKFILE_MANAGERS) {
    if (await exists(resolve(root, lockfile))) {
      return manager;
    }
  }

  // No lockfile: npm is not a guess about project intent but the runner that
  // ships with Node and can execute any package.json script.
  return 'npm';
};

const detectLanguage = async (
  root: string,
  manifest: PackageManifest | undefined,
): Promise<string | null> => {
  if (manifest) {
    const usesTypeScript =
      (await exists(resolve(root, 'tsconfig.json'))) ||
      Boolean(manifest.devDependencies?.typescript ?? manifest.dependencies?.typescript);
    return usesTypeScript ? 'typescript' : 'javascript';
  }

  if (await exists(resolve(root, 'Cargo.toml'))) {
    return 'rust';
  }
  if (await exists(resolve(root, 'go.mod'))) {
    return 'go';
  }

  const pythonManifests = ['pyproject.toml', 'setup.py', 'requirements.txt'];
  for (const manifestPath of pythonManifests) {
    if (await exists(resolve(root, manifestPath))) {
      return 'python';
    }
  }

  return null;
};

const pickScript = (
  scripts: Readonly<Record<string, string>>,
  candidates: readonly string[],
): string | null => {
  for (const candidate of candidates) {
    const command = scripts[candidate];
    if (typeof command === 'string' && command.trim() !== '') {
      return candidate;
    }
  }
  return null;
};

const nodeCommands = (manifest: PackageManifest, manager: string): Commands => {
  const scripts = manifest.scripts ?? {};
  const toCommand = (script: string | null): string | null =>
    script === null ? null : `${manager} run ${script}`;

  return {
    format: toCommand(pickScript(scripts, NODE_SCRIPT_CANDIDATES.format)),
    lint: toCommand(pickScript(scripts, NODE_SCRIPT_CANDIDATES.lint)),
    test: toCommand(pickScript(scripts, NODE_SCRIPT_CANDIDATES.test)),
    typecheck: toCommand(pickScript(scripts, NODE_SCRIPT_CANDIDATES.typecheck)),
    verify: toCommand(pickScript(scripts, NODE_SCRIPT_CANDIDATES.verify)),
  };
};

const pythonCommands = (content: string): Commands => ({
  format: /\bruff\b/u.test(content) ? 'ruff format --check .' : null,
  lint: /\bruff\b/u.test(content) ? 'ruff check .' : null,
  test: /\bpytest\b/u.test(content) ? 'pytest' : null,
  typecheck: /\bmypy\b/u.test(content) ? 'mypy .' : null,
  verify: null,
});

const detectCommands = async (
  root: string,
  manifest: PackageManifest | undefined,
  language: string | null,
  manager: string | null,
): Promise<Commands> => {
  if (manifest) {
    return nodeCommands(manifest, manager ?? 'npm');
  }
  if (language === 'rust') {
    return {
      ...EMPTY_COMMANDS,
      format: 'cargo fmt --check',
      lint: 'cargo clippy',
      test: 'cargo test',
    };
  }
  if (language === 'go') {
    return { ...EMPTY_COMMANDS, format: 'gofmt -l .', lint: 'go vet ./...', test: 'go test ./...' };
  }
  if (language === 'python') {
    const sources = await Promise.all(
      ['pyproject.toml', 'setup.cfg', 'requirements.txt'].map((name) =>
        readOptional(resolve(root, name)),
      ),
    );
    return pythonCommands(sources.filter((value) => value !== undefined).join('\n'));
  }
  return EMPTY_COMMANDS;
};

/**
 * Detects the repository's toolchain so CLI mode renders a project-aware review
 * skill. Detection is best-effort and deterministic: unknown facts stay `null`
 * and the template renders them as `not detected` instead of guessing.
 */
export const detectCodingStandardsConfig = async (root: string): Promise<CodingStandardsConfig> => {
  const manifest = await readManifest(resolve(root, 'package.json'));
  const [language, packageManager] = await Promise.all([
    detectLanguage(root, manifest),
    detectPackageManager(root, manifest),
  ]);

  return codingStandardsConfigSchema.parse({
    commands: await detectCommands(root, manifest, language, packageManager),
    language,
    packageManager,
  });
};
