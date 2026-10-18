import { z } from 'zod';

const commandSchema = z.string().min(1).nullable();

/**
 * Detected project facts. They specialize the on-demand review skill with the
 * real baseline commands; the always-on rule stays language-neutral so it
 * remains portable across repositories.
 */
export const codingStandardsConfigSchema = z.strictObject({
  commands: z.strictObject({
    format: commandSchema,
    lint: commandSchema,
    test: commandSchema,
    typecheck: commandSchema,
    verify: commandSchema,
  }),
  language: z.string().min(1).nullable(),
  packageManager: z.string().min(1).nullable(),
});

export type CodingStandardsConfig = z.infer<typeof codingStandardsConfigSchema>;
