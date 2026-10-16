import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyFileChanges,
  assertInstallationMode,
  createEmptyState,
  extractManagedBlock,
  FileConflictError,
  ModeConflictError,
  prepareFileChanges,
  projectStateSchema,
  renderTemplate,
  sha256,
  upsertManagedBlock,
} from '../src/index.ts';

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-config-core-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('strict template rendering', () => {
  test('replaces every declared placeholder', () => {
    expect(renderTemplate('# {{TITLE}}\n{{BODY}}\n', { TITLE: 'Rules', BODY: 'Be precise.' })).toBe(
      '# Rules\nBe precise.\n',
    );
  });

  test('rejects a missing placeholder value', () => {
    expect(() => renderTemplate('{{KNOWN}} {{MISSING}}', { KNOWN: 'ok' })).toThrow(
      'Missing template value: MISSING',
    );
  });

  test('rejects malformed placeholders', () => {
    expect(() => renderTemplate('{{lower}}', {})).toThrow(
      'Unresolved template placeholder: {{lower}}',
    );
    expect(() => renderTemplate('{{BAD-NAME}}', {})).toThrow(
      'Unresolved template placeholder: {{BAD-NAME}}',
    );
    expect(() => renderTemplate('{{BROKEN', {})).toThrow('Unresolved template placeholder');
    expect(() => renderTemplate('BROKEN}}', {})).toThrow('Unresolved template placeholder');
    expect(() => renderTemplate('{{{NAME}}}', { NAME: 'value' })).toThrow(
      'Unresolved template placeholder',
    );
  });
});

describe('managed blocks', () => {
  test('inserts and replaces one named block without changing surrounding content', () => {
    const inserted = upsertManagedBlock(
      '# Existing\n',
      'git-commit',
      '## Git commits\nRead the rule.',
    );

    expect(extractManagedBlock(inserted, 'git-commit')).toBe('## Git commits\nRead the rule.');
    expect(upsertManagedBlock(inserted, 'git-commit', '## Git commits\nUpdated.')).toBe(
      '# Existing\n\n<!-- agent-config:git-commit:start -->\n## Git commits\nUpdated.\n<!-- agent-config:git-commit:end -->\n',
    );
  });

  test('rejects incomplete or duplicated markers', () => {
    expect(() => upsertManagedBlock('<!-- agent-config:x:start -->\n', 'x', 'body')).toThrow(
      'Managed block markers for x are malformed',
    );
    expect(() =>
      upsertManagedBlock(
        '<!-- agent-config:x:start -->\na\n<!-- agent-config:x:end -->\n<!-- agent-config:x:start -->\nb\n<!-- agent-config:x:end -->',
        'x',
        'body',
      ),
    ).toThrow('Managed block markers for x are malformed');
  });
});

describe('state and ownership', () => {
  test('validates state and prevents installation mode changes', () => {
    const state = createEmptyState();
    state.packs['git-commit'] = {
      files: {},
      mode: 'agent',
      version: '1.0.0',
    };

    expect(projectStateSchema.parse(state)).toEqual(state);
    expect(() => assertInstallationMode(state, 'git-commit', 'cli')).toThrow(ModeConflictError);
    expect(() => assertInstallationMode(state, 'git-commit', 'agent')).not.toThrow();
    expect(() =>
      projectStateSchema.parse({
        ...state,
        packs: {
          'git-commit': {
            files: { 'rule.mdc': 'x'.repeat(64) },
            mode: 'agent',
            version: '1.0.0',
          },
        },
      }),
    ).toThrow();
  });
});

