import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  codingStandardsConfigSchema,
  codingStandardsPack,
  detectCodingStandardsConfig,
  getPack,
  REQUIRED_RULE_TEXTS,
  readCodingStandardsAgentGuide,
  renderCodingStandardsPack,
} from '../src/index.ts';

const RULE_PATH = '.agents/rules/coding-standards.mdc';
const CODE_QUALITY_REVIEW_SKILL_PATH = '.agents/skills/code-quality-review/SKILL.md';

const fixture = (name: string): string => resolve(import.meta.dir, 'fixtures', name);

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

const temporaryProject = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'agent-config-standards-'));
  temporaryDirectories.push(root);
  return root;
};

const detectedConfig = {
  commands: {
    format: 'bun run format:check',
    lint: 'bun run lint',
    test: 'bun run test',
    typecheck: 'bun run typecheck',
    verify: 'bun run verify',
  },
  language: 'typescript',
  packageManager: 'bun',
};

const renderFiles = async (): Promise<Record<string, string>> => {
  const rendered = await renderCodingStandardsPack(detectedConfig);
  return Object.fromEntries(rendered.files.map((file) => [file.path, file.content]));
};

/**
 * Sentences long enough to be a restated rule. Exact cross-file repetition is the
 * only duplication this scan can prove; paraphrase drift stays a review finding,
 * because substring checks cannot catch it.
 */
const contentSentences = (content: string): readonly string[] =>
  content
    .replace(/\n/gu, ' ')
    .split(/(?<=[.:;])\s+/u)
    .map((sentence) => sentence.replace(/\s+/gu, ' ').trim().toLowerCase())
    .filter((sentence) => sentence.split(' ').length >= 8);

describe('coding-standards configuration', () => {
  test('detects the repository toolchain', async () => {
    expect(await detectCodingStandardsConfig(fixture('ts-bun-app'))).toEqual(detectedConfig);
  });

  test('reports unknown tooling as null except the npm runner fallback', async () => {
    expect(await detectCodingStandardsConfig(fixture('single-workspace'))).toEqual({
      commands: { format: null, lint: null, test: null, typecheck: null, verify: null },
      language: 'javascript',
      packageManager: 'npm',
    });
  });

  test('ignores a write-mode format script', async () => {
    const root = await temporaryProject();
    await writeFile(
      join(root, 'package.json'),
      `${JSON.stringify({ name: 'write-format', scripts: { format: 'biome format --write .' } })}\n`,
    );

    expect(await detectCodingStandardsConfig(root)).toEqual({
      commands: { format: null, lint: null, test: null, typecheck: null, verify: null },
      language: 'javascript',
      packageManager: 'npm',
    });
  });

  test('reads the package manager from a lockfile and accepts a check script', async () => {
    const root = await temporaryProject();
    await writeFile(
      join(root, 'package.json'),
      `${JSON.stringify({ name: 'pnpm-app', scripts: { check: 'tsc --noEmit', lint: 'eslint .' } })}\n`,
    );
    await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');

    expect(await detectCodingStandardsConfig(root)).toEqual({
      commands: {
        format: null,
        lint: 'pnpm run lint',
        test: null,
        typecheck: null,
        verify: 'pnpm run check',
      },
      language: 'javascript',
      packageManager: 'pnpm',
    });
  });

  test('detects non-Node toolchains without a package manifest', async () => {
    const rust = await temporaryProject();
    await writeFile(join(rust, 'Cargo.toml'), '[package]\nname = "app"\n');
    expect(await detectCodingStandardsConfig(rust)).toEqual({
      commands: {
        format: 'cargo fmt --check',
        lint: 'cargo clippy',
        test: 'cargo test',
        typecheck: null,
        verify: null,
      },
      language: 'rust',
      packageManager: null,
    });

    const go = await temporaryProject();
    await writeFile(join(go, 'go.mod'), 'module example.com/app\n');
    expect(await detectCodingStandardsConfig(go)).toEqual({
      commands: {
        format: 'gofmt -l .',
        lint: 'go vet ./...',
        test: 'go test ./...',
        typecheck: null,
        verify: null,
      },
      language: 'go',
      packageManager: null,
    });

    const python = await temporaryProject();
    await writeFile(
      join(python, 'pyproject.toml'),
      '[tool.ruff]\n[tool.pytest.ini_options]\n[tool.mypy]\n',
    );
    expect(await detectCodingStandardsConfig(python)).toEqual({
      commands: {
        format: 'ruff format --check .',
        lint: 'ruff check .',
        test: 'pytest',
        typecheck: 'mypy .',
        verify: null,
      },
      language: 'python',
      packageManager: null,
    });
  });

  test('rejects a malformed package manifest', async () => {
    const root = await temporaryProject();
    await writeFile(join(root, 'package.json'), '{"name": broken');

    await expect(detectCodingStandardsConfig(root)).rejects.toThrow('Invalid');
  });

  test('rejects unknown configuration keys', () => {
    expect(codingStandardsConfigSchema.parse(detectedConfig)).toEqual(detectedConfig);
    expect(() =>
      codingStandardsConfigSchema.parse({ ...detectedConfig, strictness: 'high' }),
    ).toThrow();
  });
});

