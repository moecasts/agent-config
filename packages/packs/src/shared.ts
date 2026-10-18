/**
 * Generated rule and skill files ship into the target repository, so they must
 * stand alone. They cannot tell a coding agent to run the generator (`acli`) or
 * to read its state files.
 */
const GENERATOR_REFERENCE_PATTERN = /\bacli\b|\.agent-config/u;

export const collectGeneratorReferences = (path: string, content: string): readonly string[] => {
  const match = content.match(GENERATOR_REFERENCE_PATTERN);
  return match === null ? [] : [`${path} must not reference the generator tool: ${match[0]}`];
};
