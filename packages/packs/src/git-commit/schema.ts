import { z } from 'zod';

const scopeNameSchema = z.string().regex(/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/);
const repositoryPathSchema = z
  .string()
  .regex(
    /^(?!\.{1,2}(?:\/|$))(?!.*\/\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/,
    'Path must be a normalized repository-relative path',
  );

export const gitCommitConfigSchema = z
  .object({
    agentsScope: scopeNameSchema,
    docsScope: scopeNameSchema,
    extraScopes: z.array(scopeNameSchema),
    rootScope: scopeNameSchema,
    scopes: z.array(
      z.object({
        path: repositoryPathSchema,
        scope: scopeNameSchema,
      }),
    ),
  })
  .superRefine((config, context) => {
    const paths = new Set<string>();
    const scopes = new Set<string>();

    for (const [index, mapping] of config.scopes.entries()) {
      if (paths.has(mapping.path)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate workspace path: ${mapping.path}`,
          path: ['scopes', index, 'path'],
        });
      }
      if (scopes.has(mapping.scope)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate workspace scope: ${mapping.scope}`,
          path: ['scopes', index, 'scope'],
        });
      }
      paths.add(mapping.path);
      scopes.add(mapping.scope);
    }

    for (const [index, scope] of config.extraScopes.entries()) {
      if (scopes.has(scope)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate extra scope: ${scope}`,
          path: ['extraScopes', index],
        });
      }
      scopes.add(scope);
    }
  });

export type GitCommitConfig = z.infer<typeof gitCommitConfigSchema>;
