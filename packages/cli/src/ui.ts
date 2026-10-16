import type { PreparedFileChange } from '@cocasts/agent-config-core';
import chalk from 'chalk';

export interface ScopeMapping {
  path: string;
  scope: string;
}

export interface SpinnerLike {
  start: (message?: string) => void;
  stop: (message?: string, code?: number) => void;
}

export const runWithSpinner = async <Result>(
  progress: SpinnerLike,
  startingMessage: string,
  successMessage: string,
  operation: () => Promise<Result>,
): Promise<Result> => {
  progress.start(startingMessage);
  try {
    const result = await operation();
    progress.stop(successMessage);
    return result;
  } catch (error) {
    progress.stop('Failed', 1);
    throw error;
  }
};

export const parseCommaList = (input: unknown): string[] => {
  if (typeof input !== 'string' || !input.trim()) {
    return [];
  }

  return input
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const parseScopeMappings = (input: unknown): ScopeMapping[] => {
  if (typeof input !== 'string' || !input.trim()) {
    return [];
  }

  return input.split(',').map((entry) => {
    const separator = entry.indexOf('=');
    const path = separator === -1 ? '' : entry.slice(0, separator).trim();
    const scope = separator === -1 ? '' : entry.slice(separator + 1).trim();
    if (!path || !scope) {
      throw new Error('Use path=scope entries separated by commas');
    }
    return { path, scope };
  });
};

export const formatScopeMappings = (mappings: readonly ScopeMapping[]): string =>
  mappings.map(({ path, scope }) => `${path}=${scope}`).join(', ');

const prefixedLines = (content: string, prefix: '- ' | '+ '): string[] =>
  content
    .trimEnd()
    .split('\n')
    .filter((line, index, lines) => line || lines.length > 1 || index > 0)
    .map((line) => `${prefix}${line}`);

export const formatPlan = (changes: readonly PreparedFileChange[]): string =>
  changes
    .map((change) => {
      const heading = chalk.bold(`[${change.status}] ${change.path}`);
      if (change.status === 'unchanged') {
        return heading;
      }
      const removed =
        change.before === undefined
          ? []
          : prefixedLines(change.before, '- ').map((line) => chalk.red(line));
      const added = prefixedLines(change.content, '+ ').map((line) => chalk.green(line));
      return [heading, ...removed, ...added].join('\n');
    })
    .join('\n\n');
