import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PackRenderResult } from '@cocasts/agent-config-core';
import { renderTemplate } from '@cocasts/agent-config-core';
import { type CodingStandardsConfig, codingStandardsConfigSchema } from './schema.ts';

export const codingStandardsTemplateRoot = fileURLToPath(new URL('./templates', import.meta.url));
const defaultGuidePath = fileURLToPath(new URL('./agent-guide.md', import.meta.url));

export const RULE_PATH = '.agents/rules/coding-standards.mdc';
export const CODE_QUALITY_REVIEW_SKILL_PATH = '.agents/skills/code-quality-review/SKILL.md';

const NOT_DETECTED = 'not detected';

const readTemplate = (templateRoot: string, name: string): Promise<string> =>
  readFile(resolve(templateRoot, name), 'utf8');

const commandValue = (command: string | null): string =>
  command === null ? NOT_DETECTED : `\`${command}\``;

export const renderCodingStandardsPack = async (
  config: CodingStandardsConfig,
  templateRoot = codingStandardsTemplateRoot,
): Promise<PackRenderResult> => {
  const parsedConfig = codingStandardsConfigSchema.parse(config);
  const [ruleTemplate, reviewSkillTemplate, agentsTemplate] = await Promise.all([
    readTemplate(templateRoot, 'coding-standards.mdc.tpl'),
    readTemplate(templateRoot, 'code-quality-review.SKILL.md.tpl'),
    readTemplate(templateRoot, 'coding-standards.agents-block.md.tpl'),
  ]);

  return {
    agentsBlock: renderTemplate(agentsTemplate, {}),
    files: [
      { content: renderTemplate(ruleTemplate, {}), path: RULE_PATH },
      {
        content: renderTemplate(reviewSkillTemplate, {
          FORMAT_COMMAND: commandValue(parsedConfig.commands.format),
          LANGUAGE: parsedConfig.language ?? NOT_DETECTED,
          LINT_COMMAND: commandValue(parsedConfig.commands.lint),
          PACKAGE_MANAGER: parsedConfig.packageManager ?? NOT_DETECTED,
          TEST_COMMAND: commandValue(parsedConfig.commands.test),
          TYPECHECK_COMMAND: commandValue(parsedConfig.commands.typecheck),
          VERIFY_COMMAND: commandValue(parsedConfig.commands.verify),
        }),
        path: CODE_QUALITY_REVIEW_SKILL_PATH,
      },
    ],
  };
};

export const readCodingStandardsAgentGuide = (path = defaultGuidePath): Promise<string> =>
  readFile(path, 'utf8');