describe('safe file changes', () => {
  test('plans without writing, then applies through an atomic replacement', async () => {
    const root = await createTemporaryDirectory();
    const changes = await prepareFileChanges(root, [
      { content: 'generated\n', path: '.agents/rules/example.mdc' },
    ]);

    expect(changes[0]?.status).toBe('create');
    await expect(readFile(join(root, '.agents/rules/example.mdc'), 'utf8')).rejects.toThrow();

    await applyFileChanges(root, changes);

    expect(await readFile(join(root, '.agents/rules/example.mdc'), 'utf8')).toBe('generated\n');
  });

  test('rejects an unmanaged existing file', async () => {
    const root = await createTemporaryDirectory();
    await writeFile(join(root, 'existing.txt'), 'user content');

    await expect(
      prepareFileChanges(root, [{ content: 'generated content', path: 'existing.txt' }]),
    ).rejects.toBeInstanceOf(FileConflictError);
  });

  test('does not silently adopt an identical unmanaged file', async () => {
    const root = await createTemporaryDirectory();
    await writeFile(join(root, 'existing.txt'), 'generated content');

    await expect(
      prepareFileChanges(root, [{ content: 'generated content', path: 'existing.txt' }]),
    ).rejects.toBeInstanceOf(FileConflictError);
  });

  test('treats an unchanged managed file as an idempotent no-op', async () => {
    const root = await createTemporaryDirectory();
    const path = join(root, 'managed.txt');
    await writeFile(path, 'same');

    const changes = await prepareFileChanges(root, [
      { content: 'same', path: 'managed.txt', previousHash: sha256('same') },
    ]);
    expect(changes[0]?.status).toBe('unchanged');

    await applyFileChanges(root, changes);
    expect(await readFile(path, 'utf8')).toBe('same');
  });

  test('rejects drift before planning and immediately before writing', async () => {
    const root = await createTemporaryDirectory();
    const path = join(root, 'managed.txt');
    await writeFile(path, 'old');

    await expect(
      prepareFileChanges(root, [
        { content: 'next', path: 'managed.txt', previousHash: sha256('different') },
      ]),
    ).rejects.toBeInstanceOf(FileConflictError);

    const changes = await prepareFileChanges(root, [
      { content: 'next', path: 'managed.txt', previousHash: sha256('old') },
    ]);
    await writeFile(path, 'changed after planning');

    await expect(applyFileChanges(root, changes)).rejects.toBeInstanceOf(FileConflictError);
    expect(await readFile(path, 'utf8')).toBe('changed after planning');
  });

  test('revalidates all files before applying any change', async () => {
    const root = await createTemporaryDirectory();
    await writeFile(join(root, 'a.txt'), 'old-a');
    await writeFile(join(root, 'b.txt'), 'old-b');
    const changes = await prepareFileChanges(root, [
      { content: 'new-a', path: 'a.txt', previousHash: sha256('old-a') },
      { content: 'new-b', path: 'b.txt', previousHash: sha256('old-b') },
    ]);
    await writeFile(join(root, 'b.txt'), 'drifted-b');

    await expect(applyFileChanges(root, changes)).rejects.toBeInstanceOf(FileConflictError);
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('old-a');
  });

  test('rejects paths outside the target repository', async () => {
    const root = await createTemporaryDirectory();

    await expect(prepareFileChanges(root, [{ content: 'x', path: '../outside' }])).rejects.toThrow(
      'Path escapes target repository',
    );
  });

  test('rejects duplicate normalized paths before applying changes', async () => {
    const root = await createTemporaryDirectory();
    const changes = [
      { content: 'first', path: 'same.txt' },
      { content: 'second', path: './same.txt' },
    ];

    await expect(prepareFileChanges(root, changes)).rejects.toThrow(
      'Duplicate target path: ./same.txt',
    );
    await expect(readFile(join(root, 'same.txt'), 'utf8')).rejects.toThrow();
  });

  test('rejects a symlinked directory that escapes the target repository', async () => {
    const root = await createTemporaryDirectory();
    const outside = await createTemporaryDirectory();
    await symlink(outside, join(root, 'link'));

    await expect(
      prepareFileChanges(root, [{ content: 'x', path: 'link/outside.txt' }]),
    ).rejects.toThrow('Path crosses a symbolic link');
  });
});
