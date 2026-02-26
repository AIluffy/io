const INDEX_KEY_PATTERN = /^[0-9]+$/;

export function isIndexKey(prop: PropertyKey): prop is string {
  return typeof prop === 'string' && INDEX_KEY_PATTERN.test(prop);
}
