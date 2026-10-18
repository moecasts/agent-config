import { chmod, cp, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assembleAgentConfigurator, validateAgentConfigurator } from '@cocasts/agent-config-agent';
import { packIds, packTemplateRoots } from '@cocasts/agent-config-packs';

const packageRoot = resolve(import.meta.dir, '..');
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

// Pack templates are read at runtime relative to dist/cli.js, so every pack
// contributes uniquely named templates to one flat directory. Only `.tpl` files
// ship: a stray editor or OS file must not fail the duplicate-name guard.
const templatesDestination = resolve(outdir, 'templates');
await mkdir(templatesDestination, { recursive: true });
const copiedTemplates = new Set<string>();
for (const packId of packIds) {
  const sourceRoot = packTemplateRoots[packId];
  const files = (await readdir(sourceRoot)).filter((file) => file.endsWith('.tpl'));
  for (const file of files) {
    if (copiedTemplates.has(file)) {
      throw new Error(`Duplicate pack template name: ${file}`);
    }
    copiedTemplates.add(file);
    await cp(resolve(sourceRoot, file), resolve(templatesDestination, file));
  }
}

const agentSkillDestination = resolve(outdir, 'assets/agent-skill/agent-configurator');
await assembleAgentConfigurator(agentSkillDestination);
const agentSkillErrors = await validateAgentConfigurator(agentSkillDestination);
if (agentSkillErrors.length > 0) {
  throw new Error(`Invalid agent-configurator skill:\n${agentSkillErrors.join('\n')}`);
}