describe('coding-standards rendering', () => {
  test('renders exactly the pack files and passes validation', async () => {
    const rendered = await renderCodingStandardsPack(detectedConfig);

    expect(rendered.files.map((file) => file.path)).toEqual([
      RULE_PATH,
      CODE_QUALITY_REVIEW_SKILL_PATH,
    ]);
    expect(rendered.files.every((file) => file.content.trim().length > 0)).toBe(true);
    expect(rendered.agentsBlock).toContain(`\`${RULE_PATH}\``);
    expect(rendered.agentsBlock).toContain(`\`${CODE_QUALITY_REVIEW_SKILL_PATH}\``);
    expect(rendered.agentsBlock).toContain('relative to the repository root');
    expect(rendered.agentsBlock).not.toContain('](');
    expect(rendered.files.every((file) => !file.content.includes('{{'))).toBe(true);
    expect(
      codingStandardsPack.validate(
        Object.fromEntries(rendered.files.map((file) => [file.path, file.content])),
      ),
    ).toEqual([]);
    expect(codingStandardsPack.validateAgentsBlock(rendered.agentsBlock)).toEqual([]);
  });

  test('requires a verdict for every unit of the change', async () => {
    const files = await renderFiles();
    const skill = files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '';

    expect(Object.keys(files)).toEqual([RULE_PATH, CODE_QUALITY_REVIEW_SKILL_PATH]);
    expect(skill).toContain('## Coverage');
    expect(skill).toContain('checked N units');
    expect(skill).toContain('not evidence of completeness');
    expect(skill).toContain('keeping N re-derivable from');
    expect(skill).toContain('a taste remark is not a finding');
  });

  test('states each threshold once and keeps repository references resolvable', async () => {
    const files = await renderFiles();
    const rule = files[RULE_PATH] ?? '';
    const review = files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '';
    const generated = [rule, review].join('\n');

    expect(rule).toContain('two current callers');
    expect(review).not.toContain('two current callers');
    expect(generated).not.toContain('three concrete uses');
    expect(generated).not.toContain('still-open');

    for (const content of [rule, review]) {
      for (const reference of content.match(/\.agents\/[A-Za-z0-9/._-]+/gu) ?? []) {
        expect(codingStandardsPack.filePaths).toContain(reference.replace(/[.,;:]+$/u, ''));
      }
    }
  });

  test('rejects a rule that defers to an on-demand skill', async () => {
    const files = await renderFiles();
    const rule = files[RULE_PATH] ?? '';

    for (const reference of [
      'The review procedure lives in `.agents/skills/code-quality-review/SKILL.md`.',
      'Follow the code-quality-review skill for judgment calls.',
    ]) {
      const deferring = { ...files, [RULE_PATH]: `${rule}\n${reference}\n` };

      expect(codingStandardsPack.validate(deferring)).toContain(
        `${RULE_PATH} must stand alone: it must not reference an on-demand skill`,
      );
    }
  });

  test('keeps generated prose from repeating identical sentences across files', async () => {
    const files = await renderFiles();
    const owners = new Map<string, string[]>();

    for (const [path, content] of Object.entries(files)) {
      for (const sentence of contentSentences(content)) {
        owners.set(sentence, [...(owners.get(sentence) ?? []), path]);
      }
    }

    const restated = [...owners]
      .filter(([, paths]) => new Set(paths).size > 1)
      .map(([sentence, paths]) => `${paths.join(' + ')}: ${sentence.slice(0, 80)}`);

    expect(restated).toEqual([]);
  });

  test('keeps policy owned by the artifact that owns it', async () => {
    const files = await renderFiles();
    const rule = files[RULE_PATH] ?? '';
    const review = files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '';

    expect(rule).not.toContain('check-only');
    expect(review).not.toContain('Variation with no current variant');
    expect(review).not.toContain('Extraction is per decision');
  });

  test('keeps the rule scoped to the task and independent of on-demand files', async () => {
    const files = await renderFiles();
    const rule = files[RULE_PATH] ?? '';

    expect(rule).toContain('on-demand file that may not be');
    expect(rule).toContain('Project rules and conventions still apply');
    expect(rule).not.toContain('another rule, skill, or on-demand file');
    expect(rule).toContain('without expanding the diff');
    expect(rule).toContain('report unrelated improvements instead');
    expect(rule).toContain('every change must be required by the task');
  });

  test('points design evaluation and scope at the artifact that owns them', async () => {
    const files = await renderFiles();
    const skill = files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '';
    const rendered = await renderCodingStandardsPack(detectedConfig);

    expect(skill).toContain('using the thresholds');
    expect(skill).not.toContain('KISS, YAGNI, DRY, and SOLID (the Judgment rules');
    expect(skill).toContain(
      'This skill reviews a change; apply the Coding Standards rule when you make one.',
    );
    expect(skill).toContain(
      'Reviewing a proposed refactor, a refactor plan, or a design decision.',
    );
    expect(skill).not.toContain('Refactoring existing code or planning a refactor');
    expect(rendered.agentsBlock).toContain('For reviews, use the');
    expect(rendered.agentsBlock).not.toContain('For reviews and refactors');
  });

  test('defines coverage verdicts and separates nits from taste', async () => {
    const files = await renderFiles();
    const skill = files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '';

    expect(skill).toContain('Use `n/a` only for a');
    expect(skill).toContain('unit the change cannot affect');
    expect(skill).toContain('names every `n/a` and skipped unit');
    expect(skill).toContain('a skipped group makes the review incomplete');
    expect(skill).not.toContain('Read the full diff');
    expect(skill).toContain('a concrete, low-impact defect that does not affect behavior');
    expect(skill).not.toContain('**nit**: preference only');
    expect(skill).toContain('a taste remark is not a finding');
  });

  test('keeps review guidance robust to managed files and stale baselines', async () => {
    const files = await renderFiles();
    const skill = files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '';

    expect(skill).toContain('records a rule or skill as generated or managed');
    expect(skill).toContain('unless the change under review touches the toolchain config');
    expect(skill).toContain("the Coding Standards rule's test policy is the");
    expect(skill).not.toContain('Do not delete, skip, or weaken tests');
    expect(skill).toContain('interfaces narrow');
    expect(skill).not.toContain('callers never depend on methods they do not use');
  });

  test('keeps generated lines wrapped and descriptions routing-sized', async () => {
    const files = await renderFiles();

    for (const [path, content] of Object.entries(files)) {
      const body = content.replace(/^description: .+$/mu, '');
      const overflowing = body.split('\n').filter((line) => line.length > 100);
      expect({ path, overflowing }).toEqual({ overflowing: [], path });
    }

    const skill = files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '';
    const description = /^description: (.+)$/mu.exec(skill)?.[1] ?? '';

    expect(description.startsWith('Use when')).toBe(true);
    expect(description.length).toBeLessThanOrEqual(300);
  });

  test('renders detected commands into the review skill', async () => {
    const files = await renderFiles();
    const skill = files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '';

    expect(skill).toContain('## Project baseline');
    expect(skill).toContain('- Language: typescript');
    expect(skill).toContain('- Verify: `bun run verify`');
    expect(skill).toContain('- Format (check-only): `bun run format:check`');
  });

  test('renders unknown tooling as not detected', async () => {
    const rendered = await renderCodingStandardsPack({
      commands: { format: null, lint: null, test: null, typecheck: null, verify: null },
      language: null,
      packageManager: null,
    });
    const skill =
      rendered.files.find((file) => file.path === CODE_QUALITY_REVIEW_SKILL_PATH)?.content ?? '';

    expect(skill).toContain('- Language: not detected');
    expect(skill).toContain('- Verify: not detected');
  });

  test('keeps the always-on rule inside its token budget', async () => {
    const files = await renderFiles();
    const rule = files[RULE_PATH] ?? '';

    expect(rule.length).toBeLessThanOrEqual(3000);
    expect(rule.split('\n').length).toBeLessThanOrEqual(60);
    for (const text of ['trigger: always_on', 'alwaysApply: true', ...REQUIRED_RULE_TEXTS]) {
      expect(rule).toContain(text);
    }
  });

  test('ships review guardrails for unknown repositories', async () => {
    const files = await renderFiles();
    const skill = files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '';

    for (const text of [
      'If the rule file is missing',
      'do not hand-edit',
      'check-only mode',
      '400 changed lines',
      'no tests, linter, or type checker',
      'roughly ten finding entries',
      '<file>:<line>',
    ]) {
      expect(skill).toContain(text);
    }
  });

  test('rejects stub, bloated, and unfinished rules', async () => {
    const files = await renderFiles();
    const rule = files[RULE_PATH] ?? '';
    const stub = [
      '---',
      'trigger: always_on',
      'alwaysApply: true',
      'description: Stub.',
      '---',
      '',
      ...REQUIRED_RULE_TEXTS.map((text) => `- ${text}`),
      '',
    ].join('\n');
    const stubErrors = codingStandardsPack.validate({ ...files, [RULE_PATH]: stub });

    expect(stubErrors).toContain(`${RULE_PATH} must be between 30 and 60 lines`);
    expect(stubErrors).toContain(`${RULE_PATH} must contain at least 16 guidance bullets`);

    const bloated = { ...files, [RULE_PATH]: `${rule}${'- filler bullet\n'.repeat(20)}` };
    expect(codingStandardsPack.validate(bloated)).toContain(
      `${RULE_PATH} must be between 30 and 60 lines`,
    );

    const verbose = { ...files, [RULE_PATH]: `${rule}\n${'x'.repeat(2000)}\n` };
    expect(codingStandardsPack.validate(verbose)).toContain(
      `${RULE_PATH} must stay within 3000 characters`,
    );

    const unfinished = { ...files, [RULE_PATH]: `${rule}\nTODO: add project examples\n` };
    expect(codingStandardsPack.validate(unfinished)).toContain(
      `${RULE_PATH} still contains template placeholders or unfinished text`,
    );

    const missingDescription = {
      ...files,
      [RULE_PATH]: rule.replace(/^description: .+$/mu, ''),
    };
    expect(codingStandardsPack.validate(missingDescription)).toContain(
      `${RULE_PATH} frontmatter must set a non-empty description`,
    );
  });

  test('enforces the skill description length boundary', async () => {
    const files = await renderFiles();
    const skill = files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '';
    const withDescription = (description: string): Record<string, string> => ({
      ...files,
      [CODE_QUALITY_REVIEW_SKILL_PATH]: skill.replace(
        /^description: .+$/mu,
        `description: ${description}`,
      ),
    });

    expect(codingStandardsPack.validate(withDescription(`Use when ${'x'.repeat(1015)}`))).toEqual(
      [],
    );
    expect(codingStandardsPack.validate(withDescription(`Use when ${'x'.repeat(1016)}`))).toContain(
      `${CODE_QUALITY_REVIEW_SKILL_PATH} description must be 1024 characters or fewer`,
    );
  });

  test('rejects missing files and removed principles', async () => {
    const files = await renderFiles();

    expect(codingStandardsPack.validate({})).toEqual([
      `Missing ${RULE_PATH}`,
      `Missing ${CODE_QUALITY_REVIEW_SKILL_PATH}`,
    ]);

    const withoutKiss = {
      ...files,
      [RULE_PATH]: (files[RULE_PATH] ?? '').replaceAll('KISS', 'simplicity'),
    };
    expect(codingStandardsPack.validate(withoutKiss)).toContain(
      `${RULE_PATH} is missing required guidance: KISS`,
    );

    const withoutJudgment = {
      ...files,
      [CODE_QUALITY_REVIEW_SKILL_PATH]: (files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '').replaceAll(
        'fail on the pre-fix code',
        'fail before the fix',
      ),
    };
    expect(codingStandardsPack.validate(withoutJudgment)).toContain(
      `${CODE_QUALITY_REVIEW_SKILL_PATH} is missing required guidance: fail on the pre-fix code`,
    );

    const withoutSeverity = {
      ...files,
      [CODE_QUALITY_REVIEW_SKILL_PATH]: (files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '').replace(
        '## Severity',
        '## Levels',
      ),
    };
    expect(codingStandardsPack.validate(withoutSeverity)).toContain(
      `${CODE_QUALITY_REVIEW_SKILL_PATH} is missing section: ## Severity`,
    );

    const withoutBaseline = {
      ...files,
      [CODE_QUALITY_REVIEW_SKILL_PATH]: (files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '').replace(
        '## Project baseline',
        '## Baseline',
      ),
    };
    expect(codingStandardsPack.validate(withoutBaseline)).toContain(
      `${CODE_QUALITY_REVIEW_SKILL_PATH} is missing section: ## Project baseline`,
    );

    const withoutScope = {
      ...files,
      [CODE_QUALITY_REVIEW_SKILL_PATH]: (files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '').replace(
        '## Review scope',
        '## Scope',
      ),
    };
    expect(codingStandardsPack.validate(withoutScope)).toContain(
      `${CODE_QUALITY_REVIEW_SKILL_PATH} is missing section: ## Review scope`,
    );

    const withoutCoverage = {
      ...files,
      [CODE_QUALITY_REVIEW_SKILL_PATH]: (files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '').replace(
        '## Coverage',
        '## Reading',
      ),
    };
    expect(codingStandardsPack.validate(withoutCoverage)).toContain(
      `${CODE_QUALITY_REVIEW_SKILL_PATH} is missing section: ## Coverage`,
    );
  });

  test('rejects structurally invalid generated skills', async () => {
    const files = await renderFiles();
    const rule = files[RULE_PATH] ?? '';
    const skill = files[CODE_QUALITY_REVIEW_SKILL_PATH] ?? '';

    const withoutFrontmatter = {
      ...files,
      [CODE_QUALITY_REVIEW_SKILL_PATH]: skill.replace(/^---\n[\s\S]*?\n---\n/u, ''),
    };
    expect(codingStandardsPack.validate(withoutFrontmatter)).toContain(
      `${CODE_QUALITY_REVIEW_SKILL_PATH} must start with frontmatter declaring name and description`,
    );

    const renamed = {
      ...files,
      [CODE_QUALITY_REVIEW_SKILL_PATH]: skill.replace(
        'name: code-quality-review',
        'name: style-review',
      ),
    };
    expect(codingStandardsPack.validate(renamed)).toContain(
      `${CODE_QUALITY_REVIEW_SKILL_PATH} must declare name: code-quality-review`,
    );

    const vagueDescription = {
      ...files,
      [CODE_QUALITY_REVIEW_SKILL_PATH]: skill.replace(
        'description: Use when reviewing',
        'description: Helps with code reviews and',
      ),
    };
    expect(codingStandardsPack.validate(vagueDescription)).toContain(
      `${CODE_QUALITY_REVIEW_SKILL_PATH} description must state when the skill applies`,
    );

    const relativeLink = {
      ...files,
      [CODE_QUALITY_REVIEW_SKILL_PATH]: skill.replace(
        "Apply the project's Coding Standards rule in",
        '[Coding Standards](./.agents/rules/coding-standards.mdc)',
      ),
    };
    expect(codingStandardsPack.validate(relativeLink)).toContain(
      `${CODE_QUALITY_REVIEW_SKILL_PATH} must reference repository paths as inline code, not relative links`,
    );

    const unfinished = {
      ...files,
      [CODE_QUALITY_REVIEW_SKILL_PATH]: `${skill}\nTODO: add project examples\n`,
    };
    expect(codingStandardsPack.validate(unfinished)).toContain(
      `${CODE_QUALITY_REVIEW_SKILL_PATH} still contains template placeholders or unfinished text`,
    );

    const generatorLeak = {
      ...files,
      [CODE_QUALITY_REVIEW_SKILL_PATH]: `${skill}\nRun \`acli configure coding-standards\` before review.\n`,
    };
    expect(codingStandardsPack.validate(generatorLeak)).toContain(
      `${CODE_QUALITY_REVIEW_SKILL_PATH} must not reference the generator tool: acli`,
    );

    const ruleGeneratorLeak = {
      ...files,
      [RULE_PATH]: `${rule}\nRead \`.agents/.agent-config-state.json\` before editing.\n`,
    };
    expect(codingStandardsPack.validate(ruleGeneratorLeak)).toContain(
      `${RULE_PATH} must not reference the generator tool: .agent-config`,
    );

    const withoutRuleFrontmatter = {
      ...files,
      [RULE_PATH]: (files[RULE_PATH] ?? '').replace(/^---\n[\s\S]*?\n---\n/u, ''),
    };
    expect(codingStandardsPack.validate(withoutRuleFrontmatter)).toContain(
      `${RULE_PATH} must start with YAML frontmatter`,
    );

    const nonAlwaysOn = {
      ...files,
      [RULE_PATH]: (files[RULE_PATH] ?? '').replace(
        'trigger: always_on',
        'trigger: model_decision',
      ),
    };
    expect(codingStandardsPack.validate(nonAlwaysOn)).toContain(
      `${RULE_PATH} frontmatter must set trigger: always_on`,
    );
  });

  test('requires AGENTS block references to generated files as inline code', async () => {
    expect(
      codingStandardsPack.validateAgentsBlock(
        '[Coding Standards](.agents/rules/coding-standards.mdc)',
      ),
    ).toEqual([
      `AGENTS block must reference ${RULE_PATH} as inline code`,
      `AGENTS block must reference ${CODE_QUALITY_REVIEW_SKILL_PATH} as inline code`,
    ]);
    expect(codingStandardsPack.validateAgentsBlock('No links.')).toEqual([
      `AGENTS block must reference ${RULE_PATH} as inline code`,
      `AGENTS block must reference ${CODE_QUALITY_REVIEW_SKILL_PATH} as inline code`,
    ]);
    expect(
      codingStandardsPack.validateAgentsBlock(
        `Read \`${RULE_PATH}\`.\nUse \`${CODE_QUALITY_REVIEW_SKILL_PATH}\`.`,
      ),
    ).toEqual([]);
  });

  test('is registered and validates config before rendering', async () => {
    const registered = getPack('coding-standards');

    expect(registered.id).toBe('coding-standards');
    expect(registered.filePaths).toEqual([RULE_PATH, CODE_QUALITY_REVIEW_SKILL_PATH]);
    expect((await registered.render(detectedConfig)).files.map((file) => file.path)).toEqual([
      ...registered.filePaths,
    ]);
    await expect(registered.render({ unknown: true })).rejects.toThrow();
  });

  test('ships an agent generation guide with required guidance', async () => {
    const guide = await readCodingStandardsAgentGuide();

    expect(codingStandardsPack.validateAgentGuide(guide)).toEqual([]);
    expect(codingStandardsPack.validateAgentGuide('Stub guide')).not.toEqual([]);
    expect(guide).toContain('Do not create commits');
    expect(guide).toContain('acli agent adopt coding-standards');
  });
});
