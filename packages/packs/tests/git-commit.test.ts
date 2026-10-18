import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import {
  detectGitCommitConfig,
  gitCommitConfigSchema,
  gitCommitPack,
  readGitCommitAgentGuide,
  renderGitCommitPack,
} from '../src/index.ts';

const fixture = (name: string): string => resolve(import.meta.dir, 'fixtures', name);

describe('git-commit config detection', () => {
  test('detects pnpm workspaces and strips the shared dip prefix', async () => {
    const config = await detectGitCommitConfig(fixture('dip-app'));

    expect(config).toEqual({
      agentsScope: 'root/agents',
      docsScope: 'root',
      extraScopes: [],
      rootScope: 'root',
      scopes: [
        { path: 'apps/dip-api', scope: 'api' },
        { path: 'apps/dip-web', scope: 'web' },
        { path: 'packages/dip-ui', scope: 'ui' },
      ],
    });
  });

  test('detects package.json workspaces and strips the shared pi prefix', async () => {
    const config = await detectGitCommitConfig(fixture('pi-extensions'));

    expect(config.scopes).toEqual([{ path: 'packages/pi-image-view', scope: 'image-view' }]);
  });

  test('does not infer a shared prefix from one unprefixed workspace', async () => {
    const config = await detectGitCommitConfig(fixture('single-workspace'));

    expect(config.scopes).toEqual([{ path: 'packages/image-view', scope: 'image-view' }]);
  });

  test('disambiguates duplicate workspace basenames before prompting', async () => {
    const config = await detectGitCommitConfig(fixture('duplicate-scopes'));

    expect(config.scopes).toEqual([
      { path: 'apps/shared', scope: 'apps-shared' },
      { path: 'packages/shared', scope: 'packages-shared' },
    ]);
  });

  test('discovers conventional and marker-based modules without workspace declarations', async () => {
    const config = await detectGitCommitConfig(fixture('implicit-modules'));

    expect(config.scopes).toEqual([
      { path: 'internal/auth', scope: 'auth' },
      { path: 'modules/search', scope: 'search' },
      { path: 'packages/widget', scope: 'widget' },
    ]);
  });

  test('rejects duplicate paths and scope names', () => {
    const base = {
      agentsScope: 'root/agents',
      docsScope: 'root',
      extraScopes: [],
      rootScope: 'root',
    };

    expect(() =>
      gitCommitConfigSchema.parse({
        ...base,
        scopes: [
          { path: 'packages/a', scope: 'a' },
          { path: 'packages/a', scope: 'b' },
        ],
      }),
    ).toThrow();
    expect(() =>
      gitCommitConfigSchema.parse({
        ...base,
        scopes: [
          { path: 'packages/a', scope: 'same' },
          { path: 'packages/b', scope: 'same' },
        ],
      }),
    ).toThrow();
    expect(() =>
      gitCommitConfigSchema.parse({
        ...base,
        scopes: [{ path: './packages\\a', scope: 'a' }],
      }),
    ).toThrow();
  });
});

describe('git-commit rendering', () => {
  test('renders exactly the pack files and passes validation', async () => {
    const config = await detectGitCommitConfig(fixture('pi-extensions'));
    const rendered = await renderGitCommitPack(config);

    expect(rendered.files.map((file) => file.path)).toEqual([
      '.agents/rules/git-commit.mdc',
      '.agents/skills/smart-commit/SKILL.md',
    ]);
    expect(rendered.files.every((file) => file.content.trim().length > 0)).toBe(true);
    expect(rendered.agentsBlock).toContain('.agents/rules/git-commit.mdc');
    expect(rendered.agentsBlock).toBe(
      '## Git commits\n\nBefore planning or creating a commit, read and follow\n[Git Commit Rules](.agents/rules/git-commit.mdc).\n',
    );
    expect(rendered.files.every((file) => !file.content.includes('{{'))).toBe(true);
    expect(
      gitCommitPack.validate(
        Object.fromEntries(rendered.files.map((file) => [file.path, file.content])),
      ),
    ).toEqual([]);
  });

  test('exposes the AGENTS block through the registered pack and validates config before rendering', async () => {
    const config = await detectGitCommitConfig(fixture('pi-extensions'));
    const rendered = await gitCommitPack.render({ ...config, extraScopes: ['infra'] });

    expect(rendered.agentsBlock).toContain('Git Commit Rules');
    expect(rendered.files.map((file) => file.path)).toEqual([...gitCommitPack.filePaths]);
    expect(rendered.files[0]?.content).toContain('Additional project scopes: `infra`.');
    expect(rendered.files[0]?.content).toContain('not an exhaustive whitelist');
    await expect(
      gitCommitPack.render({ ...config, scopes: [{ path: '../outside', scope: 'outside' }] }),
    ).rejects.toThrow();
  });

  test('rejects generated files that reference the generator tool', async () => {
    const config = await detectGitCommitConfig(fixture('pi-extensions'));
    const rendered = await renderGitCommitPack(config);
    const files = Object.fromEntries(rendered.files.map((file) => [file.path, file.content]));
    const skillPath = '.agents/skills/smart-commit/SKILL.md';

    expect(
      gitCommitPack.validate({
        ...files,
        [skillPath]: `${files[skillPath] ?? ''}\nRun \`acli\` before committing.\n`,
      }),
    ).toContain(`${skillPath} must not reference the generator tool: acli`);
  });

  test('ships an agent generation guide with safety requirements', async () => {
    const guide = await readGitCommitAgentGuide();

    expect(guide).toContain('staged, unstaged, and untracked');
    expect(guide).toContain('Do not create commits');
    expect(guide).toContain('AGENTS.md');
    expect(guide).toContain('Do not reference the generator tool');
    expect(gitCommitPack.validateAgentGuide(guide)).toEqual([]);
  });
});
