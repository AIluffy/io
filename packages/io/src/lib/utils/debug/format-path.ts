export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return '<root>';
  return path.map((segment) => String(segment)).join('.');
}
