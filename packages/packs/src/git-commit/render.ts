import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type RenderedFile, renderTemplate } from '@cocasts/agent-config-core';
import { type GitCommitConfig, gitCommitConfigSchema } from './schema.ts';

export interface GitCommitRenderResult {
  agentsBlock: string;
  files: readonly RenderedFile[];
}

const defaultTemplateRoot = fileURLToPath(new URL('./templates', import.meta.url));
const defaultGuidePath = fileURLToPath(new URL('./agent-guide.md', import.meta.url));

const readTemplate = (templateRoot: string, name: string): Promise<string> =>
  readFile(resolve(templateRoot, name), 'utf8');

const formatScopeMappings = (config: GitCommitConfig): string =>
  config.scopes.length === 0
    ? '- No workspace-specific scopes were detected; confirm scopes before committing.'
    : config.scopes.map(({ path, scope }) => `- Use \`${scope}\` for \`${path}\`.`).join('\n');

const formatExtraScopes = (config: GitCommitConfig): string =>
  config.extraScopes.length === 0
    ? ''
    : `- Additional project scopes: ${config.extraScopes.map((scope) => `\`${scope}\``).join(', ')}.\n`;

export const renderGitCommitPack = async (
  config: GitCommitConfig,
  templateRoot = defaultTemplateRoot,
): Promise<GitCommitRenderResult> => {
  const parsedConfig = gitCommitConfigSchema.parse(config);
  const [ruleTemplate, skillTemplate, agentsTemplate] = await Promise.all([
    readTemplate(templateRoot, 'git-commit.mdc.tpl'),
    readTemplate(templateRoot, 'smart-commit.SKILL.md.tpl'),
    readTemplate(templateRoot, 'agents-block.md.tpl'),
  ]);

  return {
    agentsBlock: renderTemplate(agentsTemplate, {}),
    files: [
      {
        content: renderTemplate(ruleTemplate, {
          AGENTS_SCOPE: parsedConfig.agentsScope,
          DOCS_SCOPE: parsedConfig.docsScope,
          EXTRA_SCOPES: formatExtraScopes(parsedConfig),
          ROOT_SCOPE: parsedConfig.rootScope,
          SCOPE_MAPPINGS: formatScopeMappings(parsedConfig),
        }),
        path: '.agents/rules/git-commit.mdc',
      },
      {
        content: renderTemplate(skillTemplate, {}),
        path: '.agents/skills/smart-commit/SKILL.md',
      },
    ],
  };
};

export const readGitCommitAgentGuide = (path = defaultGuidePath): Promise<string> =>
  readFile(path, 'utf8');
