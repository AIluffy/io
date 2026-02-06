export default function rehypeSortable() {
  return (tree) => {
    let scriptInserted = false;

    const visit = (node, parent) => {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'element' && node.tagName === 'table') {
        const thead = node.children?.find(
          (child) => child?.type === 'element' && child.tagName === 'thead',
        );
        const hasHeader = Boolean(thead);

        if (hasHeader) {
          node.properties = node.properties ?? {};
          node.properties['data-io-sortable'] = 'true';

          const headerRow = thead.children?.find(
            (child) => child?.type === 'element' && child.tagName === 'tr',
          );
          const headerCells = headerRow?.children?.filter(
            (child) => child?.type === 'element' && child.tagName === 'th',
          );

          if (headerCells?.length) {
            headerCells.forEach((th, index) => {
              th.properties = th.properties ?? {};
              th.properties['data-io-sort-col'] = String(index);
              th.properties['tabIndex'] = 0;
              th.properties['role'] = 'button';
              th.properties['aria-sort'] = 'none';
            });
          }

          if (!scriptInserted && parent?.children?.length) {
            scriptInserted = true;
            const idx = parent.children.indexOf(node);
            if (idx !== -1) {
              parent.children.splice(idx + 1, 0, {
                type: 'element',
                tagName: 'script',
                properties: { type: 'module' },
                children: [
                  {
                    type: 'text',
                    value: `
const getCellText = (cell) => (cell?.textContent ?? '').trim();
const parseMaybeNumber = (value) => {
  const trimmed = value.trim();
  const match = trimmed.match(/^([0-9]+(?:\\.[0-9]+)?)\\s*(B|kB|KB|MB|mB)?$/);
  if (match) {
    const n = Number(match[1]);
    if (!Number.isFinite(n)) return null;
    const unit = match[2] ?? '';
    const factor =
      unit === 'MB' || unit === 'mB'
        ? 1024 * 1024
        : unit === 'kB' || unit === 'KB'
          ? 1024
          : 1;
    return n * factor;
  }
  const normalized = trimmed.replace(/[,\\s]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};
const compare = (a, b, dir) => {
  if (a === b) return 0;
  return a > b ? dir : -dir;
};
const sortTable = (table, colIndex, dir) => {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const withKey = rows.map((row, i) => {
    const cell = row.children?.[colIndex];
    const raw = getCellText(cell);
    const numeric = parseMaybeNumber(raw);
    return { row, i, raw, numeric };
  });
  const allNumeric = withKey.every((x) => x.numeric !== null);
  withKey.sort((x, y) => {
    const a = allNumeric ? x.numeric : x.raw.toLowerCase();
    const b = allNumeric ? y.numeric : y.raw.toLowerCase();
    const primary = compare(a, b, dir);
    return primary !== 0 ? primary : x.i - y.i;
  });
  const frag = document.createDocumentFragment();
  withKey.forEach((x) => frag.appendChild(x.row));
  tbody.appendChild(frag);
};
const setAriaSort = (table, activeCol, dir) => {
  const headers = table.querySelectorAll('thead th[data-io-sort-col]');
  headers.forEach((th) => {
    const col = Number(th.getAttribute('data-io-sort-col'));
    if (col === activeCol) {
      th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
    } else {
      th.setAttribute('aria-sort', 'none');
    }
  });
};
const init = () => {
  const tables = document.querySelectorAll('table[data-io-sortable="true"]');
  tables.forEach((table) => {
    const headers = table.querySelectorAll('thead th[data-io-sort-col]');
    headers.forEach((th) => {
      const col = Number(th.getAttribute('data-io-sort-col'));
      const onActivate = () => {
        const current = th.getAttribute('aria-sort');
        const dir = current === 'ascending' ? -1 : 1;
        sortTable(table, col, dir);
        setAriaSort(table, col, dir);
      };
      th.addEventListener('click', onActivate);
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      });
    });
  });
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
`,
                  },
                ],
              });
            }
          }
        }
      }

      const children = node.children;
      if (Array.isArray(children)) {
        children.forEach((child) => visit(child, node));
      }
    };

    visit(tree, null);
  };
}
