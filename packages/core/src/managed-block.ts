const markersFor = (id: string): { end: string; start: string } => ({
  start: `<!-- agent-config:${id}:start -->`,
  end: `<!-- agent-config:${id}:end -->`,
});

const findMarkers = (
  content: string,
  id: string,
): { endIndex: number; endMarker: string; startIndex: number; startMarker: string } | undefined => {
  const { end, start } = markersFor(id);
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);

  if (startIndex === -1 && endIndex === -1) {
    return undefined;
  }

  if (
    startIndex === -1 ||
    endIndex === -1 ||
    startIndex > endIndex ||
    content.lastIndexOf(start) !== startIndex ||
    content.lastIndexOf(end) !== endIndex
  ) {
    throw new Error(`Managed block markers for ${id} are malformed`);
  }

  return { endIndex, endMarker: end, startIndex, startMarker: start };
};

export const extractManagedBlock = (content: string, id: string): string | undefined => {
  const markers = findMarkers(content, id);
  if (!markers) {
    return undefined;
  }

  return content
    .slice(markers.startIndex + markers.startMarker.length, markers.endIndex)
    .replace(/^\r?\n/, '')
    .replace(/\r?\n$/, '');
};

export const upsertManagedBlock = (content: string, id: string, body: string): string => {
  const { end, start } = markersFor(id);
  const block = `${start}\n${body.trimEnd()}\n${end}`;
  const markers = findMarkers(content, id);

  if (!markers) {
    const prefix = content.trimEnd();
    return prefix ? `${prefix}\n\n${block}\n` : `${block}\n`;
  }

  return `${content.slice(0, markers.startIndex)}${block}${content.slice(
    markers.endIndex + markers.endMarker.length,
  )}`;
};
