const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

const validateTemplateSyntax = (template: string): void => {
  let cursor = 0;
  while (cursor < template.length) {
    if (template.startsWith('{{', cursor)) {
      const end = template.indexOf('}}', cursor + 2);
      const token = end === -1 ? template.slice(cursor) : template.slice(cursor, end + 2);
      if (end === -1 || !/^\{\{[A-Z][A-Z0-9_]*\}\}$/.test(token)) {
        throw new Error(`Unresolved template placeholder: ${token}`);
      }
      cursor = end + 2;
      continue;
    }

    if (template.startsWith('}}', cursor)) {
      throw new Error(`Unresolved template placeholder: ${template.slice(cursor, cursor + 2)}`);
    }

    cursor += 1;
  }
};

export const renderTemplate = (
  template: string,
  values: Readonly<Record<string, string>>,
): string => {
  validateTemplateSyntax(template);
  const rendered = template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`Missing template value: ${key}`);
    }
    return value;
  });

  const unresolved = rendered.match(/\{\{[^{}]*\}\}/)?.[0];
  if (unresolved) {
    throw new Error(`Unresolved template placeholder: ${unresolved}`);
  }

  return rendered;
};
