import { describe, expect, test } from 'bun:test';
import { formatPlan, parseCommaList, parseScopeMappings, runWithSpinner } from '../src/ui.ts';

describe('CLI input and plan formatting', () => {
  test('parses editable path-to-scope mappings', () => {
    expect(parseScopeMappings('apps/dip-api=api, packages/dip-ui=ui')).toEqual([
      { path: 'apps/dip-api', scope: 'api' },
      { path: 'packages/dip-ui', scope: 'ui' },
    ]);
    expect(() => parseScopeMappings('missing-separator')).toThrow(
      'Use path=scope entries separated by commas',
    );
  });

  test('treats an empty optional text prompt as an empty list', () => {
    expect(parseCommaList(undefined)).toEqual([]);
    expect(parseCommaList(' infra, docs ,, ')).toEqual(['infra', 'docs']);
  });

  test('formats a complete colored-file plan', () => {
    const output = formatPlan([
      {
        before: 'old\n',
        content: 'new\n',
        nextHash: 'next',
        observedHash: 'old',
        path: 'file.txt',
        status: 'update',
      },
    ]);

    expect(output).toContain('[update] file.txt');
    expect(output).toContain('- old');
    expect(output).toContain('+ new');
  });

  test('stops a spinner with failure before rethrowing', async () => {
    const events: Array<unknown> = [];
    const progress = {
      start: (message?: string) => events.push(['start', message]),
      stop: (message?: string, code?: number) => events.push(['stop', message, code]),
    };

    await expect(
      runWithSpinner(progress, 'Starting', 'Finished', async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect(events).toEqual([
      ['start', 'Starting'],
      ['stop', 'Failed', 1],
    ]);
  });
});
