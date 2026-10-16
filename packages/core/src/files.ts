import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { sha256 } from './hash.ts';

export interface FileChangeInput {
  content: string;
  path: string;
  previousHash?: string;
}

export interface PreparedFileChange {
  before: string | undefined;
  content: string;
  nextHash: string;
  observedHash: string | undefined;
  path: string;
  status: 'create' | 'update' | 'unchanged';
}

export class FileConflictError extends Error {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`);
    this.name = 'FileConflictError';
    this.path = path;
  }
}

const resolveInsideRoot = async (root: string, path: string): Promise<string> => {
  const absoluteRoot = await realpath(resolve(root));
  const absolutePath = resolve(absoluteRoot, path);
  const relativePath = relative(absoluteRoot, absolutePath);

  if (isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`Path escapes target repository: ${path}`);
  }

  let currentPath = absoluteRoot;
  for (const segment of relativePath.split(sep)) {
    if (!segment) {
      continue;
    }
    currentPath = resolve(currentPath, segment);
    try {
      const metadata = await lstat(currentPath);
      if (metadata.isSymbolicLink()) {
        throw new Error(`Path crosses a symbolic link: ${path}`);
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        break;
      }
      throw error;
    }
  }

  return absolutePath;
};

const readOptionalFile = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

export const prepareFileChanges = async (
  root: string,
  inputs: readonly FileChangeInput[],
): Promise<PreparedFileChange[]> => {
  const absolutePaths = await Promise.all(
    inputs.map((input) => resolveInsideRoot(root, input.path)),
  );
  const seenPaths = new Set<string>();
  for (const [index, absolutePath] of absolutePaths.entries()) {
    if (seenPaths.has(absolutePath)) {
      throw new Error(`Duplicate target path: ${inputs[index]?.path ?? absolutePath}`);
    }
    seenPaths.add(absolutePath);
  }

  return Promise.all(
    inputs.map(async (input, index) => {
      const absolutePath = absolutePaths[index];
      if (!absolutePath) {
        throw new Error(`Unable to resolve target path: ${input.path}`);
      }
      const current = await readOptionalFile(absolutePath);
      const observedHash = current === undefined ? undefined : sha256(current);
      const nextHash = sha256(input.content);

      if (current === undefined && input.previousHash !== undefined) {
        throw new FileConflictError(input.path, 'managed file is missing');
      }

      if (current !== undefined && input.previousHash === undefined) {
        throw new FileConflictError(input.path, 'existing file is not managed by agent-config');
      }

      if (
        current !== undefined &&
        input.previousHash !== undefined &&
        observedHash !== input.previousHash
      ) {
        throw new FileConflictError(input.path, 'managed file has changed since the last snapshot');
      }

      return {
        before: current,
        content: input.content,
        nextHash,
        observedHash,
        path: input.path,
        status:
          current === undefined ? 'create' : observedHash === nextHash ? 'unchanged' : 'update',
      };
    }),
  );
};

export const applyFileChanges = async (
  root: string,
  changes: readonly PreparedFileChange[],
): Promise<void> => {
  const validatedChanges = await Promise.all(
    changes.map(async (change) => {
      const absolutePath = await resolveInsideRoot(root, change.path);
      const current = await readOptionalFile(absolutePath);
      const currentHash = current === undefined ? undefined : sha256(current);
      if (currentHash !== change.observedHash) {
        throw new FileConflictError(change.path, 'file changed after the write plan was created');
      }
      return { absolutePath, change };
    }),
  );

  for (const { absolutePath, change } of validatedChanges) {
    if (change.status === 'unchanged') {
      continue;
    }

    const current = await readOptionalFile(absolutePath);
    const currentHash = current === undefined ? undefined : sha256(current);
    if (currentHash !== change.observedHash) {
      throw new FileConflictError(change.path, 'file changed after the write plan was created');
    }

    await mkdir(dirname(absolutePath), { recursive: true });
    const temporaryPath = `${absolutePath}.agent-config-${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, change.content, 'utf8');
      await rename(temporaryPath, absolutePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
};
