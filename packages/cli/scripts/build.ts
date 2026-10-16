import { access, chmod, cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assembleAgentConfigurator, validateAgentConfigurator } from '@cocasts/agent-config-agent';

const packageRoot = resolve(import.meta.dir, '..');
const workspaceRoot = resolve(packageRoot, '../..');
const outdir = resolve(packageRoot, 'dist');

await rm(outdir, { force: true, recursive: true });
await mkdir(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: [resolve(packageRoot, 'src/cli.ts')],
  outdir,
  target: 'node',
  format: 'esm',
  banner: '#!/usr/bin/env node',
  naming: 'cli.js',
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

await chmod(resolve(outdir, 'cli.js'), 0o755);

const copyIfPresent = async (source: string, destination: string): Promise<void> => {
  try {
    await access(source);
  } catch {
    return;
  }

  await cp(source, destination, { recursive: true });
};

await copyIfPresent(
  resolve(workspaceRoot, 'packages/packs/src/git-commit/templates'),
  resolve(outdir, 'templates'),
);
const agentSkillDestination = resolve(outdir, 'assets/agent-skill/agent-configurator');
await assembleAgentConfigurator(agentSkillDestination);
const agentSkillErrors = await validateAgentConfigurator(agentSkillDestination);
if (agentSkillErrors.length > 0) {
  throw new Error(`Invalid agent-configurator skill:\n${agentSkillErrors.join('\n')}`);
}
